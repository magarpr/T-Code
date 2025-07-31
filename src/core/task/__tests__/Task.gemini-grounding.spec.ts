// npx vitest run src/core/task/__tests__/Task.gemini-grounding.spec.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Task } from "../Task"
import type { ClineProvider } from "../../webview/ClineProvider"
import type { ProviderSettings } from "@roo-code/types"

describe("Task Gemini Grounding Loop Prevention", () => {
	let mockProvider: Partial<ClineProvider>
	let mockApiConfiguration: ProviderSettings

	beforeEach(() => {
		mockProvider = {
			context: {
				globalStorageUri: { fsPath: "/tmp/test" },
			} as any,
			getState: vi.fn().mockResolvedValue({
				mode: "ask",
				customModes: [],
				experiments: {},
			}),
			postStateToWebview: vi.fn(),
			updateTaskHistory: vi.fn(),
			log: vi.fn(),
		}

		mockApiConfiguration = {
			apiProvider: "gemini",
			apiModelId: "gemini-2.5-pro",
			enableGrounding: true,
		} as ProviderSettings
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("should not increment mistake count when Gemini provides grounding citations", async () => {
		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: mockApiConfiguration,
			task: "Test task",
			startTask: false,
		})

		// Wait for task mode initialization
		await task.waitForModeInitialization()

		// Simulate Gemini response with grounding citations
		task.assistantMessageContent = [
			{
				type: "text",
				content:
					"Here's information about Tailwind CSS v4:\n\nTailwind CSS v4 introduces several new features...\n\nSources: [1](https://tailwindcss.com/docs), [2](https://github.com/tailwindlabs/tailwindcss)",
				partial: false,
			},
		]

		// Set up the state that would normally be set during streaming
		task.userMessageContentReady = true
		task.userMessageContent = []

		const initialMistakeCount = task.consecutiveMistakeCount

		// Simulate the tool usage detection logic
		const didToolUse = task.assistantMessageContent.some((block) => block.type === "tool_use")

		// Check if this is a Gemini grounding response (contains citations/sources)
		const hasGeminiGrounding =
			task.apiConfiguration.apiProvider === "gemini" &&
			task.assistantMessageContent.some(
				(block) =>
					block.type === "text" &&
					block.content &&
					(block.content.includes("Sources:") ||
						block.content.includes("[1]") ||
						block.content.includes("[2]") ||
						/\[\d+\]\(https?:\/\/[^\)]+\)/.test(block.content)),
			)

		if (!didToolUse && !hasGeminiGrounding) {
			task.consecutiveMistakeCount++
		}

		// Verify that mistake count was NOT incremented due to grounding detection
		expect(task.consecutiveMistakeCount).toBe(initialMistakeCount)
		expect(hasGeminiGrounding).toBe(true)
		expect(didToolUse).toBe(false)
	})

	it("should increment mistake count when Gemini provides response without grounding or tools", async () => {
		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: mockApiConfiguration,
			task: "Test task",
			startTask: false,
		})

		// Wait for task mode initialization
		await task.waitForModeInitialization()

		// Simulate Gemini response without grounding citations or tools
		task.assistantMessageContent = [
			{
				type: "text",
				content: "Here's some general information about web development without any sources.",
				partial: false,
			},
		]

		// Set up the state that would normally be set during streaming
		task.userMessageContentReady = true
		task.userMessageContent = []

		const initialMistakeCount = task.consecutiveMistakeCount

		// Simulate the tool usage detection logic
		const didToolUse = task.assistantMessageContent.some((block) => block.type === "tool_use")

		// Check if this is a Gemini grounding response (contains citations/sources)
		const hasGeminiGrounding =
			task.apiConfiguration.apiProvider === "gemini" &&
			task.assistantMessageContent.some(
				(block) =>
					block.type === "text" &&
					block.content &&
					(block.content.includes("Sources:") ||
						block.content.includes("[1]") ||
						block.content.includes("[2]") ||
						/\[\d+\]\(https?:\/\/[^\)]+\)/.test(block.content)),
			)

		if (!didToolUse && !hasGeminiGrounding) {
			task.consecutiveMistakeCount++
		}

		// Verify that mistake count WAS incremented since no grounding was detected
		expect(task.consecutiveMistakeCount).toBe(initialMistakeCount + 1)
		expect(hasGeminiGrounding).toBe(false)
		expect(didToolUse).toBe(false)
	})

	it("should detect various grounding citation formats", async () => {
		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: mockApiConfiguration,
			task: "Test task",
			startTask: false,
		})

		// Wait for task mode initialization
		await task.waitForModeInitialization()

		const testCases = [
			{
				content: "Information here.\n\nSources: [1](https://example.com)",
				shouldDetectGrounding: true,
				description: "Sources with numbered links",
			},
			{
				content: "Some info [1](https://example.com) and more [2](https://another.com)",
				shouldDetectGrounding: true,
				description: "Inline numbered citations",
			},
			{
				content: "Text with [1] reference",
				shouldDetectGrounding: true,
				description: "Simple numbered reference",
			},
			{
				content: "Just regular text without any citations",
				shouldDetectGrounding: false,
				description: "No citations",
			},
			{
				content: "Text with [abc] but not numbered",
				shouldDetectGrounding: false,
				description: "Non-numbered brackets",
			},
		]

		for (const testCase of testCases) {
			task.assistantMessageContent = [
				{
					type: "text",
					content: testCase.content,
					partial: false,
				},
			]

			const hasGeminiGrounding =
				task.apiConfiguration.apiProvider === "gemini" &&
				task.assistantMessageContent.some(
					(block) =>
						block.type === "text" &&
						block.content &&
						(block.content.includes("Sources:") ||
							block.content.includes("[1]") ||
							block.content.includes("[2]") ||
							/\[\d+\]\(https?:\/\/[^\)]+\)/.test(block.content)),
				)

			expect(hasGeminiGrounding, `Failed for case: ${testCase.description}`).toBe(testCase.shouldDetectGrounding)
		}
	})

	it("should only apply grounding detection for Gemini provider", async () => {
		// Test with non-Gemini provider
		const nonGeminiConfig: ProviderSettings = {
			apiProvider: "anthropic",
			apiModelId: "claude-3-5-sonnet-20241022",
		} as ProviderSettings

		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: nonGeminiConfig,
			task: "Test task",
			startTask: false,
		})

		// Wait for task mode initialization
		await task.waitForModeInitialization()

		// Simulate response with citation-like content from non-Gemini provider
		task.assistantMessageContent = [
			{
				type: "text",
				content: "Here's information.\n\nSources: [1](https://example.com)",
				partial: false,
			},
		]

		const hasGeminiGrounding =
			task.apiConfiguration.apiProvider === "gemini" &&
			task.assistantMessageContent.some(
				(block) =>
					block.type === "text" &&
					block.content &&
					(block.content.includes("Sources:") ||
						block.content.includes("[1]") ||
						block.content.includes("[2]") ||
						/\[\d+\]\(https?:\/\/[^\)]+\)/.test(block.content)),
			)

		// Should not detect grounding for non-Gemini providers
		expect(hasGeminiGrounding).toBe(false)
	})
})
