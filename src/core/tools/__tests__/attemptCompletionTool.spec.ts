import { describe, it, expect, vi, beforeEach } from "vitest"
import { TodoItem } from "@roo-code/types"
import { AttemptCompletionToolUse } from "../../../shared/tools"

// Mock the formatResponse module before importing the tool
vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		toolError: vi.fn((msg: string) => `Error: ${msg}`),
	},
}))

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(),
		})),
	},
}))

// Mock Package module
vi.mock("../../../shared/package", () => ({
	Package: {
		name: "roo-cline",
	},
}))

// Mock TelemetryService
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureEvent: vi.fn(),
			captureTaskCompleted: vi.fn(),
			captureToolUsage: vi.fn(),
			captureConsecutiveMistakeError: vi.fn(),
		},
	},
}))

import { attemptCompletionTool } from "../attemptCompletionTool"
import { Task } from "../../task/Task"
import * as vscode from "vscode"
import { TelemetryService } from "@roo-code/telemetry"

describe("attemptCompletionTool", () => {
	let mockTask: Partial<Task>
	let mockPushToolResult: ReturnType<typeof vi.fn>
	let mockAskApproval: ReturnType<typeof vi.fn>
	let mockHandleError: ReturnType<typeof vi.fn>
	let mockRemoveClosingTag: ReturnType<typeof vi.fn>
	let mockToolDescription: ReturnType<typeof vi.fn>
	let mockAskFinishSubTaskApproval: ReturnType<typeof vi.fn>
	let mockGetConfiguration: ReturnType<typeof vi.fn>

	beforeEach(() => {
		mockPushToolResult = vi.fn()
		mockAskApproval = vi.fn()
		mockHandleError = vi.fn()
		mockRemoveClosingTag = vi.fn()
		mockToolDescription = vi.fn()
		mockAskFinishSubTaskApproval = vi.fn()
		mockGetConfiguration = vi.fn(() => ({
			get: vi.fn((key: string, defaultValue: any) => {
				if (key === "preventCompletionWithOpenTodos") {
					return defaultValue // Default to false unless overridden in test
				}
				return defaultValue
			}),
		}))

		// Setup vscode mock
		vi.mocked(vscode.workspace.getConfiguration).mockImplementation(mockGetConfiguration)

		mockTask = {
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			todoList: undefined,
			toolUsage: {},
			didEditFile: false,
			api: {
				getModel: vi.fn(() => ({
					id: "test-model",
					info: {
						contextWindow: 100000,
						supportsPromptCache: false,
					},
				})),
				createMessage: vi.fn(),
				countTokens: vi.fn(),
			} as any,
			say: vi.fn(),
			emit: vi.fn(),
			taskId: "test-task-id",
			getTokenUsage: vi.fn(() => ({
				totalTokensIn: 0,
				totalTokensOut: 0,
				totalCost: 0,
				contextTokens: 0,
			})),
			parentTask: undefined,
			providerRef: {
				deref: vi.fn(() => undefined),
			} as any,
			ask: vi.fn(),
			userMessageContent: [],
		}
	})

	describe("todo list validation", () => {
		it("should allow completion when there is no todo list", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			mockTask.todoList = undefined

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Should not call pushToolResult with an error for empty todo list
			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
		})

		it("should allow completion when todo list is empty", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			mockTask.todoList = []

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
		})

		it("should allow completion when all todos are completed", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const completedTodos: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "completed" },
			]

			mockTask.todoList = completedTodos

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
		})

		it("should prevent completion when there are pending todos", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const todosWithPending: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "pending" },
			]

			mockTask.todoList = todosWithPending

			// Enable the setting to prevent completion with open todos
			mockGetConfiguration.mockReturnValue({
				get: vi.fn((key: string, defaultValue: any) => {
					if (key === "preventCompletionWithOpenTodos") {
						return true // Setting is enabled
					}
					return defaultValue
				}),
			})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("attempt_completion")
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task while there are incomplete todos"),
			)
		})

		it("should prevent completion when there are in-progress todos", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const todosWithInProgress: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "in_progress" },
			]

			mockTask.todoList = todosWithInProgress

			// Enable the setting to prevent completion with open todos
			mockGetConfiguration.mockReturnValue({
				get: vi.fn((key: string, defaultValue: any) => {
					if (key === "preventCompletionWithOpenTodos") {
						return true // Setting is enabled
					}
					return defaultValue
				}),
			})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("attempt_completion")
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task while there are incomplete todos"),
			)
		})

		it("should prevent completion when there are mixed incomplete todos", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const mixedTodos: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "pending" },
				{ id: "3", content: "Third task", status: "in_progress" },
			]

			mockTask.todoList = mixedTodos

			// Enable the setting to prevent completion with open todos
			mockGetConfiguration.mockReturnValue({
				get: vi.fn((key: string, defaultValue: any) => {
					if (key === "preventCompletionWithOpenTodos") {
						return true // Setting is enabled
					}
					return defaultValue
				}),
			})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("attempt_completion")
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task while there are incomplete todos"),
			)
		})

		it("should allow completion when setting is disabled even with incomplete todos", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const todosWithPending: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "pending" },
			]

			mockTask.todoList = todosWithPending

			// Ensure the setting is disabled (default behavior)
			mockGetConfiguration.mockReturnValue({
				get: vi.fn((key: string, defaultValue: any) => {
					if (key === "preventCompletionWithOpenTodos") {
						return false // Setting is disabled
					}
					return defaultValue
				}),
			})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Should not prevent completion when setting is disabled
			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
			expect(mockPushToolResult).not.toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task while there are incomplete todos"),
			)
		})

		it("should prevent completion when setting is enabled with incomplete todos", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const todosWithPending: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "pending" },
			]

			mockTask.todoList = todosWithPending

			// Enable the setting
			mockGetConfiguration.mockReturnValue({
				get: vi.fn((key: string, defaultValue: any) => {
					if (key === "preventCompletionWithOpenTodos") {
						return true // Setting is enabled
					}
					return defaultValue
				}),
			})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Should prevent completion when setting is enabled and there are incomplete todos
			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("attempt_completion")
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task while there are incomplete todos"),
			)
		})

		it("should allow completion when setting is enabled but all todos are completed", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const completedTodos: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "completed" },
			]

			mockTask.todoList = completedTodos

			// Enable the setting
			mockGetConfiguration.mockReturnValue({
				get: vi.fn((key: string, defaultValue: any) => {
					if (key === "preventCompletionWithOpenTodos") {
						return true // Setting is enabled
					}
					return defaultValue
				}),
			})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Should allow completion when setting is enabled but all todos are completed
			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
			expect(mockPushToolResult).not.toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task while there are incomplete todos"),
			)
		})
	})

	describe("Kimi K2 model validation", () => {
		beforeEach(() => {
			// Reset telemetry mocks
			vi.mocked(TelemetryService.instance.captureToolUsage).mockClear()
			vi.mocked(TelemetryService.instance.captureConsecutiveMistakeError).mockClear()
		})

		it("should prevent completion for Kimi K2 model when no tools have been used", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "I found the issue but haven't fixed it yet" },
				partial: false,
			}

			// Set up Kimi K2 model
			mockTask.api = {
				getModel: vi.fn(() => ({
					id: "moonshotai/kimi-k2-instruct",
					info: {
						contextWindow: 100000,
						supportsPromptCache: false,
					},
				})),
				createMessage: vi.fn(),
				countTokens: vi.fn(),
			} as any
			mockTask.toolUsage = {} // No tools used
			mockTask.didEditFile = false

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("attempt_completion")
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task without performing any actions"),
			)

			// Check telemetry was captured
			expect(TelemetryService.instance.captureToolUsage).toHaveBeenCalledWith(
				"test-task-id",
				"attempt_completion",
			)
			expect(TelemetryService.instance.captureConsecutiveMistakeError).toHaveBeenCalledWith("test-task-id")
		})

		it("should allow completion for Kimi K2 model when tools have been used", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Fixed the issue by updating the code" },
				partial: false,
			}

			// Set up Kimi K2 model with tools used
			mockTask.api = {
				getModel: vi.fn(() => ({
					id: "moonshotai/kimi-k2-instruct",
					info: {
						contextWindow: 100000,
						supportsPromptCache: false,
					},
				})),
				createMessage: vi.fn(),
				countTokens: vi.fn(),
			} as any
			mockTask.toolUsage = {
				write_to_file: { attempts: 1, failures: 0 },
				read_file: { attempts: 2, failures: 0 },
			}
			mockTask.didEditFile = true

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Should not increment mistake count or record error
			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
			expect(mockPushToolResult).not.toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task without performing any actions"),
			)

			// Telemetry should not be captured for successful completion
			expect(TelemetryService.instance.captureConsecutiveMistakeError).not.toHaveBeenCalled()
		})

		it("should allow completion for non-Kimi K2 models even without tools", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task analysis complete" },
				partial: false,
			}

			// Set up non-Kimi K2 model
			mockTask.api = {
				getModel: vi.fn(() => ({
					id: "claude-3-opus",
					info: {
						contextWindow: 100000,
						supportsPromptCache: false,
					},
				})),
				createMessage: vi.fn(),
				countTokens: vi.fn(),
			} as any
			mockTask.toolUsage = {} // No tools used
			mockTask.didEditFile = false

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Should not prevent completion for non-Kimi K2 models
			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
			expect(mockPushToolResult).not.toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task without performing any actions"),
			)
		})

		it("should detect Kimi K2 model with case-insensitive matching", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Found the problem" },
				partial: false,
			}

			// Set up Kimi K2 model with different casing
			mockTask.api = {
				getModel: vi.fn(() => ({
					id: "KIMI-K2-Model",
					info: {
						contextWindow: 100000,
						supportsPromptCache: false,
					},
				})),
				createMessage: vi.fn(),
				countTokens: vi.fn(),
			} as any
			mockTask.toolUsage = {} // No tools used
			mockTask.didEditFile = false

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("attempt_completion")
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task without performing any actions"),
			)
		})

		it("should allow completion for Kimi K2 when files have been edited", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Fixed the issue" },
				partial: false,
			}

			// Set up Kimi K2 model with file edits but no tool usage recorded
			mockTask.api = {
				getModel: vi.fn(() => ({
					id: "kimi-k2-instruct",
					info: {
						contextWindow: 100000,
						supportsPromptCache: false,
					},
				})),
				createMessage: vi.fn(),
				countTokens: vi.fn(),
			} as any
			mockTask.toolUsage = {} // No tools in usage record
			mockTask.didEditFile = true // But files were edited

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Should allow completion since files were edited
			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
		})
	})
})
