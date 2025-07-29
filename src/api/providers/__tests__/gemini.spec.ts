// npx vitest run src/api/providers/__tests__/gemini.spec.ts

import { Anthropic } from "@anthropic-ai/sdk"

import { type ModelInfo, geminiDefaultModelId } from "@roo-code/types"

import { t } from "i18next"
import { GeminiHandler } from "../gemini"

// Mock the translation function
vitest.mock("i18next", () => ({
	t: vitest.fn((key: string) => {
		if (key === "common:errors.gemini.sources") return "Sources:"
		if (key === "common:errors.gemini.generate_complete_prompt") return "Gemini completion error: {{error}}"
		return key
	}),
}))

const GEMINI_20_FLASH_THINKING_NAME = "gemini-2.0-flash-thinking-exp-1219"

describe("GeminiHandler", () => {
	let handler: GeminiHandler

	beforeEach(() => {
		// Create mock functions
		const mockGenerateContentStream = vitest.fn()
		const mockGenerateContent = vitest.fn()
		const mockGetGenerativeModel = vitest.fn()

		handler = new GeminiHandler({
			apiKey: "test-key",
			apiModelId: GEMINI_20_FLASH_THINKING_NAME,
			geminiApiKey: "test-key",
		})

		// Replace the client with our mock
		handler["client"] = {
			models: {
				generateContentStream: mockGenerateContentStream,
				generateContent: mockGenerateContent,
				getGenerativeModel: mockGetGenerativeModel,
			},
		} as any
	})

	describe("constructor", () => {
		it("should initialize with provided config", () => {
			expect(handler["options"].geminiApiKey).toBe("test-key")
			expect(handler["options"].apiModelId).toBe(GEMINI_20_FLASH_THINKING_NAME)
		})
	})

	describe("createMessage", () => {
		const mockMessages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: "Hello",
			},
			{
				role: "assistant",
				content: "Hi there!",
			},
		]

		const systemPrompt = "You are a helpful assistant"

		it("should handle text messages correctly", async () => {
			// Setup the mock implementation to return an async generator
			;(handler["client"].models.generateContentStream as any).mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield { text: "Hello" }
					yield { text: " world!" }
					yield { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }
				},
			})

			const stream = handler.createMessage(systemPrompt, mockMessages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should have 3 chunks: 'Hello', ' world!', and usage info
			expect(chunks.length).toBe(3)
			expect(chunks[0]).toEqual({ type: "text", text: "Hello" })
			expect(chunks[1]).toEqual({ type: "text", text: " world!" })
			expect(chunks[2]).toEqual({ type: "usage", inputTokens: 10, outputTokens: 5 })

			// Verify the call to generateContentStream
			expect(handler["client"].models.generateContentStream).toHaveBeenCalledWith(
				expect.objectContaining({
					model: GEMINI_20_FLASH_THINKING_NAME,
					config: expect.objectContaining({
						temperature: 0,
						systemInstruction: systemPrompt,
					}),
				}),
			)
		})

		it("should handle API errors", async () => {
			const mockError = new Error("Gemini API error")
			;(handler["client"].models.generateContentStream as any).mockRejectedValue(mockError)

			const stream = handler.createMessage(systemPrompt, mockMessages)

			await expect(async () => {
				for await (const _chunk of stream) {
					// Should throw before yielding any chunks
				}
			}).rejects.toThrow()
		})

		it("should integrate grounding sources into the assistant message", async () => {
			// Setup the mock implementation to return an async generator with grounding metadata
			;(handler["client"].models.generateContentStream as any).mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield {
						candidates: [
							{
								content: {
									parts: [{ text: "Here is some information about AI." }],
								},
								groundingMetadata: {
									groundingChunks: [
										{ web: { uri: "https://example.com/ai-info" } },
										{ web: { uri: "https://example.com/ai-research" } },
									],
								},
							},
						],
					}
					yield { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 15 } }
				},
			})

			const stream = handler.createMessage(systemPrompt, mockMessages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should have 3 chunks: main content, sources, and usage info
			expect(chunks.length).toBe(3)
			expect(chunks[0]).toEqual({ type: "text", text: "Here is some information about AI." })
			expect(chunks[1]).toEqual({
				type: "text",
				text: "\n\nSources: [1](https://example.com/ai-info), [2](https://example.com/ai-research)",
			})
			expect(chunks[2]).toEqual({ type: "usage", inputTokens: 10, outputTokens: 15 })
		})

		it("should handle grounding metadata without web sources", async () => {
			// Setup the mock implementation with grounding metadata but no web sources
			;(handler["client"].models.generateContentStream as any).mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield {
						candidates: [
							{
								content: {
									parts: [{ text: "Response without web sources." }],
								},
								groundingMetadata: {
									groundingChunks: [{ someOtherSource: { data: "non-web-source" } }],
								},
							},
						],
					}
					yield { usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 8 } }
				},
			})

			const stream = handler.createMessage(systemPrompt, mockMessages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should have 2 chunks: main content and usage info (no sources since no web URIs)
			expect(chunks.length).toBe(2)
			expect(chunks[0]).toEqual({ type: "text", text: "Response without web sources." })
			expect(chunks[1]).toEqual({ type: "usage", inputTokens: 5, outputTokens: 8 })
		})

		it("should not yield sources when no content is generated", async () => {
			// Setup the mock implementation with grounding metadata but no content
			;(handler["client"].models.generateContentStream as any).mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield {
						candidates: [
							{
								groundingMetadata: {
									groundingChunks: [{ web: { uri: "https://example.com/source" } }],
								},
							},
						],
					}
					yield { usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 0 } }
				},
			})

			const stream = handler.createMessage(systemPrompt, mockMessages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should only have usage info, no sources since no content was yielded
			expect(chunks.length).toBe(1)
			expect(chunks[0]).toEqual({ type: "usage", inputTokens: 5, outputTokens: 0 })
		})

		it("should handle multiple text chunks with grounding sources", async () => {
			// Setup the mock implementation with multiple text chunks and grounding
			;(handler["client"].models.generateContentStream as any).mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield {
						candidates: [
							{
								content: {
									parts: [{ text: "First part of response" }],
								},
							},
						],
					}
					yield {
						candidates: [
							{
								content: {
									parts: [{ text: " and second part." }],
								},
								groundingMetadata: {
									groundingChunks: [{ web: { uri: "https://example.com/source1" } }],
								},
							},
						],
					}
					yield { usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 18 } }
				},
			})

			const stream = handler.createMessage(systemPrompt, mockMessages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should have 4 chunks: two text chunks, sources, and usage info
			expect(chunks.length).toBe(4)
			expect(chunks[0]).toEqual({ type: "text", text: "First part of response" })
			expect(chunks[1]).toEqual({ type: "text", text: " and second part." })
			expect(chunks[2]).toEqual({
				type: "text",
				text: "\n\nSources: [1](https://example.com/source1)",
			})
			expect(chunks[3]).toEqual({ type: "usage", inputTokens: 12, outputTokens: 18 })
		})
	})

	describe("completePrompt", () => {
		it("should complete prompt successfully", async () => {
			// Mock the response with text property
			;(handler["client"].models.generateContent as any).mockResolvedValue({
				text: "Test response",
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")

			// Verify the call to generateContent
			expect(handler["client"].models.generateContent).toHaveBeenCalledWith({
				model: GEMINI_20_FLASH_THINKING_NAME,
				contents: [{ role: "user", parts: [{ text: "Test prompt" }] }],
				config: {
					httpOptions: undefined,
					temperature: 0,
				},
			})
		})

		it("should handle API errors", async () => {
			const mockError = new Error("Gemini API error")
			;(handler["client"].models.generateContent as any).mockRejectedValue(mockError)

			await expect(handler.completePrompt("Test prompt")).rejects.toThrow(
				t("common:errors.gemini.generate_complete_prompt", { error: "Gemini API error" }),
			)
		})

		it("should handle empty response", async () => {
			// Mock the response with empty text
			;(handler["client"].models.generateContent as any).mockResolvedValue({
				text: "",
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})

		it("should integrate grounding sources in completePrompt", async () => {
			// Mock the response with grounding metadata
			;(handler["client"].models.generateContent as any).mockResolvedValue({
				text: "AI is a fascinating field of study.",
				candidates: [
					{
						groundingMetadata: {
							groundingChunks: [
								{ web: { uri: "https://example.com/ai-study" } },
								{ web: { uri: "https://example.com/ai-research" } },
							],
						},
					},
				],
			})

			const result = await handler.completePrompt("Tell me about AI")
			expect(result).toBe(
				"AI is a fascinating field of study.\n\nSources: [1](https://example.com/ai-study), [2](https://example.com/ai-research)",
			)
		})

		it("should handle completePrompt without grounding sources", async () => {
			// Mock the response without grounding metadata
			;(handler["client"].models.generateContent as any).mockResolvedValue({
				text: "Simple response without sources.",
			})

			const result = await handler.completePrompt("Simple question")
			expect(result).toBe("Simple response without sources.")
		})
	})

	describe("getModel", () => {
		it("should return correct model info", () => {
			const modelInfo = handler.getModel()
			expect(modelInfo.id).toBe(GEMINI_20_FLASH_THINKING_NAME)
			expect(modelInfo.info).toBeDefined()
			expect(modelInfo.info.maxTokens).toBe(8192)
			expect(modelInfo.info.contextWindow).toBe(32_767)
		})

		it("should return default model if invalid model specified", () => {
			const invalidHandler = new GeminiHandler({
				apiModelId: "invalid-model",
				geminiApiKey: "test-key",
			})
			const modelInfo = invalidHandler.getModel()
			expect(modelInfo.id).toBe(geminiDefaultModelId) // Default model
		})
	})

	describe("calculateCost", () => {
		// Mock ModelInfo based on gemini-1.5-flash-latest pricing (per 1M tokens)
		// Removed 'id' and 'name' as they are not part of ModelInfo type directly
		const mockInfo: ModelInfo = {
			inputPrice: 0.125, // $/1M tokens
			outputPrice: 0.375, // $/1M tokens
			cacheWritesPrice: 0.125, // Assume same as input for test
			cacheReadsPrice: 0.125 * 0.25, // Assume 0.25x input for test
			contextWindow: 1_000_000,
			maxTokens: 8192,
			supportsPromptCache: true, // Enable cache calculations for tests
		}

		it("should calculate cost correctly based on input and output tokens", () => {
			const inputTokens = 10000 // Use larger numbers for per-million pricing
			const outputTokens = 20000
			// Added non-null assertions (!) as mockInfo guarantees these values
			const expectedCost =
				(inputTokens / 1_000_000) * mockInfo.inputPrice! + (outputTokens / 1_000_000) * mockInfo.outputPrice!

			const cost = handler.calculateCost({ info: mockInfo, inputTokens, outputTokens })
			expect(cost).toBeCloseTo(expectedCost)
		})

		it("should return 0 if token counts are zero", () => {
			// Note: The method expects numbers, not undefined. Passing undefined would be a type error.
			// The calculateCost method itself returns undefined if prices are missing, but 0 if tokens are 0 and prices exist.
			expect(handler.calculateCost({ info: mockInfo, inputTokens: 0, outputTokens: 0 })).toBe(0)
		})

		it("should handle only input tokens", () => {
			const inputTokens = 5000
			// Added non-null assertion (!)
			const expectedCost = (inputTokens / 1_000_000) * mockInfo.inputPrice!
			expect(handler.calculateCost({ info: mockInfo, inputTokens, outputTokens: 0 })).toBeCloseTo(expectedCost)
		})

		it("should handle only output tokens", () => {
			const outputTokens = 15000
			// Added non-null assertion (!)
			const expectedCost = (outputTokens / 1_000_000) * mockInfo.outputPrice!
			expect(handler.calculateCost({ info: mockInfo, inputTokens: 0, outputTokens })).toBeCloseTo(expectedCost)
		})

		it("should calculate cost with cache write tokens", () => {
			const inputTokens = 10000
			const outputTokens = 20000
			const cacheWriteTokens = 5000
			const CACHE_TTL = 5 // Match the constant in gemini.ts

			// Added non-null assertions (!)
			const expectedInputCost = (inputTokens / 1_000_000) * mockInfo.inputPrice!
			const expectedOutputCost = (outputTokens / 1_000_000) * mockInfo.outputPrice!
			const expectedCacheWriteCost =
				mockInfo.cacheWritesPrice! * (cacheWriteTokens / 1_000_000) * (CACHE_TTL / 60)
			const expectedCost = expectedInputCost + expectedOutputCost + expectedCacheWriteCost

			const cost = handler.calculateCost({ info: mockInfo, inputTokens, outputTokens })
			expect(cost).toBeCloseTo(expectedCost)
		})

		it("should calculate cost with cache read tokens", () => {
			const inputTokens = 10000 // Total logical input
			const outputTokens = 20000
			const cacheReadTokens = 8000 // Part of inputTokens read from cache

			const uncachedReadTokens = inputTokens - cacheReadTokens
			// Added non-null assertions (!)
			const expectedInputCost = (uncachedReadTokens / 1_000_000) * mockInfo.inputPrice!
			const expectedOutputCost = (outputTokens / 1_000_000) * mockInfo.outputPrice!
			const expectedCacheReadCost = mockInfo.cacheReadsPrice! * (cacheReadTokens / 1_000_000)
			const expectedCost = expectedInputCost + expectedOutputCost + expectedCacheReadCost

			const cost = handler.calculateCost({ info: mockInfo, inputTokens, outputTokens, cacheReadTokens })
			expect(cost).toBeCloseTo(expectedCost)
		})

		it("should return undefined if pricing info is missing", () => {
			// Create a copy and explicitly set a price to undefined
			const incompleteInfo: ModelInfo = { ...mockInfo, outputPrice: undefined }
			const cost = handler.calculateCost({ info: incompleteInfo, inputTokens: 1000, outputTokens: 1000 })
			expect(cost).toBeUndefined()
		})
	})
})
