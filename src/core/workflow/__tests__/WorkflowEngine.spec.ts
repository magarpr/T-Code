import { describe, it, expect, beforeEach, vi } from "vitest"
import * as vscode from "vscode"

import { WorkflowEngine } from "../WorkflowEngine"
import { WorkflowExecutor } from "../WorkflowExecutor"
import { WorkflowParser } from "../WorkflowParser"
import { WorkflowConfig, WORKFLOW_STAGE_STATUS } from "@roo-code/types"

// Mock dependencies
vi.mock("vscode", () => ({
	commands: {
		registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
	},
	window: {
		showErrorMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showOpenDialog: vi.fn(),
		showInputBox: vi.fn(),
		showQuickPick: vi.fn(),
		withProgress: vi.fn(),
	},
	workspace: {
		openTextDocument: vi.fn(),
	},
	ProgressLocation: {
		Notification: 15,
	},
}))
vi.mock("../WorkflowExecutor")
vi.mock("../WorkflowParser")
vi.mock("../WorkflowStateManager")
vi.mock("../../../utils/logging", () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	},
}))
vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn().mockReturnValue("/test/workspace"),
}))

describe("WorkflowEngine", () => {
	let engine: WorkflowEngine
	let mockProvider: any
	let mockExecutor: WorkflowExecutor

	beforeEach(() => {
		vi.clearAllMocks()

		// Create mock provider
		mockProvider = {
			context: {
				globalStorageUri: { fsPath: "/test/storage" },
			},
			handleModeSwitch: vi.fn(),
			initClineWithTask: vi.fn(),
			getState: vi.fn().mockResolvedValue({ customModes: [] }),
		}

		// Create mock executor
		mockExecutor = {
			executeWorkflow: vi.fn(),
			stopWorkflow: vi.fn(),
			getRunningWorkflows: vi.fn().mockReturnValue([]),
			getWorkflowState: vi.fn(),
			on: vi.fn(),
			emit: vi.fn(),
		} as any

		vi.mocked(WorkflowExecutor).mockImplementation(() => mockExecutor)

		// Mock vscode withProgress
		vi.mocked(vscode.window.withProgress).mockImplementation(async (options, task) => {
			return task({ report: vi.fn() }, { isCancellationRequested: false, onCancellationRequested: vi.fn() })
		})

		engine = new WorkflowEngine(mockProvider)
	})

	describe("constructor", () => {
		it("should register commands", () => {
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"roo-cline.workflow.executeFromFile",
				expect.any(Function),
			)
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"roo-cline.workflow.createSample",
				expect.any(Function),
			)
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"roo-cline.workflow.list",
				expect.any(Function),
			)
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"roo-cline.workflow.stop",
				expect.any(Function),
			)
		})
	})

	describe("executeWorkflow", () => {
		it("should execute workflow from config", async () => {
			const mockConfig: WorkflowConfig = {
				name: "Test Workflow",
				agents: [{ id: "agent1", mode: "code" }],
				workflow: [{ name: "stage1", agent: "agent1", strategy: "fixed" }],
			}

			vi.mocked(mockExecutor.executeWorkflow).mockResolvedValue({
				workflowId: "test-id",
				status: WORKFLOW_STAGE_STATUS.COMPLETED,
				stages: [],
				context: {},
				duration: 1000,
			})

			const result = await engine.executeWorkflow(mockConfig)

			expect(result.workflowId).toBe("test-id")
			expect(result.status).toBe(WORKFLOW_STAGE_STATUS.COMPLETED)
			expect(mockExecutor.executeWorkflow).toHaveBeenCalledWith(mockConfig, {})
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining('✅ Workflow "Test Workflow" completed'),
			)
		})

		it("should handle workflow execution errors", async () => {
			const mockConfig: WorkflowConfig = {
				name: "Test Workflow",
				agents: [{ id: "agent1", mode: "code" }],
				workflow: [{ name: "stage1", agent: "agent1", strategy: "fixed" }],
			}

			vi.mocked(mockExecutor.executeWorkflow).mockRejectedValue(new Error("Execution failed"))

			await expect(engine.executeWorkflow(mockConfig)).rejects.toThrow("Execution failed")
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("Workflow execution failed: Execution failed")
		})

		it("should handle cancellation", async () => {
			const mockConfig: WorkflowConfig = {
				name: "Test Workflow",
				agents: [{ id: "agent1", mode: "code" }],
				workflow: [{ name: "stage1", agent: "agent1", strategy: "fixed" }],
			}

			let cancelCallback: (() => void) | undefined

			vi.mocked(vscode.window.withProgress).mockImplementation(async (options, task) => {
				const token = {
					isCancellationRequested: false,
					onCancellationRequested: (cb: () => void) => {
						cancelCallback = cb
						return { dispose: vi.fn() }
					},
				} as any
				return task({ report: vi.fn() }, token)
			})

			vi.mocked(mockExecutor.executeWorkflow).mockResolvedValue({
				workflowId: "test-id",
				status: WORKFLOW_STAGE_STATUS.COMPLETED,
				stages: [],
				context: {},
				duration: 1000,
			})

			await engine.executeWorkflow(mockConfig, { workflowId: "test-id" })

			// Simulate cancellation
			if (cancelCallback) {
				cancelCallback()
				expect(mockExecutor.stopWorkflow).toHaveBeenCalledWith("test-id")
			}
		})
	})

	describe("executeWorkflowFromFile", () => {
		it("should show error for invalid file", async () => {
			vi.mocked(vscode.window.showOpenDialog).mockResolvedValue([{ fsPath: "/test/workflow.yaml" } as any])
			vi.mocked(WorkflowParser.loadFromFile).mockRejectedValue(new Error("Invalid YAML"))

			const result = await engine.executeWorkflowFromFile()

			expect(result).toBeUndefined()
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("Failed to execute workflow: Invalid YAML")
		})

		it("should handle user cancellation", async () => {
			vi.mocked(vscode.window.showOpenDialog).mockResolvedValue(undefined)

			const result = await engine.executeWorkflowFromFile()

			expect(result).toBeUndefined()
			expect(mockExecutor.executeWorkflow).not.toHaveBeenCalled()
		})

		it("should execute workflow from selected file", async () => {
			const mockConfig: WorkflowConfig = {
				name: "Test Workflow",
				description: "Test description",
				agents: [{ id: "agent1", mode: "code" }],
				workflow: [{ name: "stage1", agent: "agent1", strategy: "fixed" }],
			}

			vi.mocked(vscode.window.showOpenDialog).mockResolvedValue([{ fsPath: "/test/workflow.yaml" } as any])
			vi.mocked(WorkflowParser.loadFromFile).mockResolvedValue(mockConfig)
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Execute" as any)
			vi.mocked(mockExecutor.executeWorkflow).mockResolvedValue({
				workflowId: "test-id",
				status: WORKFLOW_STAGE_STATUS.COMPLETED,
				stages: [],
				context: {},
				duration: 1000,
			})

			const result = await engine.executeWorkflowFromFile()

			expect(result).toBeDefined()
			expect(result?.workflowId).toBe("test-id")
			expect(WorkflowParser.loadFromFile).toHaveBeenCalledWith("/test/workflow.yaml")
		})
	})

	describe("cleanupOldWorkflows", () => {
		it("should cleanup old workflows", async () => {
			const mockStateManager = {
				cleanupOldWorkflows: vi.fn().mockResolvedValue(5),
			}
			engine["stateManager"] = mockStateManager as any

			await engine.cleanupOldWorkflows(30)

			expect(mockStateManager.cleanupOldWorkflows).toHaveBeenCalledWith(30)
		})

		it("should handle cleanup errors", async () => {
			const mockStateManager = {
				cleanupOldWorkflows: vi.fn().mockRejectedValue(new Error("Cleanup failed")),
			}
			engine["stateManager"] = mockStateManager as any

			// Should not throw
			await expect(engine.cleanupOldWorkflows()).resolves.toBeUndefined()
		})
	})

	describe("dispose", () => {
		it("should dispose all resources", () => {
			const mockDisposable = { dispose: vi.fn() }
			engine["disposables"] = [mockDisposable as any]

			vi.mocked(mockExecutor.getRunningWorkflows).mockReturnValue(["workflow1", "workflow2"])
			vi.mocked(mockExecutor.stopWorkflow).mockResolvedValue(undefined)

			engine.dispose()

			expect(mockDisposable.dispose).toHaveBeenCalled()
			expect(mockExecutor.stopWorkflow).toHaveBeenCalledWith("workflow1")
			expect(mockExecutor.stopWorkflow).toHaveBeenCalledWith("workflow2")
		})
	})

	describe("event handling", () => {
		it("should handle workflow events", () => {
			// Get the event handler registered in constructor
			const onMock = vi.mocked(mockExecutor.on)
			const eventHandler = onMock.mock.calls.find((call: any) => call[0] === "workflow:event")?.[1]
			expect(eventHandler).toBeDefined()

			if (!eventHandler) {
				throw new Error("Event handler not found")
			}

			// Test workflow started event
			eventHandler({
				type: "workflow:started",
				workflowId: "test",
				timestamp: Date.now(),
				data: { name: "Test Workflow" },
			})

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Workflow started: Test Workflow")

			// Test workflow completed event
			eventHandler({
				type: "workflow:completed",
				workflowId: "test",
				timestamp: Date.now(),
				data: { duration: 5000 },
			})

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("✅ Workflow completed in 5s")

			// Test workflow failed event
			eventHandler({
				type: "workflow:failed",
				workflowId: "test",
				timestamp: Date.now(),
				data: {},
			})

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("❌ Workflow failed")

			// Test stage failed event
			eventHandler({
				type: "stage:failed",
				workflowId: "test",
				timestamp: Date.now(),
				data: { stageName: "stage1", error: "Test error" },
			})

			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith("Stage failed: stage1 - Test error")
		})
	})
})
