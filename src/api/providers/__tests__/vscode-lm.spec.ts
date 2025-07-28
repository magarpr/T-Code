import type { Mock } from "vitest"

// Mocks must come first, before imports
vi.mock("vscode", () => {
	class MockLanguageModelTextPart {
		type = "text"
		constructor(public value: string) {}
	}

	class MockLanguageModelToolCallPart {
		type = "tool_call"
		constructor(
			public callId: string,
			public name: string,
			public input: any,
		) {}
	}

	return {
		workspace: {
			onDidChangeConfiguration: vi.fn((_callback) => ({
				dispose: vi.fn(),
			})),
		},
		CancellationTokenSource: vi.fn(() => ({
			token: {
				isCancellationRequested: false,
				onCancellationRequested: vi.fn(),
			},
			cancel: vi.fn(),
			dispose: vi.fn(),
		})),
		CancellationError: class CancellationError extends Error {
			constructor() {
				super("Operation cancelled")
				this.name = "CancellationError"
			}
		},
		LanguageModelChatMessage: {
			Assistant: vi.fn((content) => ({
				role: "assistant",
				content: Array.isArray(content) ? content : [new MockLanguageModelTextPart(content)],
			})),
			User: vi.fn((content) => ({
				role: "user",
				content: Array.isArray(content) ? content : [new MockLanguageModelTextPart(content)],
			})),
		},
		LanguageModelTextPart: MockLanguageModelTextPart,
		LanguageModelToolCallPart: MockLanguageModelToolCallPart,
		lm: {
			selectChatModels: vi.fn(),
		},
	}
})

import * as vscode from "vscode"
import { VsCodeLmHandler } from "../vscode-lm"
import type { ApiHandlerOptions } from "../../../shared/api"
import type { Anthropic } from "@anthropic-ai/sdk"

const mockLanguageModelChat = {
	id: "test-model",
	name: "Test Model",
	vendor: "test-vendor",
	family: "test-family",
	version: "1.0",
	maxInputTokens: 4096,
	sendRequest: vi.fn(),
	countTokens: vi.fn(),
}

describe("VsCodeLmHandler", () => {
	let handler: VsCodeLmHandler
	const defaultOptions: ApiHandlerOptions = {
		vsCodeLmModelSelector: {
			vendor: "test-vendor",
			family: "test-family",
		},
	}

	beforeEach(() => {
		vi.clearAllMocks()
		handler = new VsCodeLmHandler(defaultOptions)
	})

	afterEach(() => {
		handler.dispose()
	})

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			expect(handler).toBeDefined()
			expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled()
		})

		it("should handle configuration changes", () => {
			const callback = (vscode.workspace.onDidChangeConfiguration as Mock).mock.calls[0][0]
			callback({ affectsConfiguration: () => true })
			// Should reset client when config changes
			expect(handler["client"]).toBeNull()
		})
	})

	describe("createClient", () => {
		it("should create client with selector", async () => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([mockModel])

			const client = await handler["createClient"]({
				vendor: "test-vendor",
				family: "test-family",
			})

			expect(client).toBeDefined()
			expect(client.id).toBe("test-model")
			expect(vscode.lm.selectChatModels).toHaveBeenCalledWith({
				vendor: "test-vendor",
				family: "test-family",
			})
		})

		it("should return default client when no models available", async () => {
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([])

			const client = await handler["createClient"]({})

			expect(client).toBeDefined()
			expect(client.id).toBe("default-lm")
			expect(client.vendor).toBe("vscode")
		})
	})

	describe("createMessage", () => {
		beforeEach(() => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([mockModel])
			mockLanguageModelChat.countTokens.mockResolvedValue(10)

			// Override the default client with our test client
			handler["client"] = mockLanguageModelChat
		})

		it("should stream text responses", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user" as const,
					content: "Hello",
				},
			]

			const responseText = "Hello! How can I help you?"
			mockLanguageModelChat.sendRequest.mockResolvedValueOnce({
				stream: (async function* () {
					yield new vscode.LanguageModelTextPart(responseText)
					return
				})(),
				text: (async function* () {
					yield responseText
					return
				})(),
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(2) // Text chunk + usage chunk
			expect(chunks[0]).toEqual({
				type: "text",
				text: responseText,
			})
			expect(chunks[1]).toMatchObject({
				type: "usage",
				inputTokens: expect.any(Number),
				outputTokens: expect.any(Number),
			})
		})

		it("should handle tool calls", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user" as const,
					content: "Calculate 2+2",
				},
			]

			const toolCallData = {
				name: "calculator",
				arguments: { operation: "add", numbers: [2, 2] },
				callId: "call-1",
			}

			mockLanguageModelChat.sendRequest.mockResolvedValueOnce({
				stream: (async function* () {
					yield new vscode.LanguageModelToolCallPart(
						toolCallData.callId,
						toolCallData.name,
						toolCallData.arguments,
					)
					return
				})(),
				text: (async function* () {
					yield JSON.stringify({ type: "tool_call", ...toolCallData })
					return
				})(),
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(2) // Tool call chunk + usage chunk
			expect(chunks[0]).toEqual({
				type: "text",
				text: JSON.stringify({ type: "tool_call", ...toolCallData }),
			})
		})

		it("should handle errors", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user" as const,
					content: "Hello",
				},
			]

			mockLanguageModelChat.sendRequest.mockRejectedValueOnce(new Error("API Error"))

			await expect(handler.createMessage(systemPrompt, messages).next()).rejects.toThrow("API Error")
		})
	})

	describe("getModel", () => {
		it("should return model info when client exists", async () => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([mockModel])

			// Initialize client
			await handler["getClient"]()

			const model = handler.getModel()
			expect(model.id).toBe("test-model")
			expect(model.info).toBeDefined()
			expect(model.info.contextWindow).toBe(4096)
		})

		it("should return fallback model info when no client exists", () => {
			// Clear the client first
			handler["client"] = null
			const model = handler.getModel()
			expect(model.id).toBe("test-vendor/test-family")
			expect(model.info).toBeDefined()
		})
	})

	describe("completePrompt", () => {
		it("should complete single prompt", async () => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([mockModel])

			const responseText = "Completed text"
			mockLanguageModelChat.sendRequest.mockResolvedValueOnce({
				stream: (async function* () {
					yield new vscode.LanguageModelTextPart(responseText)
					return
				})(),
				text: (async function* () {
					yield responseText
					return
				})(),
			})

			// Override the default client with our test client to ensure it uses
			// the mock implementation rather than the default fallback
			handler["client"] = mockLanguageModelChat

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe(responseText)
			expect(mockLanguageModelChat.sendRequest).toHaveBeenCalled()
		})

		it("should handle errors during completion", async () => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([mockModel])

			mockLanguageModelChat.sendRequest.mockRejectedValueOnce(new Error("Completion failed"))

			// Make sure we're using the mock client
			handler["client"] = mockLanguageModelChat

			const promise = handler.completePrompt("Test prompt")
			await expect(promise).rejects.toThrow("VSCode LM completion error: Completion failed")
		})
	})

	describe("countTokens", () => {
		beforeEach(() => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([mockModel])
			handler["client"] = mockLanguageModelChat
			handler["currentRequestCancellation"] = new vscode.CancellationTokenSource()
		})

		it("should count tokens for text content", async () => {
			const content: Anthropic.Messages.ContentBlockParam[] = [
				{ type: "text", text: "Hello world" },
				{ type: "text", text: "How are you?" },
			]

			mockLanguageModelChat.countTokens.mockResolvedValue(15)

			const result = await handler.countTokens(content)
			expect(result).toBe(15)
			expect(mockLanguageModelChat.countTokens).toHaveBeenCalledWith(
				"Hello worldHow are you?",
				expect.any(Object),
			)
		})

		it("should handle image content with placeholder", async () => {
			const content: Anthropic.Messages.ContentBlockParam[] = [
				{ type: "text", text: "Look at this:" },
				{ type: "image", source: { type: "base64", media_type: "image/png", data: "base64data" } },
			]

			mockLanguageModelChat.countTokens.mockResolvedValue(10)

			const result = await handler.countTokens(content)
			expect(result).toBe(10)
			expect(mockLanguageModelChat.countTokens).toHaveBeenCalledWith("Look at this:[IMAGE]", expect.any(Object))
		})
	})

	describe("internalCountTokens", () => {
		beforeEach(() => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([mockModel])
			handler["client"] = mockLanguageModelChat
			handler["currentRequestCancellation"] = new vscode.CancellationTokenSource()
		})

		it("should count tokens for string input", async () => {
			mockLanguageModelChat.countTokens.mockResolvedValue(20)

			const result = await handler["internalCountTokens"]("Test string")
			expect(result).toBe(20)
			expect(mockLanguageModelChat.countTokens).toHaveBeenCalledWith("Test string", expect.any(Object))
		})

		it("should handle LanguageModelChatMessage with normal token count", async () => {
			const message = vscode.LanguageModelChatMessage.User("Hello")
			mockLanguageModelChat.countTokens.mockResolvedValue(10)

			const result = await handler["internalCountTokens"](message)
			expect(result).toBe(10)
			expect(mockLanguageModelChat.countTokens).toHaveBeenCalledTimes(1)
			expect(mockLanguageModelChat.countTokens).toHaveBeenCalledWith(message, expect.any(Object))
		})

		it("should recalculate when LanguageModelChatMessage returns token count of 4", async () => {
			const message = vscode.LanguageModelChatMessage.User(
				"This is a longer message that should have more than 4 tokens",
			)

			// First call returns 4 (the problematic value)
			// Second call returns the correct count after string conversion
			mockLanguageModelChat.countTokens.mockResolvedValueOnce(4).mockResolvedValueOnce(25)

			const result = await handler["internalCountTokens"](message)
			expect(result).toBe(25)
			expect(mockLanguageModelChat.countTokens).toHaveBeenCalledTimes(2)

			// First call with the message object
			expect(mockLanguageModelChat.countTokens).toHaveBeenNthCalledWith(1, message, expect.any(Object))

			// Second call with the extracted text
			expect(mockLanguageModelChat.countTokens).toHaveBeenNthCalledWith(
				2,
				"This is a longer message that should have more than 4 tokens",
				expect.any(Object),
			)
		})

		it("should handle LanguageModelChatMessage with array content when token count is 4", async () => {
			const textPart = new vscode.LanguageModelTextPart("Part 1")
			const textPart2 = new vscode.LanguageModelTextPart(" Part 2")
			const message = {
				role: "user",
				content: [textPart, textPart2],
			}

			mockLanguageModelChat.countTokens.mockResolvedValueOnce(4).mockResolvedValueOnce(15)

			const result = await handler["internalCountTokens"](message as any)
			expect(result).toBe(15)
			expect(mockLanguageModelChat.countTokens).toHaveBeenCalledTimes(2)
			expect(mockLanguageModelChat.countTokens).toHaveBeenNthCalledWith(2, "Part 1 Part 2", expect.any(Object))
		})

		it("should return 0 when no client is available", async () => {
			handler["client"] = null

			const result = await handler["internalCountTokens"]("Test")
			expect(result).toBe(0)
			expect(mockLanguageModelChat.countTokens).not.toHaveBeenCalled()
		})

		it("should return 0 when no cancellation token is available", async () => {
			handler["currentRequestCancellation"] = null

			const result = await handler["internalCountTokens"]("Test")
			expect(result).toBe(0)
			expect(mockLanguageModelChat.countTokens).not.toHaveBeenCalled()
		})

		it("should handle errors gracefully", async () => {
			mockLanguageModelChat.countTokens.mockRejectedValue(new Error("Token counting failed"))

			const result = await handler["internalCountTokens"]("Test")
			expect(result).toBe(0)
		})
	})
})
