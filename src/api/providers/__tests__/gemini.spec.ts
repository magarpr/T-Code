// npx vitest run src/api/providers/__tests__/gemini.spec.ts

import { Anthropic } from "@anthropic-ai/sdk"

import { type ModelInfo, geminiDefaultModelId } from "@roo-code/types"

import { t } from "i18next"
import { GeminiHandler } from "../gemini"
import { BaseProvider } from "../base-provider"

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

	describe("countTokens", () => {
		const mockContent: Anthropic.Messages.ContentBlockParam[] = [
			{
				type: "text",
				text: "Hello world",
			},
		]

		beforeEach(() => {
			// Add countTokens mock to the client
			handler["client"].models.countTokens = vitest.fn()
		})

		it("should return token count from Gemini API when valid", async () => {
			// Mock successful response with valid totalTokens
			;(handler["client"].models.countTokens as any).mockResolvedValue({
				totalTokens: 42,
			})

			const result = await handler.countTokens(mockContent)
			expect(result).toBe(42)

			// Verify the API was called correctly
			expect(handler["client"].models.countTokens).toHaveBeenCalledWith({
				model: GEMINI_20_FLASH_THINKING_NAME,
				contents: expect.any(Object),
			})
		})

		it("should fall back to base provider when totalTokens is undefined", async () => {
			// Mock response with undefined totalTokens
			;(handler["client"].models.countTokens as any).mockResolvedValue({
				totalTokens: undefined,
			})

			// Spy on the base provider's countTokens method
			const baseCountTokensSpy = vitest.spyOn(BaseProvider.prototype, "countTokens")
			baseCountTokensSpy.mockResolvedValue(100)

			const result = await handler.countTokens(mockContent)
			expect(result).toBe(100)
			expect(baseCountTokensSpy).toHaveBeenCalledWith(mockContent)
		})

		it("should fall back to base provider when totalTokens is null", async () => {
			// Mock response with null totalTokens
			;(handler["client"].models.countTokens as any).mockResolvedValue({
				totalTokens: null,
			})

			// Spy on the base provider's countTokens method
			const baseCountTokensSpy = vitest.spyOn(BaseProvider.prototype, "countTokens")
			baseCountTokensSpy.mockResolvedValue(100)

			const result = await handler.countTokens(mockContent)
			expect(result).toBe(100)
			expect(baseCountTokensSpy).toHaveBeenCalledWith(mockContent)
		})

		it("should fall back to base provider when totalTokens is NaN", async () => {
			// Mock response with NaN totalTokens
			;(handler["client"].models.countTokens as any).mockResolvedValue({
				totalTokens: NaN,
			})

			// Spy on the base provider's countTokens method
			const baseCountTokensSpy = vitest.spyOn(BaseProvider.prototype, "countTokens")
			baseCountTokensSpy.mockResolvedValue(100)

			const result = await handler.countTokens(mockContent)
			expect(result).toBe(100)
			expect(baseCountTokensSpy).toHaveBeenCalledWith(mockContent)
		})

		it("should return 0 when totalTokens is 0", async () => {
			// Mock response with 0 totalTokens - this should be valid
			;(handler["client"].models.countTokens as any).mockResolvedValue({
				totalTokens: 0,
			})

			const result = await handler.countTokens(mockContent)
			expect(result).toBe(0)
		})

		it("should fall back to base provider on API error", async () => {
			// Mock API error
			;(handler["client"].models.countTokens as any).mockRejectedValue(new Error("API Error"))

			// Spy on the base provider's countTokens method
			const baseCountTokensSpy = vitest.spyOn(BaseProvider.prototype, "countTokens")
			baseCountTokensSpy.mockResolvedValue(100)

			const result = await handler.countTokens(mockContent)
			expect(result).toBe(100)
			expect(baseCountTokensSpy).toHaveBeenCalledWith(mockContent)
		})
	})
})
