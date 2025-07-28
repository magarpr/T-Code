import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { EventEmitter } from "events"

import { WorkflowStateManager } from "../WorkflowStateManager"
import { WORKFLOW_STAGE_STATUS, WORKFLOW_EVENTS } from "@roo-code/types"

vi.mock("fs/promises", () => ({
	mkdir: vi.fn(),
	readdir: vi.fn(),
	readFile: vi.fn(),
	unlink: vi.fn(),
}))
vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn(),
}))
vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn(),
}))

describe("WorkflowStateManager", () => {
	let stateManager: WorkflowStateManager
	const mockGlobalStoragePath = "/test/storage"

	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		stateManager = new WorkflowStateManager(mockGlobalStoragePath)
	})

	afterEach(() => {
		stateManager.removeAllListeners()
	})

	describe("createWorkflowState", () => {
		it("should create a new workflow state", () => {
			const state = stateManager.createWorkflowState("test-id", "Test Workflow", "parent-123", {
				foo: "bar",
			})

			expect(state.id).toBe("test-id")
			expect(state.name).toBe("Test Workflow")
			expect(state.status).toBe(WORKFLOW_STAGE_STATUS.PENDING)
			expect(state.parentTaskId).toBe("parent-123")
			expect(state.context).toEqual({ foo: "bar" })
			expect(state.stages).toEqual({})
			expect(state.currentStages).toEqual([])
			expect(state.completedStages).toEqual([])
			expect(state.failedStages).toEqual([])
		})

		it("should emit workflow started event", async () => {
			const eventPromise = new Promise<void>((resolve) => {
				stateManager.on("workflow:event", (event) => {
					expect(event.type).toBe(WORKFLOW_EVENTS.WORKFLOW_STARTED)
					expect(event.workflowId).toBe("test-id")
					expect(event.data.name).toBe("Test Workflow")
					resolve()
				})
			})

			stateManager.createWorkflowState("test-id", "Test Workflow")
			await eventPromise
		})
	})

	describe("updateWorkflowStatus", () => {
		beforeEach(() => {
			stateManager.createWorkflowState("test-id", "Test Workflow")
		})

		it("should update workflow status to completed", () => {
			stateManager.updateWorkflowStatus("test-id", WORKFLOW_STAGE_STATUS.COMPLETED)
			const state = stateManager.getWorkflowState("test-id")

			expect(state?.status).toBe(WORKFLOW_STAGE_STATUS.COMPLETED)
			expect(state?.completedAt).toBeDefined()
		})

		it("should emit workflow completed event", async () => {
			const eventPromise = new Promise<void>((resolve) => {
				stateManager.on("workflow:event", (event) => {
					if (event.type === WORKFLOW_EVENTS.WORKFLOW_COMPLETED) {
						expect(event.workflowId).toBe("test-id")
						expect(event.data.duration).toBeDefined()
						resolve()
					}
				})
			})

			stateManager.updateWorkflowStatus("test-id", WORKFLOW_STAGE_STATUS.COMPLETED)
			await eventPromise
		})

		it("should emit workflow failed event", async () => {
			const eventPromise = new Promise<void>((resolve) => {
				stateManager.on("workflow:event", (event) => {
					if (event.type === WORKFLOW_EVENTS.WORKFLOW_FAILED) {
						expect(event.workflowId).toBe("test-id")
						resolve()
					}
				})
			})

			stateManager.updateWorkflowStatus("test-id", WORKFLOW_STAGE_STATUS.FAILED)
			await eventPromise
		})
	})

	describe("updateStageState", () => {
		beforeEach(() => {
			stateManager.createWorkflowState("test-id", "Test Workflow")
		})

		it("should create and update stage state", () => {
			stateManager.updateStageState("test-id", "stage1", {
				status: WORKFLOW_STAGE_STATUS.IN_PROGRESS,
				agent: "agent1",
			})

			const state = stateManager.getWorkflowState("test-id")
			const stage = state?.stages["stage1"]

			expect(stage?.name).toBe("stage1")
			expect(stage?.status).toBe(WORKFLOW_STAGE_STATUS.IN_PROGRESS)
			expect(stage?.agent).toBe("agent1")
			expect(stage?.startedAt).toBeDefined()
		})

		it("should handle stage completion", () => {
			stateManager.updateStageState("test-id", "stage1", {
				status: WORKFLOW_STAGE_STATUS.IN_PROGRESS,
				agent: "agent1",
			})

			stateManager.updateStageState("test-id", "stage1", {
				status: WORKFLOW_STAGE_STATUS.COMPLETED,
				result: "Success",
			})

			const state = stateManager.getWorkflowState("test-id")
			expect(state?.currentStages).not.toContain("stage1")
			expect(state?.completedStages).toContain("stage1")
			expect(state?.stages["stage1"].completedAt).toBeDefined()
		})

		it("should handle stage failure", () => {
			stateManager.updateStageState("test-id", "stage1", {
				status: WORKFLOW_STAGE_STATUS.IN_PROGRESS,
				agent: "agent1",
			})

			stateManager.updateStageState("test-id", "stage1", {
				status: WORKFLOW_STAGE_STATUS.FAILED,
				error: "Test error",
			})

			const state = stateManager.getWorkflowState("test-id")
			expect(state?.currentStages).not.toContain("stage1")
			expect(state?.failedStages).toContain("stage1")
			expect(state?.stages["stage1"].error).toBe("Test error")
		})

		it("should emit stage events", async () => {
			let eventCount = 0
			const expectedEvents = [WORKFLOW_EVENTS.STAGE_STARTED, WORKFLOW_EVENTS.STAGE_COMPLETED]

			const eventPromise = new Promise<void>((resolve) => {
				stateManager.on("workflow:event", (event) => {
					if (expectedEvents.includes(event.type)) {
						eventCount++
						expect(event.data.stageName).toBe("stage1")
						expect(event.data.agent).toBe("agent1")

						if (eventCount === 2) {
							resolve()
						}
					}
				})
			})

			stateManager.updateStageState("test-id", "stage1", {
				status: WORKFLOW_STAGE_STATUS.IN_PROGRESS,
				agent: "agent1",
			})

			stateManager.updateStageState("test-id", "stage1", {
				status: WORKFLOW_STAGE_STATUS.COMPLETED,
			})

			await eventPromise
		})
	})

	describe("updateContext", () => {
		beforeEach(() => {
			stateManager.createWorkflowState("test-id", "Test Workflow", undefined, { initial: "value" })
		})

		it("should update workflow context", () => {
			stateManager.updateContext("test-id", { foo: "bar", baz: 123 })

			const context = stateManager.getContext("test-id")
			expect(context).toEqual({
				initial: "value",
				foo: "bar",
				baz: 123,
			})
		})

		it("should merge context updates", () => {
			stateManager.updateContext("test-id", { foo: "bar" })
			stateManager.updateContext("test-id", { baz: 123 })

			const context = stateManager.getContext("test-id")
			expect(context).toEqual({
				initial: "value",
				foo: "bar",
				baz: 123,
			})
		})
	})

	describe("persistence", () => {
		it("should persist state to disk", async () => {
			const { safeWriteJson } = await import("../../../utils/safeWriteJson")
			const mockSafeWriteJson = vi.mocked(safeWriteJson)

			const state = stateManager.createWorkflowState("test-id", "Test Workflow")

			// Wait for async persistence
			await new Promise((resolve) => setTimeout(resolve, 10))

			expect(mockSafeWriteJson).toHaveBeenCalledWith(
				path.join(mockGlobalStoragePath, "workflows", "test-id.json"),
				expect.objectContaining({
					id: "test-id",
					name: "Test Workflow",
				}),
			)
		})

		it("should load state from disk", async () => {
			const { fileExistsAtPath } = await import("../../../utils/fs")
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)

			const mockState = {
				id: "test-id",
				name: "Test Workflow",
				status: WORKFLOW_STAGE_STATUS.IN_PROGRESS,
				stages: {},
				currentStages: [],
				completedStages: [],
				failedStages: [],
				startedAt: Date.now(),
				context: {},
			}

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState))

			const loadedState = await stateManager.loadState("test-id")
			expect(loadedState).toEqual(mockState)
			expect(stateManager.getWorkflowState("test-id")).toEqual(mockState)
		})

		it("should return undefined if state file does not exist", async () => {
			const { fileExistsAtPath } = await import("../../../utils/fs")
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)

			const state = await stateManager.loadState("test-id")
			expect(state).toBeUndefined()
		})
	})

	describe("listWorkflows", () => {
		it("should list all workflow IDs", async () => {
			const { readdir } = await import("fs/promises")
			vi.mocked(readdir).mockResolvedValue(["workflow1.json", "workflow2.json", "not-a-workflow.txt"] as any)

			const workflows = await stateManager.listWorkflows()
			expect(workflows).toEqual(["workflow1", "workflow2"])
		})

		it("should handle readdir errors", async () => {
			const { readdir } = await import("fs/promises")
			vi.mocked(readdir).mockRejectedValue(new Error("Permission denied"))

			const workflows = await stateManager.listWorkflows()
			expect(workflows).toEqual([])
		})
	})

	describe("deleteState", () => {
		it("should delete workflow state", async () => {
			const { unlink } = await import("fs/promises")
			stateManager.createWorkflowState("test-id", "Test Workflow")

			await stateManager.deleteState("test-id")

			expect(stateManager.getWorkflowState("test-id")).toBeUndefined()
			expect(unlink).toHaveBeenCalledWith(path.join(mockGlobalStoragePath, "workflows", "test-id.json"))
		})
	})

	describe("getActiveWorkflows", () => {
		it("should return only active workflows", () => {
			stateManager.createWorkflowState("workflow1", "Workflow 1")
			stateManager.createWorkflowState("workflow2", "Workflow 2")
			stateManager.createWorkflowState("workflow3", "Workflow 3")

			stateManager.updateWorkflowStatus("workflow1", WORKFLOW_STAGE_STATUS.IN_PROGRESS)
			stateManager.updateWorkflowStatus("workflow2", WORKFLOW_STAGE_STATUS.COMPLETED)
			stateManager.updateWorkflowStatus("workflow3", WORKFLOW_STAGE_STATUS.IN_PROGRESS)

			const activeWorkflows = stateManager.getActiveWorkflows()
			expect(activeWorkflows).toHaveLength(2)
			expect(activeWorkflows.map((w) => w.id)).toEqual(["workflow1", "workflow3"])
		})
	})

	describe("cleanupOldWorkflows", () => {
		it("should delete old completed workflows", async () => {
			const { fileExistsAtPath } = await import("../../../utils/fs")
			const { readdir, readFile, unlink } = await import("fs/promises")
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)

			const oldDate = Date.now() - 40 * 24 * 60 * 60 * 1000 // 40 days ago
			const recentDate = Date.now() - 10 * 24 * 60 * 60 * 1000 // 10 days ago

			vi.mocked(readdir).mockResolvedValue(["old-workflow.json", "recent-workflow.json"] as any)

			vi.mocked(readFile)
				.mockResolvedValueOnce(
					JSON.stringify({
						id: "old-workflow",
						completedAt: oldDate,
						status: WORKFLOW_STAGE_STATUS.COMPLETED,
					}) as any,
				)
				.mockResolvedValueOnce(
					JSON.stringify({
						id: "recent-workflow",
						completedAt: recentDate,
						status: WORKFLOW_STAGE_STATUS.COMPLETED,
					}) as any,
				)

			const deletedCount = await stateManager.cleanupOldWorkflows(30)

			expect(deletedCount).toBe(1)
			expect(unlink).toHaveBeenCalledWith(path.join(mockGlobalStoragePath, "workflows", "old-workflow.json"))
			expect(unlink).not.toHaveBeenCalledWith(
				path.join(mockGlobalStoragePath, "workflows", "recent-workflow.json"),
			)
		})
	})
})
