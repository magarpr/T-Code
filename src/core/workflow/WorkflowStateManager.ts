import * as path from "path"
import * as fs from "fs/promises"
import { EventEmitter } from "events"

import {
	type WorkflowState,
	type WorkflowStageState,
	type WorkflowStageStatus,
	type WorkflowEvent,
	type WorkflowEventType,
	WORKFLOW_STAGE_STATUS,
	WORKFLOW_EVENTS,
} from "@roo-code/types"

import { fileExistsAtPath } from "../../utils/fs"
import { logger } from "../../utils/logging"
import { safeWriteJson } from "../../utils/safeWriteJson"

/**
 * Manages workflow execution state and persistence
 */
export class WorkflowStateManager extends EventEmitter {
	private states: Map<string, WorkflowState> = new Map()
	private persistencePath: string

	constructor(globalStoragePath: string) {
		super()
		this.persistencePath = path.join(globalStoragePath, "workflows")
		this.initializePersistence()
	}

	/**
	 * Initialize persistence directory
	 */
	private async initializePersistence(): Promise<void> {
		try {
			await fs.mkdir(this.persistencePath, { recursive: true })
		} catch (error) {
			logger.error("Failed to create workflow persistence directory", {
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	/**
	 * Create a new workflow state
	 */
	public createWorkflowState(
		id: string,
		name: string,
		parentTaskId?: string,
		initialContext?: Record<string, any>,
	): WorkflowState {
		const state: WorkflowState = {
			id,
			name,
			status: WORKFLOW_STAGE_STATUS.PENDING,
			stages: {},
			currentStages: [],
			completedStages: [],
			failedStages: [],
			startedAt: Date.now(),
			parentTaskId,
			context: initialContext || {},
		}

		this.states.set(id, state)
		this.emitEvent(WORKFLOW_EVENTS.WORKFLOW_STARTED, id, { name })
		this.persistState(id).catch((error) => {
			logger.error("Failed to persist workflow state", { id, error })
		})

		return state
	}

	/**
	 * Get workflow state by ID
	 */
	public getWorkflowState(id: string): WorkflowState | undefined {
		return this.states.get(id)
	}

	/**
	 * Update workflow status
	 */
	public updateWorkflowStatus(id: string, status: WorkflowStageStatus): void {
		const state = this.states.get(id)
		if (!state) {
			logger.error("Workflow state not found", { id })
			return
		}

		state.status = status

		if (status === WORKFLOW_STAGE_STATUS.COMPLETED || status === WORKFLOW_STAGE_STATUS.FAILED) {
			state.completedAt = Date.now()
			const eventType =
				status === WORKFLOW_STAGE_STATUS.COMPLETED
					? WORKFLOW_EVENTS.WORKFLOW_COMPLETED
					: WORKFLOW_EVENTS.WORKFLOW_FAILED
			this.emitEvent(eventType, id, {
				duration: state.completedAt - state.startedAt,
			})
		}

		this.persistState(id).catch((error) => {
			logger.error("Failed to persist workflow state", { id, error })
		})
	}

	/**
	 * Create or update a stage state
	 */
	public updateStageState(workflowId: string, stageName: string, updates: Partial<WorkflowStageState>): void {
		const workflow = this.states.get(workflowId)
		if (!workflow) {
			logger.error("Workflow state not found", { workflowId })
			return
		}

		const currentState = workflow.stages[stageName] || {
			name: stageName,
			status: WORKFLOW_STAGE_STATUS.PENDING,
			agent: updates.agent || "",
			retryCount: 0,
		}

		// Update stage state
		workflow.stages[stageName] = {
			...currentState,
			...updates,
		}

		// Handle status transitions
		const newStatus = updates.status
		if (newStatus) {
			this.handleStageStatusChange(workflow, stageName, newStatus)
		}

		this.persistState(workflowId).catch((error) => {
			logger.error("Failed to persist workflow state", { workflowId, error })
		})
	}

	/**
	 * Handle stage status changes
	 */
	private handleStageStatusChange(workflow: WorkflowState, stageName: string, newStatus: WorkflowStageStatus): void {
		const stage = workflow.stages[stageName]

		switch (newStatus) {
			case WORKFLOW_STAGE_STATUS.IN_PROGRESS:
				if (!workflow.currentStages.includes(stageName)) {
					workflow.currentStages.push(stageName)
				}
				stage.startedAt = Date.now()
				this.emitEvent(WORKFLOW_EVENTS.STAGE_STARTED, workflow.id, {
					stageName,
					agent: stage.agent,
				})
				break

			case WORKFLOW_STAGE_STATUS.COMPLETED:
				workflow.currentStages = workflow.currentStages.filter((s) => s !== stageName)
				if (!workflow.completedStages.includes(stageName)) {
					workflow.completedStages.push(stageName)
				}
				stage.completedAt = Date.now()
				this.emitEvent(WORKFLOW_EVENTS.STAGE_COMPLETED, workflow.id, {
					stageName,
					agent: stage.agent,
					duration: stage.completedAt - (stage.startedAt || 0),
				})
				break

			case WORKFLOW_STAGE_STATUS.FAILED:
				workflow.currentStages = workflow.currentStages.filter((s) => s !== stageName)
				if (!workflow.failedStages.includes(stageName)) {
					workflow.failedStages.push(stageName)
				}
				stage.completedAt = Date.now()
				this.emitEvent(WORKFLOW_EVENTS.STAGE_FAILED, workflow.id, {
					stageName,
					agent: stage.agent,
					error: stage.error,
				})
				break

			case WORKFLOW_STAGE_STATUS.SKIPPED:
				workflow.currentStages = workflow.currentStages.filter((s) => s !== stageName)
				break
		}
	}

	/**
	 * Update workflow context
	 */
	public updateContext(workflowId: string, updates: Record<string, any>): void {
		const workflow = this.states.get(workflowId)
		if (!workflow) {
			logger.error("Workflow state not found", { workflowId })
			return
		}

		workflow.context = {
			...workflow.context,
			...updates,
		}

		this.persistState(workflowId).catch((error) => {
			logger.error("Failed to persist workflow state", { workflowId, error })
		})
	}

	/**
	 * Get workflow context
	 */
	public getContext(workflowId: string): Record<string, any> | undefined {
		return this.states.get(workflowId)?.context
	}

	/**
	 * Emit workflow event
	 */
	private emitEvent(type: WorkflowEventType, workflowId: string, data: Record<string, any>): void {
		const event: WorkflowEvent = {
			type,
			workflowId,
			timestamp: Date.now(),
			data,
		}

		this.emit("workflow:event", event)
		logger.info("Workflow event", { type, workflowId, data })
	}

	/**
	 * Persist workflow state to disk
	 */
	private async persistState(workflowId: string): Promise<void> {
		const state = this.states.get(workflowId)
		if (!state) {
			return
		}

		const filePath = path.join(this.persistencePath, `${workflowId}.json`)
		await safeWriteJson(filePath, state)
	}

	/**
	 * Load workflow state from disk
	 */
	public async loadState(workflowId: string): Promise<WorkflowState | undefined> {
		const filePath = path.join(this.persistencePath, `${workflowId}.json`)

		if (!(await fileExistsAtPath(filePath))) {
			return undefined
		}

		try {
			const content = await fs.readFile(filePath, "utf-8")
			const state = JSON.parse(content) as WorkflowState
			this.states.set(workflowId, state)
			return state
		} catch (error) {
			logger.error("Failed to load workflow state", {
				workflowId,
				error: error instanceof Error ? error.message : String(error),
			})
			return undefined
		}
	}

	/**
	 * List all workflow IDs
	 */
	public async listWorkflows(): Promise<string[]> {
		try {
			const files = await fs.readdir(this.persistencePath)
			return files.filter((file) => file.endsWith(".json")).map((file) => file.replace(".json", ""))
		} catch (error) {
			logger.error("Failed to list workflows", {
				error: error instanceof Error ? error.message : String(error),
			})
			return []
		}
	}

	/**
	 * Delete workflow state
	 */
	public async deleteState(workflowId: string): Promise<void> {
		this.states.delete(workflowId)

		const filePath = path.join(this.persistencePath, `${workflowId}.json`)
		try {
			await fs.unlink(filePath)
		} catch (error) {
			// File might not exist
			logger.debug("Failed to delete workflow state file", { workflowId, error })
		}
	}

	/**
	 * Get active workflows
	 */
	public getActiveWorkflows(): WorkflowState[] {
		return Array.from(this.states.values()).filter((state) => state.status === WORKFLOW_STAGE_STATUS.IN_PROGRESS)
	}

	/**
	 * Clean up completed workflows older than specified days
	 */
	public async cleanupOldWorkflows(daysToKeep: number = 30): Promise<number> {
		const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000
		let deletedCount = 0

		const workflowIds = await this.listWorkflows()

		for (const workflowId of workflowIds) {
			const state = await this.loadState(workflowId)
			if (state && state.completedAt && state.completedAt < cutoffTime) {
				await this.deleteState(workflowId)
				deletedCount++
			}
		}

		logger.info(`Cleaned up ${deletedCount} old workflows`)
		return deletedCount
	}
}
