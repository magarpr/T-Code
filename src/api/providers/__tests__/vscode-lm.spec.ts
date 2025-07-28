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

// Mock the base provider's countTokens method
vi.mock("../base-provider", async () => {
	const actual = await vi.importActual("../base-provider")
	return {
		...actual,
		BaseProvider: class MockBaseProvider {
			async countTokens() {
				return 100 // Mock tiktoken to return 100 tokens
			}
		},
	}
})

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

	describe("countTokens with tiktoken fallback", () => {
		it("should fall back to tiktoken when VSCode API returns 0 for non-empty content", async () => {
			const content: Anthropic.Messages.ContentBlockParam[] = [
				{
					type: "text",
					text: "Hello world",
				},
			]

			// Mock VSCode API to return 0
			mockLanguageModelChat.countTokens.mockResolvedValue(0)
			handler["client"] = mockLanguageModelChat
			handler["currentRequestCancellation"] = new vscode.CancellationTokenSource()

			const result = await handler.countTokens(content)

			// Should use tiktoken fallback which returns 100
			expect(result).toBe(100)
		})

		it("should fall back to tiktoken when VSCode API throws an error", async () => {
			const content: Anthropic.Messages.ContentBlockParam[] = [
				{
					type: "text",
					text: "Hello world",
				},
			]

			// Mock VSCode API to throw an error
			mockLanguageModelChat.countTokens.mockRejectedValue(new Error("API Error"))
			handler["client"] = mockLanguageModelChat
			handler["currentRequestCancellation"] = new vscode.CancellationTokenSource()

			const result = await handler.countTokens(content)

			// Should use tiktoken fallback which returns 100
			expect(result).toBe(100)
		})

		it("should use VSCode API when it returns valid token count", async () => {
			const content: Anthropic.Messages.ContentBlockParam[] = [
				{
					type: "text",
					text: "Hello world",
				},
			]

			// Mock VSCode API to return valid count
			mockLanguageModelChat.countTokens.mockResolvedValue(50)
			handler["client"] = mockLanguageModelChat
			handler["currentRequestCancellation"] = new vscode.CancellationTokenSource()

			const result = await handler.countTokens(content)

			// Should use VSCode API result
			expect(result).toBe(50)
		})

		it("should fall back to tiktoken when no client is available", async () => {
			const content: Anthropic.Messages.ContentBlockParam[] = [
				{
					type: "text",
					text: "Hello world",
				},
			]

			// No client available
			handler["client"] = null

			const result = await handler.countTokens(content)

			// Should use tiktoken fallback which returns 100
			expect(result).toBe(100)
		})

		it("should fall back to tiktoken when VSCode API returns negative value", async () => {
			const content: Anthropic.Messages.ContentBlockParam[] = [
				{
					type: "text",
					text: "Hello world",
				},
			]

			// Mock VSCode API to return negative value
			mockLanguageModelChat.countTokens.mockResolvedValue(-1)
			handler["client"] = mockLanguageModelChat
			handler["currentRequestCancellation"] = new vscode.CancellationTokenSource()

			const result = await handler.countTokens(content)

			// Should use tiktoken fallback which returns 100
			expect(result).toBe(100)
		})
	})

	describe("createMessage with frequent token updates", () => {
		beforeEach(() => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([mockModel])
			mockLanguageModelChat.countTokens.mockResolvedValue(10)

			// Override the default client with our test client
			handler["client"] = mockLanguageModelChat
		})

		it("should provide token updates during streaming", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user" as const,
					content: "Hello",
				},
			]

			// Create a long response to trigger intermediate token updates
			const longResponse = "a".repeat(150) // 150 characters to trigger at least one update
			mockLanguageModelChat.sendRequest.mockResolvedValueOnce({
				stream: (async function* () {
					// Send response in chunks
					yield new vscode.LanguageModelTextPart(longResponse.slice(0, 50))
					yield new vscode.LanguageModelTextPart(longResponse.slice(50, 100))
					yield new vscode.LanguageModelTextPart(longResponse.slice(100))
					return
				})(),
				text: (async function* () {
					yield longResponse
					return
				})(),
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should have text chunks and multiple usage updates
			const textChunks = chunks.filter((c) => c.type === "text")
			const usageChunks = chunks.filter((c) => c.type === "usage")

			expect(textChunks).toHaveLength(3) // 3 text chunks
			expect(usageChunks.length).toBeGreaterThan(1) // At least 2 usage updates (intermediate + final)
		})
	})
})
