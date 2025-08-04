// npx vitest run src/api/providers/__tests__/fireworks.spec.ts

// Mock vscode first to avoid import errors
vitest.mock("vscode", () => ({}))

import OpenAI from "openai"
import { Anthropic } from "@anthropic-ai/sdk"

import { type FireworksModelId, fireworksDefaultModelId, fireworksModels } from "@roo-code/types"

import { FireworksHandler } from "../fireworks"

vitest.mock("openai", () => {
	const createMock = vitest.fn()
	return {
		default: vitest.fn(() => ({ chat: { completions: { create: createMock } } })),
	}
})

describe("FireworksHandler", () => {
	let handler: FireworksHandler
	let mockCreate: any

	beforeEach(() => {
		vitest.clearAllMocks()
		mockCreate = (OpenAI as unknown as any)().chat.completions.create
		handler = new FireworksHandler({ fireworksApiKey: "test-fireworks-api-key" })
	})

	it("should use the correct Fireworks base URL", () => {
		new FireworksHandler({ fireworksApiKey: "test-fireworks-api-key" })
		expect(OpenAI).toHaveBeenCalledWith(
			expect.objectContaining({ baseURL: "https://api.fireworks.ai/inference/v1" }),
		)
	})

	it("should use the provided API key", () => {
		const fireworksApiKey = "test-fireworks-api-key"
		new FireworksHandler({ fireworksApiKey })
		expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: fireworksApiKey }))
	})

	it("should return default model when no model is specified", () => {
		const model = handler.getModel()
		expect(model.id).toBe(fireworksDefaultModelId)
		expect(model.info).toEqual(fireworksModels[fireworksDefaultModelId])
	})

	it("should return specified model when valid model is provided", () => {
		const testModelId: FireworksModelId = "accounts/fireworks/models/llama-v3p1-70b-instruct"
		const handlerWithModel = new FireworksHandler({
			apiModelId: testModelId,
			fireworksApiKey: "test-fireworks-api-key",
		})
		const model = handlerWithModel.getModel()
		expect(model.id).toBe(testModelId)
		expect(model.info).toEqual(fireworksModels[testModelId])
	})

	it("completePrompt method should return text from Fireworks API", async () => {
		const expectedResponse = "This is a test response from Fireworks"
		mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: expectedResponse } }] })
		const result = await handler.completePrompt("test prompt")
		expect(result).toBe(expectedResponse)
	})

	it("should handle errors in completePrompt", async () => {
		const errorMessage = "Fireworks API error"
		mockCreate.mockRejectedValueOnce(new Error(errorMessage))
		await expect(handler.completePrompt("test prompt")).rejects.toThrow(
			`Fireworks completion error: ${errorMessage}`,
		)
	})

	it("createMessage should yield text content from stream", async () => {
		const testContent = "This is test content from Fireworks stream"

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
							value: { choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 20 } },
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

	it("createMessage should pass correct parameters to Fireworks client", async () => {
		const modelId: FireworksModelId = "accounts/fireworks/models/llama-v3p1-8b-instruct"
		const modelInfo = fireworksModels[modelId]
		const handlerWithModel = new FireworksHandler({
			apiModelId: modelId,
			fireworksApiKey: "test-fireworks-api-key",
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

		const systemPrompt = "Test system prompt for Fireworks"
		const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Test message for Fireworks" }]

		const messageGenerator = handlerWithModel.createMessage(systemPrompt, messages)
		await messageGenerator.next()

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: modelId,
				max_tokens: modelInfo.maxTokens,
				temperature: 0.7,
				messages: expect.arrayContaining([{ role: "system", content: systemPrompt }]),
				stream: true,
				stream_options: { include_usage: true },
			}),
		)
	})

	it("should support vision models with image content", async () => {
		const visionModelId: FireworksModelId = "accounts/fireworks/models/llama-v3p2-11b-vision-instruct"
		const handlerWithVisionModel = new FireworksHandler({
			apiModelId: visionModelId,
			fireworksApiKey: "test-fireworks-api-key",
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

		const systemPrompt = "Test system prompt for vision model"
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: [
					{ type: "text", text: "What's in this image?" },
					{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "base64data" } },
				],
			},
		]

		const messageGenerator = handlerWithVisionModel.createMessage(systemPrompt, messages)
		await messageGenerator.next()

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: visionModelId,
				messages: expect.arrayContaining([
					{ role: "system", content: systemPrompt },
					{
						role: "user",
						content: expect.arrayContaining([
							{ type: "text", text: "What's in this image?" },
							{ type: "image_url", image_url: { url: "data:image/jpeg;base64,base64data" } },
						]),
					},
				]),
			}),
		)
	})
})
