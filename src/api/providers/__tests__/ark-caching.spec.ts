// npx vitest run api/providers/__tests__/ark-caching.spec.ts

import { Anthropic } from "@anthropic-ai/sdk"
import { OpenAiHandler } from "../openai"
import { ApiHandlerOptions } from "../../../shared/api"

const mockCreate = vitest.fn()

vitest.mock("openai", () => {
	return {
		__esModule: true,
		default: vitest.fn().mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		})),
	}
})

describe("OpenAiHandler - Ark Context Caching", () => {
	let handler: OpenAiHandler
	let arkOptions: ApiHandlerOptions

	beforeEach(() => {
		arkOptions = {
			openAiApiKey: "test-api-key",
			openAiModelId: "doubao-pro-4k",
			openAiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
		}
		handler = new OpenAiHandler(arkOptions)
		mockCreate.mockClear()
	})

	describe("Ark provider detection", () => {
		it("should detect Ark provider from volces.com URL", () => {
			expect(arkOptions.openAiBaseUrl).toContain(".volces.com")
		})

		it("should not detect Ark for non-volces URLs", () => {
			const nonArkHandler = new OpenAiHandler({
				...arkOptions,
				openAiBaseUrl: "https://api.openai.com/v1",
			})
			expect(nonArkHandler).toBeInstanceOf(OpenAiHandler)
		})
	})

	describe("context caching with streaming", () => {
		const systemPrompt = "You are a helpful assistant."
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: "Hello!",
			},
		]

		beforeEach(() => {
			mockCreate.mockImplementation(async (options) => {
				if (!options.stream) {
					return {
						id: "response-123",
						choices: [
							{
								message: { role: "assistant", content: "Test response" },
								finish_reason: "stop",
								index: 0,
							},
						],
						usage: {
							prompt_tokens: 10,
							completion_tokens: 5,
							total_tokens: 15,
							prompt_tokens_details: {
								cached_tokens: 8, // Ark-specific cached tokens
							},
						},
					}
				}

				return {
					[Symbol.asyncIterator]: async function* () {
						yield {
							id: "response-123",
							choices: [
								{
									delta: { content: "Test response" },
									index: 0,
								},
							],
							usage: {
								prompt_tokens: 10,
								completion_tokens: 5,
								total_tokens: 15,
								prompt_tokens_details: {
									cached_tokens: 8, // Ark-specific cached tokens
								},
							},
						}
					},
				}
			})
		})

		it("should add caching parameters for first request (no previous response ID)", async () => {
			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "doubao-pro-4k",
					caching: { type: "enabled" },
					cache_ttl: 3600,
					// Should not have previous_response_id for first request
				}),
				{},
			)

			// Should not have previous_response_id in the first call
			const callArgs = mockCreate.mock.calls[0][0]
			expect(callArgs).not.toHaveProperty("previous_response_id")
		})

		it("should include previous_response_id for subsequent requests", async () => {
			// First request
			const stream1 = handler.createMessage(systemPrompt, messages)
			for await (const _chunk of stream1) {
				// Consume stream to store response ID
			}

			mockCreate.mockClear()

			// Second request should include previous response ID
			const stream2 = handler.createMessage(systemPrompt, [
				...messages,
				{
					role: "assistant",
					content: "Test response",
				},
				{
					role: "user",
					content: "Follow up question",
				},
			])
			for await (const _chunk of stream2) {
				// Consume stream
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "doubao-pro-4k",
					caching: { type: "enabled" },
					cache_ttl: 3600,
					previous_response_id: "response-123",
				}),
				{},
			)
		})

		it("should process cached tokens in usage metrics", async () => {
			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			const usageChunk = chunks.find((chunk) => chunk.type === "usage")
			expect(usageChunk).toBeDefined()
			expect(usageChunk.inputTokens).toBe(10)
			expect(usageChunk.outputTokens).toBe(5)
			expect(usageChunk.cacheReadTokens).toBe(8) // Ark cached tokens
		})
	})

	describe("context caching with non-streaming", () => {
		const systemPrompt = "You are a helpful assistant."
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: "Hello!",
			},
		]

		beforeEach(() => {
			handler = new OpenAiHandler({
				...arkOptions,
				openAiStreamingEnabled: false,
			})

			mockCreate.mockImplementation(async (options) => {
				return {
					id: "response-456",
					choices: [
						{
							message: { role: "assistant", content: "Non-streaming response" },
							finish_reason: "stop",
							index: 0,
						},
					],
					usage: {
						prompt_tokens: 15,
						completion_tokens: 8,
						total_tokens: 23,
						prompt_tokens_details: {
							cached_tokens: 12, // Ark-specific cached tokens
						},
					},
				}
			})
		})

		it("should add caching parameters for non-streaming requests", async () => {
			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "doubao-pro-4k",
					caching: { type: "enabled" },
					cache_ttl: 3600,
				}),
				{},
			)
		})

		it("should process cached tokens in non-streaming usage metrics", async () => {
			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			const usageChunk = chunks.find((chunk) => chunk.type === "usage")
			expect(usageChunk).toBeDefined()
			expect(usageChunk.inputTokens).toBe(15)
			expect(usageChunk.outputTokens).toBe(8)
			expect(usageChunk.cacheReadTokens).toBe(12) // Ark cached tokens
		})

		it("should store response ID for future requests", async () => {
			// First request
			const stream1 = handler.createMessage(systemPrompt, messages)
			for await (const _chunk of stream1) {
				// Consume stream to store response ID
			}

			mockCreate.mockClear()

			// Second request should include previous response ID
			const stream2 = handler.createMessage(systemPrompt, messages)
			for await (const _chunk of stream2) {
				// Consume stream
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					previous_response_id: "response-456",
				}),
				{},
			)
		})
	})

	describe("O3 family models with Ark caching", () => {
		beforeEach(() => {
			handler = new OpenAiHandler({
				...arkOptions,
				openAiModelId: "o3-mini", // O3 family model
			})

			mockCreate.mockImplementation(async (options) => {
				if (!options.stream) {
					return {
						id: "o3-response-789",
						choices: [
							{
								message: { role: "assistant", content: "O3 response" },
								finish_reason: "stop",
								index: 0,
							},
						],
						usage: {
							prompt_tokens: 20,
							completion_tokens: 10,
							total_tokens: 30,
							prompt_tokens_details: {
								cached_tokens: 15,
							},
						},
					}
				}

				return {
					[Symbol.asyncIterator]: async function* () {
						yield {
							id: "o3-response-789",
							choices: [
								{
									delta: { content: "O3 streaming response" },
									index: 0,
								},
							],
							usage: {
								prompt_tokens: 20,
								completion_tokens: 10,
								total_tokens: 30,
								prompt_tokens_details: {
									cached_tokens: 15,
								},
							},
						}
					},
				}
			})
		})

		it("should add caching parameters for O3 family streaming requests", async () => {
			const stream = handler.createMessage("System prompt", [
				{
					role: "user",
					content: "Hello O3!",
				},
			])
			for await (const _chunk of stream) {
				// Consume stream
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "o3-mini",
					caching: { type: "enabled" },
					cache_ttl: 3600,
					reasoning_effort: undefined, // O3 specific
					temperature: undefined, // O3 specific
				}),
				{},
			)
		})

		it("should add caching parameters for O3 family non-streaming requests", async () => {
			handler = new OpenAiHandler({
				...arkOptions,
				openAiModelId: "o3-mini",
				openAiStreamingEnabled: false,
			})

			const stream = handler.createMessage("System prompt", [
				{
					role: "user",
					content: "Hello O3!",
				},
			])
			for await (const _chunk of stream) {
				// Consume stream
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "o3-mini",
					caching: { type: "enabled" },
					cache_ttl: 3600,
					reasoning_effort: undefined,
					temperature: undefined,
				}),
				{},
			)
		})
	})

	describe("edge cases", () => {
		it("should handle missing usage data gracefully", async () => {
			mockCreate.mockImplementation(async (options) => {
				if (!options.stream) {
					return {
						id: "response-no-usage",
						choices: [
							{
								message: { role: "assistant", content: "Response without usage" },
								finish_reason: "stop",
								index: 0,
							},
						],
						// No usage data
					}
				}

				return {
					[Symbol.asyncIterator]: async function* () {
						yield {
							id: "response-no-usage",
							choices: [
								{
									delta: { content: "Response without usage" },
									index: 0,
								},
							],
							// No usage data
						}
					},
				}
			})

			const stream = handler.createMessage("System prompt", [
				{
					role: "user",
					content: "Hello!",
				},
			])
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should not crash and should not yield usage chunk
			const usageChunks = chunks.filter((chunk) => chunk.type === "usage")
			expect(usageChunks).toHaveLength(0)
		})

		it("should handle missing cached tokens gracefully", async () => {
			mockCreate.mockImplementation(async (options) => {
				return {
					id: "response-no-cache",
					choices: [
						{
							message: { role: "assistant", content: "Response without cached tokens" },
							finish_reason: "stop",
							index: 0,
						},
					],
					usage: {
						prompt_tokens: 10,
						completion_tokens: 5,
						total_tokens: 15,
						// No prompt_tokens_details.cached_tokens
					},
				}
			})

			handler = new OpenAiHandler({
				...arkOptions,
				openAiStreamingEnabled: false,
			})

			const stream = handler.createMessage("System prompt", [
				{
					role: "user",
					content: "Hello!",
				},
			])
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			const usageChunk = chunks.find((chunk) => chunk.type === "usage")
			expect(usageChunk).toBeDefined()
			expect(usageChunk.inputTokens).toBe(10)
			expect(usageChunk.outputTokens).toBe(5)
			expect(usageChunk.cacheReadTokens).toBeUndefined() // No cached tokens
		})

		it("should handle missing response ID gracefully", async () => {
			mockCreate.mockImplementation(async (options) => {
				return {
					// No id field
					choices: [
						{
							message: { role: "assistant", content: "Response without ID" },
							finish_reason: "stop",
							index: 0,
						},
					],
					usage: {
						prompt_tokens: 10,
						completion_tokens: 5,
						total_tokens: 15,
					},
				}
			})

			handler = new OpenAiHandler({
				...arkOptions,
				openAiStreamingEnabled: false,
			})

			const stream = handler.createMessage("System prompt", [
				{
					role: "user",
					content: "Hello!",
				},
			])
			for await (const _chunk of stream) {
				// Consume stream
			}

			// Should not crash, and subsequent requests should not have previous_response_id
			mockCreate.mockClear()

			const stream2 = handler.createMessage("System prompt", [
				{
					role: "user",
					content: "Follow up",
				},
			])
			for await (const _chunk of stream2) {
				// Consume stream
			}

			const callArgs = mockCreate.mock.calls[0][0]
			expect(callArgs).not.toHaveProperty("previous_response_id")
		})
	})
})
