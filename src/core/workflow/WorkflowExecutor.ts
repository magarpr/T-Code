import { EventEmitter } from "events"
import * as crypto from "crypto"

import {
	type WorkflowConfig,
	type WorkflowState,
	type WorkflowStage,
	type WorkflowExecutionOptions,
	type WorkflowExecutionResult,
	type WorkflowStageStatus,
	WORKFLOW_STAGE_STATUS,
	WORKFLOW_STRATEGIES,
} from "@roo-code/types"

import { Task } from "../task/Task"
import { ClineProvider } from "../webview/ClineProvider"
import { WorkflowStateManager } from "./WorkflowStateManager"
import { logger } from "../../utils/logging"
import { getModeBySlug } from "../../shared/modes"

/**
 * Executes workflows by coordinating agents and managing state
 */
export class WorkflowExecutor extends EventEmitter {
	private stateManager: WorkflowStateManager
	private provider: ClineProvider
	private runningWorkflows: Map<string, WorkflowExecutionContext> = new Map()

	constructor(provider: ClineProvider, globalStoragePath: string) {
		super()
		this.provider = provider
		this.stateManager = new WorkflowStateManager(globalStoragePath)

		// Forward state manager events
		this.stateManager.on("workflow:event", (event) => {
			this.emit("workflow:event", event)
		})
	}

	/**
	 * Execute a workflow
	 */
	public async executeWorkflow(
		config: WorkflowConfig,
		options: WorkflowExecutionOptions = {},
	): Promise<WorkflowExecutionResult> {
		const workflowId = options.workflowId || crypto.randomUUID()

		// Load existing state or create new
		let state = await this.stateManager.loadState(workflowId)
		if (!state) {
			state = this.stateManager.createWorkflowState(
				workflowId,
				config.name,
				options.parentTaskId,
				options.initialContext,
			)
		}

		// Create execution context
		const context: WorkflowExecutionContext = {
			config,
			state,
			options,
			activeTasks: new Map(),
		}

		this.runningWorkflows.set(workflowId, context)

		try {
			// Start workflow execution
			this.stateManager.updateWorkflowStatus(workflowId, WORKFLOW_STAGE_STATUS.IN_PROGRESS)

			// Find initial stages (stages with no dependencies)
			const initialStages = this.findInitialStages(config)

			// Execute workflow
			await this.executeStages(context, initialStages)

			// Wait for all stages to complete
			await this.waitForCompletion(context)

			// Determine final status
			const finalStatus =
				state.failedStages.length > 0 ? WORKFLOW_STAGE_STATUS.FAILED : WORKFLOW_STAGE_STATUS.COMPLETED

			this.stateManager.updateWorkflowStatus(workflowId, finalStatus)

			return {
				workflowId,
				status: finalStatus,
				stages: Object.values(state.stages),
				context: state.context,
				duration: (state.completedAt || Date.now()) - state.startedAt,
			}
		} catch (error) {
			logger.error("Workflow execution failed", {
				workflowId,
				error: error instanceof Error ? error.message : String(error),
			})

			this.stateManager.updateWorkflowStatus(workflowId, WORKFLOW_STAGE_STATUS.FAILED)

			throw error
		} finally {
			this.runningWorkflows.delete(workflowId)
		}
	}

	/**
	 * Find stages that can be executed initially
	 */
	private findInitialStages(config: WorkflowConfig): WorkflowStage[] {
		const stageNames = new Set(config.workflow.map((s) => s.name))
		const targetedStages = new Set<string>()

		// Find all stages that are targeted by transitions
		for (const stage of config.workflow) {
			if (stage.on_success && stage.on_success !== "end") {
				targetedStages.add(stage.on_success)
			}
			if (stage.on_failure && stage.on_failure !== "end") {
				targetedStages.add(stage.on_failure)
			}
			if (stage.next_steps) {
				stage.next_steps.forEach((step) => {
					if (step !== "end") {
						targetedStages.add(step)
					}
				})
			}
		}

		// Initial stages are those not targeted by any transition
		return config.workflow.filter((stage) => !targetedStages.has(stage.name))
	}

	/**
	 * Execute a set of stages
	 */
	private async executeStages(context: WorkflowExecutionContext, stages: WorkflowStage[]): Promise<void> {
		const { config, state, options } = context

		// Group stages by parallel execution capability
		const parallelStages = stages.filter((s) => s.parallel)
		const sequentialStages = stages.filter((s) => !s.parallel)

		// Execute parallel stages
		if (parallelStages.length > 0) {
			const maxParallel = config.max_parallel_stages || 5
			const chunks = this.chunkArray(parallelStages, maxParallel)

			for (const chunk of chunks) {
				await Promise.all(chunk.map((stage) => this.executeStage(context, stage)))
			}
		}

		// Execute sequential stages
		for (const stage of sequentialStages) {
			await this.executeStage(context, stage)
		}
	}

	/**
	 * Execute a single stage
	 */
	private async executeStage(context: WorkflowExecutionContext, stage: WorkflowStage): Promise<void> {
		const { config, state } = context
		const workflowId = state.id

		logger.info(`Executing workflow stage: ${stage.name}`, { workflowId, agent: stage.agent })

		// Find agent configuration
		const agentConfig = config.agents.find((a) => a.id === stage.agent)
		if (!agentConfig) {
			throw new Error(`Agent '${stage.agent}' not found in workflow configuration`)
		}

		// Validate mode exists
		const mode = getModeBySlug(agentConfig.mode, await this.provider.getState().then((s) => s?.customModes))
		if (!mode) {
			throw new Error(`Mode '${agentConfig.mode}' not found for agent '${stage.agent}'`)
		}

		// Update stage state
		this.stateManager.updateStageState(workflowId, stage.name, {
			status: WORKFLOW_STAGE_STATUS.IN_PROGRESS,
			agent: stage.agent,
		})

		try {
			// Create task message with context
			const taskMessage = this.createTaskMessage(stage, agentConfig, state.context)

			// Switch to the required mode
			await this.provider.handleModeSwitch(agentConfig.mode)

			// Create and execute task
			const task = await this.provider.initClineWithTask(
				taskMessage,
				undefined,
				context.options.parentTaskId ? ({ taskId: context.options.parentTaskId } as Task) : undefined,
			)

			if (!task) {
				throw new Error("Failed to create task for stage")
			}

			// Store task reference
			context.activeTasks.set(stage.name, task)

			// Wait for task completion
			const result = await this.waitForTaskCompletion(task, stage.timeout || config.default_timeout)

			// Update stage state with result
			this.stateManager.updateStageState(workflowId, stage.name, {
				status: WORKFLOW_STAGE_STATUS.COMPLETED,
				result: result.summary,
				completedAt: Date.now(),
			})

			// Update workflow context with stage results
			this.stateManager.updateContext(workflowId, {
				[`${stage.name}_result`]: result.summary,
				[`${stage.name}_success`]: true,
			})

			// Determine next stages
			await this.processStageTransition(context, stage, true)
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			logger.error(`Stage '${stage.name}' failed`, { workflowId, error: errorMessage })

			// Update stage state with error
			this.stateManager.updateStageState(workflowId, stage.name, {
				status: WORKFLOW_STAGE_STATUS.FAILED,
				error: errorMessage,
				completedAt: Date.now(),
			})

			// Update workflow context
			this.stateManager.updateContext(workflowId, {
				[`${stage.name}_error`]: errorMessage,
				[`${stage.name}_success`]: false,
			})

			// Handle retry logic
			const currentRetryCount = state.stages[stage.name]?.retryCount || 0
			if (currentRetryCount < (stage.retry_count || 0)) {
				logger.info(`Retrying stage '${stage.name}' (attempt ${currentRetryCount + 1})`)

				this.stateManager.updateStageState(workflowId, stage.name, {
					retryCount: currentRetryCount + 1,
					status: WORKFLOW_STAGE_STATUS.PENDING,
				})

				// Retry the stage
				await this.executeStage(context, stage)
			} else {
				// Process failure transition
				await this.processStageTransition(context, stage, false)
			}
		} finally {
			// Clean up task reference
			context.activeTasks.delete(stage.name)
		}
	}

	/**
	 * Process stage transition based on strategy
	 */
	private async processStageTransition(
		context: WorkflowExecutionContext,
		stage: WorkflowStage,
		success: boolean,
	): Promise<void> {
		const { config, state } = context

		if (stage.strategy === WORKFLOW_STRATEGIES.ORCHESTRATE && success) {
			// Let the orchestrator decide next steps
			if (!stage.next_steps || stage.next_steps.length === 0) {
				return
			}

			// For now, execute all next steps (in future, orchestrator will decide)
			const nextStages = stage.next_steps
				.filter((name) => name !== "end")
				.map((name) => config.workflow.find((s) => s.name === name))
				.filter((s): s is WorkflowStage => s !== undefined)

			if (nextStages.length > 0) {
				await this.executeStages(context, nextStages)
			}
		} else {
			// Fixed transition
			const nextStageName = success ? stage.on_success : stage.on_failure

			if (!nextStageName || nextStageName === "end") {
				return
			}

			const nextStage = config.workflow.find((s) => s.name === nextStageName)
			if (nextStage) {
				await this.executeStage(context, nextStage)
			}
		}
	}

	/**
	 * Create task message for stage execution
	 */
	private createTaskMessage(
		stage: WorkflowStage,
		agentConfig: { id: string; mode: string; description?: string },
		context: Record<string, any>,
	): string {
		const contextInfo =
			Object.keys(context).length > 0 ? `\n\nWorkflow Context:\n${JSON.stringify(context, null, 2)}` : ""

		return `[Workflow Stage: ${stage.name}]

${stage.description || `Execute ${stage.name} stage`}

Agent: ${agentConfig.id} (${agentConfig.description || agentConfig.mode})
${contextInfo}

Please complete this stage and use attempt_completion to report the results.`
	}

	/**
	 * Wait for task completion
	 */
	private async waitForTaskCompletion(task: Task, timeout?: number): Promise<{ summary: string }> {
		return new Promise((resolve, reject) => {
			let timeoutHandle: NodeJS.Timeout | undefined

			if (timeout) {
				timeoutHandle = setTimeout(() => {
					task.abortTask()
					reject(new Error(`Task timed out after ${timeout} seconds`))
				}, timeout * 1000)
			}

			const handleCompletion = (taskId: string, tokenUsage: any, toolUsage: any) => {
				if (taskId === task.taskId) {
					if (timeoutHandle) {
						clearTimeout(timeoutHandle)
					}

					// Get the last message as summary
					const lastMessage = task.clineMessages[task.clineMessages.length - 1]
					const summary = lastMessage?.text || "Task completed"

					task.removeListener("taskCompleted", handleCompletion)
					task.removeListener("taskAborted", handleAbort)

					resolve({ summary })
				}
			}

			const handleAbort = () => {
				if (timeoutHandle) {
					clearTimeout(timeoutHandle)
				}

				task.removeListener("taskCompleted", handleCompletion)
				task.removeListener("taskAborted", handleAbort)

				reject(new Error("Task was aborted"))
			}

			task.on("taskCompleted", handleCompletion)
			task.on("taskAborted", handleAbort)
		})
	}

	/**
	 * Wait for all stages in workflow to complete
	 */
	private async waitForCompletion(context: WorkflowExecutionContext): Promise<void> {
		const { state } = context
		const checkInterval = 1000 // 1 second

		return new Promise((resolve) => {
			const checkCompletion = () => {
				const allStagesProcessed = Object.values(state.stages).every(
					(stage) =>
						stage.status !== WORKFLOW_STAGE_STATUS.PENDING &&
						stage.status !== WORKFLOW_STAGE_STATUS.IN_PROGRESS,
				)

				if (allStagesProcessed && state.currentStages.length === 0) {
					resolve()
				} else {
					setTimeout(checkCompletion, checkInterval)
				}
			}

			checkCompletion()
		})
	}

	/**
	 * Chunk array into smaller arrays
	 */
	private chunkArray<T>(array: T[], size: number): T[][] {
		const chunks: T[][] = []
		for (let i = 0; i < array.length; i += size) {
			chunks.push(array.slice(i, i + size))
		}
		return chunks
	}

	/**
	 * Stop a running workflow
	 */
	public async stopWorkflow(workflowId: string): Promise<void> {
		const context = this.runningWorkflows.get(workflowId)
		if (!context) {
			return
		}

		// Abort all active tasks
		for (const [stageName, task] of context.activeTasks) {
			logger.info(`Aborting task for stage '${stageName}'`)
			await task.abortTask()
		}

		// Update workflow status
		this.stateManager.updateWorkflowStatus(workflowId, WORKFLOW_STAGE_STATUS.FAILED)

		// Remove from running workflows
		this.runningWorkflows.delete(workflowId)
	}

	/**
	 * Get running workflows
	 */
	public getRunningWorkflows(): string[] {
		return Array.from(this.runningWorkflows.keys())
	}

	/**
	 * Get workflow state
	 */
	public getWorkflowState(workflowId: string): WorkflowState | undefined {
		return this.stateManager.getWorkflowState(workflowId)
	}
}

/**
 * Internal execution context
 */
interface WorkflowExecutionContext {
	config: WorkflowConfig
	state: WorkflowState
	options: WorkflowExecutionOptions
	activeTasks: Map<string, Task>
}
