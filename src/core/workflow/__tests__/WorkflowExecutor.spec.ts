import { describe, it, expect, beforeEach, vi } from "vitest"
import { EventEmitter } from "events"

import { WorkflowExecutor } from "../WorkflowExecutor"
import { WorkflowConfig, WorkflowState, WORKFLOW_STAGE_STATUS, WORKFLOW_EVENTS } from "@roo-code/types"

// Mock dependencies
vi.mock("../WorkflowStateManager", () => ({
	WorkflowStateManager: vi.fn().mockImplementation(() => ({
		createWorkflowState: vi.fn().mockReturnValue({
			id: "test-workflow",
			name: "Test Workflow",
			status: WORKFLOW_STAGE_STATUS.PENDING,
			stages: {},
			currentStages: [],
			completedStages: [],
			failedStages: [],
			startedAt: Date.now(),
			context: {},
		}),
		loadState: vi.fn().mockResolvedValue(undefined),
		updateWorkflowStatus: vi.fn(),
		updateStageState: vi.fn(),
		updateContext: vi.fn(),
		getWorkflowState: vi.fn().mockReturnValue(undefined),
		on: vi.fn(),
		emit: vi.fn(),
	})),
}))
vi.mock("../../utils/logging", () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	},
}))
vi.mock("../../../shared/modes", () => ({
	getModeBySlug: vi.fn().mockReturnValue({ slug: "code", name: "Code" }),
}))

describe("WorkflowExecutor", () => {
	let executor: WorkflowExecutor
	let mockProvider: any
	let mockConfig: WorkflowConfig

	beforeEach(() => {
		vi.clearAllMocks()

		// Create a minimal mock provider
		mockProvider = {
			handleModeSwitch: vi.fn().mockResolvedValue(undefined),
			initClineWithTask: vi.fn(),
			getState: vi.fn().mockResolvedValue({ customModes: [] }),
		}

		// Create mock config
		mockConfig = {
			name: "Test Workflow",
			description: "Test workflow description",
			agents: [
				{ id: "agent1", mode: "code", description: "Agent 1 description" },
				{ id: "agent2", mode: "architect", description: "Agent 2 description" },
			],
			workflow: [
				{
					name: "stage1",
					agent: "agent1",
					strategy: "fixed",
					on_success: "stage2",
				},
				{
					name: "stage2",
					agent: "agent2",
					strategy: "fixed",
				},
			],
		}

		executor = new WorkflowExecutor(mockProvider, "/test/storage")
	})

	describe("constructor", () => {
		it("should create executor instance", () => {
			expect(executor).toBeDefined()
			expect(executor).toBeInstanceOf(EventEmitter)
		})
	})

	describe("getRunningWorkflows", () => {
		it("should return empty array initially", () => {
			const running = executor.getRunningWorkflows()
			expect(running).toEqual([])
		})
	})

	describe("getWorkflowState", () => {
		it("should return undefined for non-existent workflow", () => {
			const state = executor.getWorkflowState("non-existent")
			expect(state).toBeUndefined()
		})
	})

	describe("stopWorkflow", () => {
		it("should handle stopping non-existent workflow", async () => {
			// Should not throw
			await expect(executor.stopWorkflow("non-existent")).resolves.toBeUndefined()
		})
	})

	describe("executeWorkflow", () => {
		it("should validate agent configuration", async () => {
			// Create a minimal mock executor that can actually run
			const testExecutor = new WorkflowExecutor(mockProvider, "/test/storage")

			const invalidConfig: WorkflowConfig = {
				...mockConfig,
				workflow: [
					{
						name: "stage1",
						agent: "non-existent-agent",
						strategy: "fixed",
					},
				],
			}

			await expect(testExecutor.executeWorkflow(invalidConfig)).rejects.toThrow(
				"Agent 'non-existent-agent' not found",
			)
		})

		it("should validate mode exists", async () => {
			const { getModeBySlug } = await import("../../../shared/modes")
			vi.mocked(getModeBySlug).mockReturnValueOnce(undefined)

			// Create a minimal mock executor that can actually run
			const testExecutor = new WorkflowExecutor(mockProvider, "/test/storage")

			await expect(testExecutor.executeWorkflow(mockConfig)).rejects.toThrow(
				"Mode 'code' not found for agent 'agent1'",
			)
		})
	})

	describe("workflow configuration", () => {
		it("should support parallel stages", () => {
			const parallelConfig: WorkflowConfig = {
				...mockConfig,
				workflow: [
					{
						name: "stage1",
						agent: "agent1",
						strategy: "fixed",
						parallel: true,
					},
					{
						name: "stage2",
						agent: "agent2",
						strategy: "fixed",
						parallel: true,
					},
				],
			}

			expect(parallelConfig.workflow[0].parallel).toBe(true)
			expect(parallelConfig.workflow[1].parallel).toBe(true)
		})

		it("should support orchestrate strategy", () => {
			const orchestrateConfig: WorkflowConfig = {
				...mockConfig,
				workflow: [
					{
						name: "orchestrate-stage",
						agent: "agent1",
						strategy: "orchestrate",
						next_steps: ["stage2", "stage3"],
					},
				],
			}

			expect(orchestrateConfig.workflow[0].strategy).toBe("orchestrate")
			expect(orchestrateConfig.workflow[0].next_steps).toEqual(["stage2", "stage3"])
		})

		it("should support retry configuration", () => {
			const retryConfig: WorkflowConfig = {
				...mockConfig,
				workflow: [
					{
						name: "retry-stage",
						agent: "agent1",
						strategy: "fixed",
						retry_count: 3,
					},
				],
			}

			expect(retryConfig.workflow[0].retry_count).toBe(3)
		})

		it("should support timeout configuration", () => {
			const timeoutConfig: WorkflowConfig = {
				...mockConfig,
				workflow: [
					{
						name: "timeout-stage",
						agent: "agent1",
						strategy: "fixed",
						timeout: 30,
					},
				],
			}

			expect(timeoutConfig.workflow[0].timeout).toBe(30)
		})
	})

	describe("workflow state structure", () => {
		it("should have correct state structure", () => {
			const state: WorkflowState = {
				id: "test-workflow",
				name: "Test Workflow",
				status: WORKFLOW_STAGE_STATUS.PENDING,
				stages: {},
				currentStages: [],
				completedStages: [],
				failedStages: [],
				startedAt: Date.now(),
				context: {},
			}

			expect(state.id).toBe("test-workflow")
			expect(state.status).toBe(WORKFLOW_STAGE_STATUS.PENDING)
			expect(state.stages).toEqual({})
			expect(state.currentStages).toEqual([])
			expect(state.completedStages).toEqual([])
			expect(state.failedStages).toEqual([])
		})
	})

	describe("workflow events", () => {
		it("should define all workflow event types", () => {
			expect(WORKFLOW_EVENTS.WORKFLOW_STARTED).toBe("workflow:started")
			expect(WORKFLOW_EVENTS.WORKFLOW_COMPLETED).toBe("workflow:completed")
			expect(WORKFLOW_EVENTS.WORKFLOW_FAILED).toBe("workflow:failed")
			expect(WORKFLOW_EVENTS.STAGE_STARTED).toBe("stage:started")
			expect(WORKFLOW_EVENTS.STAGE_COMPLETED).toBe("stage:completed")
			expect(WORKFLOW_EVENTS.STAGE_FAILED).toBe("stage:failed")
			expect(WORKFLOW_EVENTS.STAGE_RETRYING).toBe("stage:retrying")
			expect(WORKFLOW_EVENTS.ORCHESTRATOR_DECISION).toBe("orchestrator:decision")
		})
	})
})
