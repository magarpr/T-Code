import { describe, it, expect, vi, beforeEach } from "vitest"
import OpenAI from "openai"
import { Anthropic } from "@anthropic-ai/sdk"

import { type SambaNovaModelId, sambaNovaModels } from "@roo-code/types"

import { SambaNovaHandler } from "../sambanova"

// Mock OpenAI
vi.mock("openai", () => {
	const mockCreate = vi.fn()
	return {
		default: vi.fn(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		})),
	}
})

describe("SambaNovaHandler", () => {
	let handler: SambaNovaHandler
	let mockCreate: any

	beforeEach(() => {
		vi.clearAllMocks()
		mockCreate = (OpenAI as unknown as any)().chat.completions.create
		handler = new SambaNovaHandler({ sambaNovaApiKey: "test-sambanova-api-key" })
	})

	it("should use the correct SambaNova base URL", () => {
		new SambaNovaHandler({ sambaNovaApiKey: "test-sambanova-api-key" })
		expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ baseURL: "https://api.sambanova.ai/v1" }))
	})

	it("should use the provided API key", () => {
		const sambaNovaApiKey = "test-sambanova-api-key"
		new SambaNovaHandler({ sambaNovaApiKey })
		expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: sambaNovaApiKey }))
	})

	it("should throw an error if API key is not provided", () => {
		expect(() => new SambaNovaHandler({} as any)).toThrow("API key is required")
	})

	it("should use the specified model when provided", () => {
		const testModelId: SambaNovaModelId = "Meta-Llama-3.3-70B-Instruct"
		const handlerWithModel = new SambaNovaHandler({
			apiModelId: testModelId,
			sambaNovaApiKey: "test-sambanova-api-key",
		})
		const model = handlerWithModel.getModel()
		expect(model.id).toBe(testModelId)
		expect(model.info).toEqual(sambaNovaModels[testModelId])
	})

	it("should use the default model when no model is specified", () => {
		const model = handler.getModel()
		expect(model.id).toBe("Meta-Llama-3.3-70B-Instruct")
		expect(model.info).toEqual(sambaNovaModels["Meta-Llama-3.3-70B-Instruct"])
	})

	describe("createMessage", () => {
		it("should create a streaming chat completion with correct parameters", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello",
				},
			]

			mockCreate.mockImplementation(() => {
				const chunks = [
					{
						choices: [{ delta: { content: "Hi there!" } }],
					},
					{
						choices: [{ delta: {} }],
						usage: { prompt_tokens: 10, completion_tokens: 5 },
					},
				]

				return {
					[Symbol.asyncIterator]: async function* () {
						for (const chunk of chunks) {
							yield chunk
						}
					},
				}
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const results = []
			for await (const chunk of stream) {
				results.push(chunk)
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "Meta-Llama-3.3-70B-Instruct",
					max_tokens: 8192,
					temperature: 0.7,
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: "Hello" },
					],
					stream: true,
					stream_options: { include_usage: true },
				}),
			)

			expect(results).toEqual([
				{ type: "text", text: "Hi there!" },
				{ type: "usage", inputTokens: 10, outputTokens: 5 },
			])
		})
	})

	describe("completePrompt", () => {
		it("should complete a prompt successfully", async () => {
			const prompt = "Test prompt"
			const expectedResponse = "Test response"

			mockCreate.mockResolvedValue({
				choices: [{ message: { content: expectedResponse } }],
			})

			const result = await handler.completePrompt(prompt)

			expect(mockCreate).toHaveBeenCalledWith({
				model: "Meta-Llama-3.3-70B-Instruct",
				messages: [{ role: "user", content: prompt }],
			})
			expect(result).toBe(expectedResponse)
		})

		it("should handle errors properly", async () => {
			const prompt = "Test prompt"
			const errorMessage = "API Error"

			mockCreate.mockRejectedValue(new Error(errorMessage))

			await expect(handler.completePrompt(prompt)).rejects.toThrow(`SambaNova completion error: ${errorMessage}`)
		})
	})

	describe("model selection", () => {
		it.each(Object.keys(sambaNovaModels) as SambaNovaModelId[])("should correctly handle model %s", (modelId) => {
			const modelInfo = sambaNovaModels[modelId]
			const handlerWithModel = new SambaNovaHandler({
				apiModelId: modelId,
				sambaNovaApiKey: "test-sambanova-api-key",
			})

			const model = handlerWithModel.getModel()
			expect(model.id).toBe(modelId)
			expect(model.info).toEqual(modelInfo)
		})
	})
})
