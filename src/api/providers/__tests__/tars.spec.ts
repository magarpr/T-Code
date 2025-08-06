import { describe, it, expect, vitest, beforeEach } from "vitest"
import OpenAI from "openai"

import { tarsDefaultModelId, tarsDefaultModelInfo } from "@roo-code/types"

import { TarsHandler } from "../tars"
import { ApiHandlerOptions } from "../../../shared/api"

// Mock OpenAI
vitest.mock("openai", () => {
	const mockCreate = vitest.fn()
	const mockChat = {
		completions: {
			create: mockCreate,
		},
	}
	const MockOpenAI = vitest.fn(() => ({
		chat: mockChat,
	}))
	return { default: MockOpenAI }
})

describe("TarsHandler", () => {
	const mockOptions: ApiHandlerOptions = {
		tarsApiKey: "test-key",
		tarsModelId: "anthropic/claude-3-5-sonnet-20241022",
		tarsBaseUrl: "https://api.tetrate.io/v1",
	}

	beforeEach(() => {
		vitest.clearAllMocks()
	})

	it("initializes with correct options", () => {
		const handler = new TarsHandler(mockOptions)
		expect(handler).toBeInstanceOf(TarsHandler)

		// Verify OpenAI client was initialized with correct parameters
		expect(OpenAI).toHaveBeenCalledWith({
			baseURL: "https://api.tetrate.io/v1",
			apiKey: "test-key",
			defaultHeaders: expect.any(Object),
		})
	})

	it("uses default base URL when not provided", () => {
		const handler = new TarsHandler({ tarsApiKey: "test-key" })
		expect(handler).toBeInstanceOf(TarsHandler)

		expect(OpenAI).toHaveBeenCalledWith({
			baseURL: "https://api.tetrate.io/v1",
			apiKey: "test-key",
			defaultHeaders: expect.any(Object),
		})
	})

	describe("getModel", () => {
		it("returns correct model info when options are provided", () => {
			const handler = new TarsHandler(mockOptions)
			const result = handler.getModel()

			expect(result).toEqual({
				id: "anthropic/claude-3-5-sonnet-20241022",
				info: tarsDefaultModelInfo,
			})
		})

		it("returns default model info when options are not provided", () => {
			const handler = new TarsHandler({})
			const result = handler.getModel()

			expect(result).toEqual({
				id: tarsDefaultModelId,
				info: tarsDefaultModelInfo,
			})
		})
	})

	describe("createMessage", () => {
		it("generates correct stream chunks", async () => {
			const mockStream = {
				[Symbol.asyncIterator]: async function* () {
					yield {
						choices: [{ delta: { content: "Hello" } }],
						usage: null,
					}
					yield {
						choices: [{ delta: { content: " world" } }],
						usage: {
							prompt_tokens: 10,
							completion_tokens: 2,
							prompt_tokens_details: { cached_tokens: 5 },
						},
					}
				},
			}

			const mockCreate = vitest.fn().mockResolvedValue(mockStream)
			const mockOpenAI = vitest.fn(() => ({
				chat: { completions: { create: mockCreate } },
			}))
			;(OpenAI as any).mockImplementation(mockOpenAI)

			const handler = new TarsHandler(mockOptions)

			const chunks = []
			const generator = handler.createMessage("System prompt", [{ role: "user", content: "Hello" }])

			for await (const chunk of generator) {
				chunks.push(chunk)
			}

			expect(chunks).toEqual([
				{ type: "text", text: "Hello" },
				{ type: "text", text: " world" },
				{
					type: "usage",
					inputTokens: 10,
					outputTokens: 2,
					cacheReadTokens: 5,
					totalCost: 0,
				},
			])

			// The messages will have cache control added
			expect(mockCreate).toHaveBeenCalledWith({
				model: "anthropic/claude-3-5-sonnet-20241022",
				max_tokens: 8192,
				temperature: 0,
				messages: expect.arrayContaining([
					expect.objectContaining({ role: "system" }),
					expect.objectContaining({ role: "user" }),
				]),
				stream: true,
				stream_options: { include_usage: true },
			})
		})

		it("adds cache control for supported models", async () => {
			const mockStream = {
				[Symbol.asyncIterator]: async function* () {
					yield {
						choices: [{ delta: { content: "test" } }],
						usage: null,
					}
				},
			}

			const mockCreate = vitest.fn().mockResolvedValue(mockStream)
			const mockOpenAI = vitest.fn(() => ({
				chat: { completions: { create: mockCreate } },
			}))
			;(OpenAI as any).mockImplementation(mockOpenAI)

			const handler = new TarsHandler({
				...mockOptions,
				tarsModelId: "anthropic/claude-3-5-sonnet-20241022",
			})

			const generator = handler.createMessage("System prompt", [{ role: "user", content: "Hello" }])

			for await (const chunk of generator) {
				// Consume the generator
			}

			const call = mockCreate.mock.calls[0][0]

			// The cache breakpoints function should have been called
			expect(call.messages.length).toBe(2)
			expect(call.messages[0].role).toBe("system")
			expect(call.messages[1].role).toBe("user")

			// Messages should have cache control structure
			expect(call.messages[0].content).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "text",
						text: "System prompt",
						cache_control: expect.objectContaining({ type: "ephemeral" }),
					}),
				]),
			)
		})
	})

	describe("completePrompt", () => {
		it("returns correct response", async () => {
			const mockResponse = { choices: [{ message: { content: "test completion" } }] }

			const mockCreate = vitest.fn().mockResolvedValue(mockResponse)
			const mockOpenAI = vitest.fn(() => ({
				chat: { completions: { create: mockCreate } },
			}))
			;(OpenAI as any).mockImplementation(mockOpenAI)

			const handler = new TarsHandler(mockOptions)
			const result = await handler.completePrompt("test prompt")

			expect(result).toBe("test completion")
			expect(mockCreate).toHaveBeenCalledWith({
				model: "anthropic/claude-3-5-sonnet-20241022",
				max_tokens: 8192,
				temperature: 0,
				messages: [{ role: "user", content: "test prompt" }],
				stream: false,
			})
		})

		it("handles empty response", async () => {
			const mockResponse = { choices: [{ message: { content: null } }] }

			const mockCreate = vitest.fn().mockResolvedValue(mockResponse)
			const mockOpenAI = vitest.fn(() => ({
				chat: { completions: { create: mockCreate } },
			}))
			;(OpenAI as any).mockImplementation(mockOpenAI)

			const handler = new TarsHandler(mockOptions)
			const result = await handler.completePrompt("test prompt")

			expect(result).toBe("")
		})
	})
})
