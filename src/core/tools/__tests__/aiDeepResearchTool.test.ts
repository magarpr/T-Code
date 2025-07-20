import { describe, it, expect, vi, beforeEach } from "vitest"
import { aiDeepResearchTool } from "../aiDeepResearchTool"
import { Task } from "../../task/Task"
import { AIDeepResearchService } from "../../../services/ai-deep-research/AIDeepResearchService"

// Mock the AIDeepResearchService
vi.mock("../../../services/ai-deep-research/AIDeepResearchService")

describe("aiDeepResearchTool", () => {
	let mockCline: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any
	let mockPerformResearch: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Mock the Task instance
		mockCline = {
			say: vi.fn(),
			ask: vi.fn().mockResolvedValue(undefined),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			consecutiveMistakeCount: 0,
			providerRef: {
				deref: vi.fn().mockReturnValue({
					context: {},
				}),
			},
		}

		// Mock the callback functions
		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((tag, content) => content || "")

		// Mock AIDeepResearchService
		mockPerformResearch = vi.fn().mockResolvedValue("Research completed successfully")
		AIDeepResearchService.prototype.performResearch = mockPerformResearch
	})

	it("should handle missing query parameter", async () => {
		const block = {
			type: "tool_use" as const,
			name: "ai_deep_research" as const,
			params: {},
			partial: false,
		}

		await aiDeepResearchTool(
			mockCline,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockCline.consecutiveMistakeCount).toBe(1)
		expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
		expect(mockCline.sayAndCreateMissingParamError).toHaveBeenCalledWith("ai_deep_research", "query")
	})

	it("should handle partial block", async () => {
		const block = {
			type: "tool_use" as const,
			name: "ai_deep_research" as const,
			params: { query: "test query" },
			partial: true,
		}

		await aiDeepResearchTool(
			mockCline,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockCline.ask).toHaveBeenCalledWith(
			"tool",
			JSON.stringify({
				tool: "aiDeepResearch",
				query: "test query",
			}),
			true,
		)
		expect(mockAskApproval).not.toHaveBeenCalled()
	})

	it("should handle user rejection", async () => {
		mockAskApproval.mockResolvedValue(false)

		const block = {
			type: "tool_use" as const,
			name: "ai_deep_research" as const,
			params: { query: "test query" },
			partial: false,
		}

		await aiDeepResearchTool(
			mockCline,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockAskApproval).toHaveBeenCalled()
		expect(mockPushToolResult).toHaveBeenCalledWith("The user denied this operation.")
		expect(mockPerformResearch).not.toHaveBeenCalled()
	})

	it("should perform research successfully", async () => {
		const block = {
			type: "tool_use" as const,
			name: "ai_deep_research" as const,
			params: { query: "test query" },
			partial: false,
		}

		await aiDeepResearchTool(
			mockCline,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockAskApproval).toHaveBeenCalled()
		expect(mockCline.say).toHaveBeenCalledWith(
			"ai_deep_research_result",
			expect.stringContaining('"status":"thinking"'),
		)
		expect(mockPerformResearch).toHaveBeenCalledWith("test query", expect.any(Object))
		expect(mockPushToolResult).toHaveBeenCalledWith("Research completed successfully")
	})

	it("should handle errors during research", async () => {
		const error = new Error("Research failed")
		mockPerformResearch.mockRejectedValue(error)

		const block = {
			type: "tool_use" as const,
			name: "ai_deep_research" as const,
			params: { query: "test query" },
			partial: false,
		}

		await aiDeepResearchTool(
			mockCline,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockHandleError).toHaveBeenCalledWith("ai_deep_research", error)
	})

	it("should handle missing context", async () => {
		mockCline.providerRef.deref.mockReturnValue(null)

		const block = {
			type: "tool_use" as const,
			name: "ai_deep_research" as const,
			params: { query: "test query" },
			partial: false,
		}

		await aiDeepResearchTool(
			mockCline,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockHandleError).toHaveBeenCalledWith(
			"ai_deep_research",
			expect.objectContaining({
				message: "Extension context is not available.",
			}),
		)
	})

	it("should call all callbacks during research", async () => {
		let capturedCallbacks: any = {}
		mockPerformResearch.mockImplementation(async (query: string, callbacks: any) => {
			capturedCallbacks = callbacks
			// Simulate calling each callback
			await callbacks.onThinking("Thinking about the query...")
			await callbacks.onSearching("machine learning")
			await callbacks.onReading("https://example.com/article")
			await callbacks.onAnalyzing("Analyzing the content...")
			await callbacks.onResult("Final research result")
			return "Research completed successfully"
		})

		const block = {
			type: "tool_use" as const,
			name: "ai_deep_research" as const,
			params: { query: "test query" },
			partial: false,
		}

		await aiDeepResearchTool(
			mockCline,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		// Verify all status updates were sent
		const sayCalls = mockCline.say.mock.calls
		expect(sayCalls.some((call: any[]) => call[1].includes('"status":"thinking"'))).toBe(true)
		expect(sayCalls.some((call: any[]) => call[1].includes('"status":"searching"'))).toBe(true)
		expect(sayCalls.some((call: any[]) => call[1].includes('"status":"reading"'))).toBe(true)
		expect(sayCalls.some((call: any[]) => call[1].includes('"status":"analyzing"'))).toBe(true)
		expect(sayCalls.some((call: any[]) => call[1].includes('"status":"completed"'))).toBe(true)
	})
})
