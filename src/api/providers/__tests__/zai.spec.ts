// npx vitest run src/api/providers/__tests__/zai.spec.ts

// Mock vscode first to avoid import errors
vitest.mock("vscode", () => ({}))

import OpenAI from "openai"
import { Anthropic } from "@anthropic-ai/sdk"

import {
	type InternationalZAiModelId,
	type MainlandZAiModelId,
	internationalZAiDefaultModelId,
	mainlandZAiDefaultModelId,
	internationalZAiModels,
	mainlandZAiModels,
	ZAI_DEFAULT_TEMPERATURE,
} from "@roo-code/types"

import { ZAiHandler } from "../zai"

vitest.mock("openai", () => {
	const createMock = vitest.fn()
	return {
		default: vitest.fn(() => ({ chat: { completions: { create: createMock } } })),
	}
})

describe("ZAiHandler", () => {
	let handler: ZAiHandler
	let mockCreate: any

	beforeEach(() => {
		vitest.clearAllMocks()
		mockCreate = (OpenAI as unknown as any)().chat.completions.create
	})

	describe("International Z AI", () => {
		beforeEach(() => {
			handler = new ZAiHandler({ zaiApiKey: "test-zai-api-key", zaiApiLine: "international" })
		})

		it("should use the correct international Z AI base URL", () => {
			new ZAiHandler({ zaiApiKey: "test-zai-api-key", zaiApiLine: "international" })
			expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ baseURL: "https://api.z.ai/api/paas/v4" }))
		})

		it("should use the provided API key for international", () => {
			const zaiApiKey = "test-zai-api-key"
			new ZAiHandler({ zaiApiKey, zaiApiLine: "international" })
			expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: zaiApiKey }))
		})

		it("should return international default model when no model is specified", () => {
			const model = handler.getModel()
			expect(model.id).toBe(internationalZAiDefaultModelId)
			expect(model.info).toEqual(internationalZAiModels[internationalZAiDefaultModelId])
		})

		it("should return specified international model when valid model is provided", () => {
			const testModelId: InternationalZAiModelId = "glm-4.5-air"
			const handlerWithModel = new ZAiHandler({
				apiModelId: testModelId,
				zaiApiKey: "test-zai-api-key",
				zaiApiLine: "international",
			})
			const model = handlerWithModel.getModel()
			expect(model.id).toBe(testModelId)
			expect(model.info).toEqual(internationalZAiModels[testModelId])
		})
	})

	describe("China Z AI", () => {
		beforeEach(() => {
			handler = new ZAiHandler({ zaiApiKey: "test-zai-api-key", zaiApiLine: "china" })
		})

		it("should use the correct China Z AI base URL", () => {
			new ZAiHandler({ zaiApiKey: "test-zai-api-key", zaiApiLine: "china" })
			expect(OpenAI).toHaveBeenCalledWith(
				expect.objectContaining({ baseURL: "https://open.bigmodel.cn/api/paas/v4" }),
			)
		})

		it("should use the provided API key for China", () => {
			const zaiApiKey = "test-zai-api-key"
			new ZAiHandler({ zaiApiKey, zaiApiLine: "china" })
			expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: zaiApiKey }))
		})

		it("should return China default model when no model is specified", () => {
			const model = handler.getModel()
			expect(model.id).toBe(mainlandZAiDefaultModelId)
			expect(model.info).toEqual(mainlandZAiModels[mainlandZAiDefaultModelId])
		})

		it("should return specified China model when valid model is provided", () => {
			const testModelId: MainlandZAiModelId = "glm-4.5-air"
			const handlerWithModel = new ZAiHandler({
				apiModelId: testModelId,
				zaiApiKey: "test-zai-api-key",
				zaiApiLine: "china",
			})
			const model = handlerWithModel.getModel()
			expect(model.id).toBe(testModelId)
			expect(model.info).toEqual(mainlandZAiModels[testModelId])
		})
	})

	describe("Default behavior", () => {
		it("should default to international when no zaiApiLine is specified", () => {
			const handlerDefault = new ZAiHandler({ zaiApiKey: "test-zai-api-key" })
			expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ baseURL: "https://api.z.ai/api/paas/v4" }))

			const model = handlerDefault.getModel()
			expect(model.id).toBe(internationalZAiDefaultModelId)
			expect(model.info).toEqual(internationalZAiModels[internationalZAiDefaultModelId])
		})

		it("should use 'not-provided' as default API key when none is specified", () => {
			new ZAiHandler({ zaiApiLine: "international" })
			expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "not-provided" }))
		})
	})

	describe("API Methods", () => {
		beforeEach(() => {
			handler = new ZAiHandler({ zaiApiKey: "test-zai-api-key", zaiApiLine: "international" })
		})

		it("completePrompt method should return text from Z AI API", async () => {
			const expectedResponse = "This is a test response from Z AI"
			mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: expectedResponse } }] })
			const result = await handler.completePrompt("test prompt")
			expect(result).toBe(expectedResponse)
		})

		it("should handle errors in completePrompt", async () => {
			const errorMessage = "Z AI API error"
			mockCreate.mockRejectedValueOnce(new Error(errorMessage))
			await expect(handler.completePrompt("test prompt")).rejects.toThrow(
				`Z AI completion error: ${errorMessage}`,
			)
		})

		it("createMessage should yield text content from stream", async () => {
			const testContent = "This is test content from Z AI stream"

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vitest
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: { choices: [{ delta: { content: testContent } }] },
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = handler.createMessage("system prompt", [])
			const firstChunk = await stream.next()

			expect(firstChunk.done).toBe(false)
			expect(firstChunk.value).toEqual({ type: "text", text: testContent })
		})

		it("createMessage should yield usage data from stream", async () => {
			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vitest
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									choices: [{ delta: {} }],
									usage: { prompt_tokens: 10, completion_tokens: 20 },
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = handler.createMessage("system prompt", [])
			const firstChunk = await stream.next()

			expect(firstChunk.done).toBe(false)
			expect(firstChunk.value).toEqual({ type: "usage", inputTokens: 10, outputTokens: 20 })
		})

		it("createMessage should pass correct parameters to Z AI client", async () => {
			const modelId: InternationalZAiModelId = "glm-4.5"
			const handlerWithModel = new ZAiHandler({
				apiModelId: modelId,
				zaiApiKey: "test-zai-api-key",
				zaiApiLine: "international",
			})

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						async next() {
							return { done: true }
						},
					}),
				}
			})

			const systemPrompt = "Test system prompt for Z AI"
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Test message for Z AI" }]

			const messageGenerator = handlerWithModel.createMessage(systemPrompt, messages)
			await messageGenerator.next()

			// For GLM-4.5, expect enhanced system prompt and adjusted parameters
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: modelId,
					max_tokens: 32768, // Adjusted for GLM models
					temperature: ZAI_DEFAULT_TEMPERATURE,
					messages: expect.arrayContaining([
						{
							role: "system",
							content: expect.stringContaining(systemPrompt), // Contains original prompt plus enhancements
						},
					]),
					stream: true,
					stream_options: { include_usage: true },
					top_p: 0.95,
					frequency_penalty: 0.1,
					presence_penalty: 0.1,
				}),
			)
		})

		it("should enhance system prompt for GLM-4.5 models", async () => {
			const modelId: InternationalZAiModelId = "glm-4.5"
			const handlerWithGLM = new ZAiHandler({
				apiModelId: modelId,
				zaiApiKey: "test-zai-api-key",
				zaiApiLine: "international",
			})

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						async next() {
							return { done: true }
						},
					}),
				}
			})

			const systemPrompt = "Test system prompt"
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Test message" }]

			const messageGenerator = handlerWithGLM.createMessage(systemPrompt, messages)
			await messageGenerator.next()

			// Check that the system prompt was enhanced with GLM-specific instructions
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: expect.arrayContaining([
						{
							role: "system",
							content: expect.stringContaining("CRITICAL INSTRUCTIONS FOR GLM MODEL"),
						},
					]),
				}),
			)
		})

		it("should apply max token adjustment for GLM-4.5 models", async () => {
			const modelId: InternationalZAiModelId = "glm-4.5"
			const handlerWithGLM = new ZAiHandler({
				apiModelId: modelId,
				zaiApiKey: "test-zai-api-key",
				zaiApiLine: "international",
			})

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						async next() {
							return { done: true }
						},
					}),
				}
			})

			const messageGenerator = handlerWithGLM.createMessage("system", [])
			await messageGenerator.next()

			// Check that max_tokens is capped at 32768 for GLM models
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					max_tokens: 32768,
					top_p: 0.95,
					frequency_penalty: 0.1,
					presence_penalty: 0.1,
				}),
			)
		})

		it("should enhance prompt in completePrompt for GLM-4.5 models", async () => {
			const modelId: InternationalZAiModelId = "glm-4.5"
			const handlerWithGLM = new ZAiHandler({
				apiModelId: modelId,
				zaiApiKey: "test-zai-api-key",
				zaiApiLine: "international",
			})

			const expectedResponse = "Test response"
			mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: expectedResponse } }] })

			const testPrompt = "Test prompt"
			await handlerWithGLM.completePrompt(testPrompt)

			// Check that the prompt was enhanced with GLM-specific prefix
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: [
						{
							role: "user",
							content: expect.stringContaining(
								"[INSTRUCTION] Please provide a direct and accurate response",
							),
						},
					],
					temperature: ZAI_DEFAULT_TEMPERATURE,
					max_tokens: 4096,
				}),
			)
		})

		it("should handle GLM-4.5-air model correctly", async () => {
			const modelId: InternationalZAiModelId = "glm-4.5-air"
			const handlerWithGLMAir = new ZAiHandler({
				apiModelId: modelId,
				zaiApiKey: "test-zai-api-key",
				zaiApiLine: "international",
			})

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						async next() {
							return { done: true }
						},
					}),
				}
			})

			const messageGenerator = handlerWithGLMAir.createMessage("system", [])
			await messageGenerator.next()

			// Should apply GLM enhancements for glm-4.5-air as well
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: modelId,
					max_tokens: 32768,
					messages: expect.arrayContaining([
						{
							role: "system",
							content: expect.stringContaining("CRITICAL INSTRUCTIONS FOR GLM MODEL"),
						},
					]),
				}),
			)
		})
	})
})
