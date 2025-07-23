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

			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Semantic search is not available yet (currently Standby)"),
			)
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Code indexing has not started yet"),
			)
			expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("Please use file reading tools"))
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

			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Semantic search is not available yet (currently Indexing)"),
			)
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Code indexing is currently in progress"),
			)
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

			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Semantic search is not available yet (currently Error)"),
			)
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Code indexing encountered an error"),
			)
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
			expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("Query: test query"))
			expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("test code"))
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
					message: "Code Indexing is disabled in the settings.",
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
					message: "Code Indexing is not configured (Missing OpenAI Key or Qdrant URL).",
				}),
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
