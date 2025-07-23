import { describe, it, expect, vi, beforeEach } from "vitest"
import { codebaseSearchTool } from "../codebaseSearchTool"
import { CodeIndexManager } from "../../../services/code-index/manager"
import { Task } from "../../task/Task"
import { ToolUse } from "../../../shared/tools"

// Mock dependencies
vi.mock("../../../services/code-index/manager")
vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn(() => "/test/workspace"),
}))
vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		toolDenied: vi.fn(() => "Tool denied"),
	},
}))
vi.mock("vscode", () => ({
	workspace: {
		asRelativePath: vi.fn((path: string) => path.replace("/test/workspace/", "")),
	},
}))
vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string) => {
		const translations: Record<string, string> = {
			"tools.codebaseSearch.errors.disabled": "Code Indexing is disabled in the settings.",
			"tools.codebaseSearch.errors.notConfigured":
				"Code Indexing is not configured (Missing OpenAI Key or Qdrant URL).",
		}
		return translations[key] || key
	}),
}))

describe("codebaseSearchTool", () => {
	let mockTask: Task
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any
	let mockCodeIndexManager: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Setup mock task
		mockTask = {
			ask: vi.fn().mockResolvedValue(undefined),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			consecutiveMistakeCount: 0,
			providerRef: {
				deref: vi.fn(() => ({
					context: {},
				})),
			},
			say: vi.fn().mockResolvedValue(undefined),
		} as any

		// Setup mock functions
		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((tag, value) => value)

		// Setup mock CodeIndexManager
		mockCodeIndexManager = {
			isFeatureEnabled: true,
			isFeatureConfigured: true,
			isInitialized: true,
			state: "Indexed",
			searchIndex: vi.fn().mockResolvedValue([
				{
					score: 0.9,
					payload: {
						filePath: "/test/workspace/src/file.ts",
						startLine: 10,
						endLine: 20,
						codeChunk: "test code",
					},
				},
			]),
		}

		vi.mocked(CodeIndexManager).getInstance = vi.fn((_context: any) => mockCodeIndexManager as any)
	})

	describe("indexing state checks", () => {
		it("should provide feedback when indexing is in Standby state", async () => {
			mockCodeIndexManager.state = "Standby"

			const block: ToolUse = {
				type: "tool_use",
				name: "codebase_search",
				params: { query: "test query" },
				partial: false,
			}

			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify the complete message was pushed
			const pushedMessage = mockPushToolResult.mock.calls[0][0]
			expect(pushedMessage).toContain("Semantic search is not available yet (currently Standby)")
			expect(pushedMessage).toContain("Code indexing has not started yet")
			expect(pushedMessage).toContain("Please use file reading tools")
			expect(mockCodeIndexManager.searchIndex).not.toHaveBeenCalled()
		})

		it("should provide feedback when indexing is in progress", async () => {
			mockCodeIndexManager.state = "Indexing"

			const block: ToolUse = {
				type: "tool_use",
				name: "codebase_search",
				params: { query: "test query" },
				partial: false,
			}

			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify the complete message was pushed
			const pushedMessage = mockPushToolResult.mock.calls[0][0]
			expect(pushedMessage).toContain("Semantic search is not available yet (currently Indexing)")
			expect(pushedMessage).toContain("Code indexing is currently in progress")
			expect(mockCodeIndexManager.searchIndex).not.toHaveBeenCalled()
		})

		it("should provide feedback when indexing is in Error state", async () => {
			mockCodeIndexManager.state = "Error"

			const block: ToolUse = {
				type: "tool_use",
				name: "codebase_search",
				params: { query: "test query" },
				partial: false,
			}

			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify the complete message was pushed
			const pushedMessage = mockPushToolResult.mock.calls[0][0]
			expect(pushedMessage).toContain("Semantic search is not available yet (currently Error)")
			expect(pushedMessage).toContain("Code indexing encountered an error")
			expect(mockCodeIndexManager.searchIndex).not.toHaveBeenCalled()
		})

		it("should perform search when indexing is complete (Indexed state)", async () => {
			mockCodeIndexManager.state = "Indexed"

			const block: ToolUse = {
				type: "tool_use",
				name: "codebase_search",
				params: { query: "test query" },
				partial: false,
			}

			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCodeIndexManager.searchIndex).toHaveBeenCalledWith("test query", undefined)
			// Check that say was called with the search results
			expect(mockTask.say).toHaveBeenCalledWith("codebase_search_result", expect.stringContaining("test code"))
			// Check that pushToolResult was called with the formatted output
			const pushedResult = mockPushToolResult.mock.calls[0][0]
			expect(pushedResult).toContain("Query: test query")
			expect(pushedResult).toContain("test code")
			expect(mockPushToolResult).not.toHaveBeenCalledWith(
				expect.stringContaining("Semantic search is not available"),
			)
		})
	})

	describe("feature configuration checks", () => {
		it("should throw error when feature is disabled", async () => {
			mockCodeIndexManager.isFeatureEnabled = false

			const block: ToolUse = {
				type: "tool_use",
				name: "codebase_search",
				params: { query: "test query" },
				partial: false,
			}

			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockHandleError).toHaveBeenCalledWith(
				"codebase_search",
				expect.objectContaining({
					message: expect.stringContaining("Code Indexing is disabled"),
				}),
			)
		})

		it("should throw error when feature is not configured", async () => {
			mockCodeIndexManager.isFeatureConfigured = false

			const block: ToolUse = {
				type: "tool_use",
				name: "codebase_search",
				params: { query: "test query" },
				partial: false,
			}

			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockHandleError).toHaveBeenCalledWith(
				"codebase_search",
				expect.objectContaining({
					message: expect.stringContaining("Code Indexing is not configured"),
				}),
			)
		})

		it("should be available when enabled and configured but not initialized", async () => {
			// This test verifies that the tool is available even when indexing is not complete
			// The tool itself will handle the state checking
			mockCodeIndexManager.isFeatureEnabled = true
			mockCodeIndexManager.isFeatureConfigured = true
			mockCodeIndexManager.isInitialized = false
			mockCodeIndexManager.state = "Standby"

			const block: ToolUse = {
				type: "tool_use",
				name: "codebase_search",
				params: { query: "test query" },
				partial: false,
			}

			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Should not throw an error, but should provide feedback about the state
			expect(mockHandleError).not.toHaveBeenCalled()
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Semantic search is not available yet (currently Standby)"),
			)
		})
	})

	describe("parameter validation", () => {
		it("should handle missing query parameter", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "codebase_search",
				params: {},
				partial: false,
			}

			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("codebase_search", "query")
			expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
		})

		it("should handle partial tool use", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "codebase_search",
				params: { query: "test" },
				partial: true,
			}

			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.ask).toHaveBeenCalled()
			expect(mockCodeIndexManager.searchIndex).not.toHaveBeenCalled()
		})
	})

	describe("search results handling", () => {
		it("should handle empty search results", async () => {
			mockCodeIndexManager.searchIndex.mockResolvedValue([])

			const block: ToolUse = {
				type: "tool_use",
				name: "codebase_search",
				params: { query: "test query" },
				partial: false,
			}

			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockPushToolResult).toHaveBeenCalledWith(
				'No relevant code snippets found for the query: "test query"',
			)
		})

		it("should format search results correctly", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "codebase_search",
				params: { query: "test query" },
				partial: false,
			}

			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// The tool should call pushToolResult with a single formatted string containing all results
			expect(mockPushToolResult).toHaveBeenCalledTimes(1)
			const resultString = mockPushToolResult.mock.calls[0][0]
			expect(resultString).toContain("Query: test query")
			expect(resultString).toContain("File path: src/file.ts")
			expect(resultString).toContain("Score: 0.9")
			expect(resultString).toContain("Lines: 10-20")
			expect(resultString).toContain("Code Chunk: test code")
		})
	})
})
