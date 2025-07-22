// npx vitest run src/api/providers/__tests__/gemini-cli.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest"
import { spawn } from "child_process"
import { EventEmitter } from "events"

import { GeminiCliHandler } from "../gemini-cli"
import type { ApiHandlerOptions } from "../../../shared/api"

// Mock child_process
vi.mock("child_process", () => ({
	spawn: vi.fn(),
}))

describe("GeminiCliHandler", () => {
	let handler: GeminiCliHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		vi.clearAllMocks()
		mockOptions = {
			apiModelId: "gemini-2.0-flash-001",
			modelTemperature: 0.7,
			geminiCliProjectId: "test-project",
		}
		handler = new GeminiCliHandler(mockOptions)
	})

	describe("getModel", () => {
		it("should return the correct model configuration", () => {
			const model = handler.getModel()
			expect(model.id).toBe("gemini-2.0-flash-001")
			expect(model.info).toBeDefined()
			expect(model.info.maxTokens).toBe(8192)
			expect(model.info.contextWindow).toBe(1_048_576)
		})

		it("should use default model when apiModelId is not provided", () => {
			handler = new GeminiCliHandler({})
			const model = handler.getModel()
			expect(model.id).toBe("gemini-2.0-flash-001")
		})
	})

	describe("completePrompt", () => {
		it("should execute gemini CLI and return response", async () => {
			const mockProcess = new EventEmitter() as any
			mockProcess.stdout = new EventEmitter()
			mockProcess.stderr = new EventEmitter()

			vi.mocked(spawn).mockReturnValue(mockProcess)

			const promptPromise = handler.completePrompt("Test prompt")

			// Simulate CLI response
			mockProcess.stdout.emit("data", JSON.stringify({ text: "Test response" }))
			mockProcess.emit("close", 0)

			const result = await promptPromise
			expect(result).toBe("Test response")
			expect(spawn).toHaveBeenCalledWith(
				"gemini",
				expect.arrayContaining([
					"prompt",
					"Test prompt",
					"--model",
					"gemini-2.0-flash-001",
					"--project",
					"test-project",
					"--temperature",
					"0.7",
					"--json",
				]),
				expect.any(Object),
			)
		})

		it("should handle CLI errors", async () => {
			const mockProcess = new EventEmitter() as any
			mockProcess.stdout = new EventEmitter()
			mockProcess.stderr = new EventEmitter()

			vi.mocked(spawn).mockReturnValue(mockProcess)

			const promptPromise = handler.completePrompt("Test prompt")

			// Simulate CLI error
			mockProcess.stderr.emit("data", "Error message")
			mockProcess.emit("close", 1)

			await expect(promptPromise).rejects.toThrow("Gemini CLI failed with code 1")
		})
	})

	describe("createMessage", () => {
		it("should handle authentication flow when not authenticated", async () => {
			// Mock auth check to fail
			const mockAuthProcess = new EventEmitter() as any
			mockAuthProcess.stdout = new EventEmitter()
			mockAuthProcess.stderr = new EventEmitter()

			// Mock OAuth flow
			const mockOAuthProcess = new EventEmitter() as any
			mockOAuthProcess.stdout = new EventEmitter()
			mockOAuthProcess.stderr = new EventEmitter()

			vi.mocked(spawn)
				.mockReturnValueOnce(mockAuthProcess) // auth status check
				.mockReturnValueOnce(mockOAuthProcess) // auth login

			const messages = [{ role: "user" as const, content: "Hello" }]
			const generator = handler.createMessage("System prompt", messages)

			// Simulate auth check failure immediately
			setImmediate(() => {
				mockAuthProcess.emit("close", 1)
			})

			// Simulate OAuth success
			setImmediate(() => {
				mockOAuthProcess.emit("close", 0)
			})

			const results = []
			for await (const chunk of generator) {
				results.push(chunk)
			}

			expect(results[0]).toEqual({
				type: "text",
				text: "Please authenticate with Google in your browser. Once authenticated, please retry your request.",
			})
		})

		it("should process messages and return response with usage", async () => {
			// Mock successful auth check
			const mockAuthProcess = new EventEmitter() as any
			mockAuthProcess.stdout = new EventEmitter()
			mockAuthProcess.stderr = new EventEmitter()

			// Mock gemini execution
			const mockGeminiProcess = new EventEmitter() as any
			mockGeminiProcess.stdout = new EventEmitter()
			mockGeminiProcess.stderr = new EventEmitter()

			vi.mocked(spawn)
				.mockReturnValueOnce(mockAuthProcess) // auth status check
				.mockReturnValueOnce(mockGeminiProcess) // gemini prompt

			const messages = [{ role: "user" as const, content: "Hello" }]
			const generator = handler.createMessage("System prompt", messages)

			// Simulate successful auth
			setImmediate(() => {
				mockAuthProcess.emit("close", 0)
			})

			// Simulate gemini response with telemetry
			setImmediate(() => {
				mockGeminiProcess.stderr.emit("data", "Input tokens: 100\nOutput tokens: 50")
				mockGeminiProcess.stdout.emit("data", JSON.stringify({ text: "Hello response" }))
				mockGeminiProcess.emit("close", 0)
			})

			const results = []
			for await (const chunk of generator) {
				results.push(chunk)
			}

			expect(results).toHaveLength(2)
			expect(results[0]).toEqual({
				type: "text",
				text: "Hello response",
			})
			expect(results[1]).toMatchObject({
				type: "usage",
				inputTokens: 100,
				outputTokens: 50,
			})
		})

		it("should format complex messages correctly", async () => {
			// Mock successful auth and execution
			const mockAuthProcess = new EventEmitter() as any
			mockAuthProcess.stdout = new EventEmitter()
			mockAuthProcess.stderr = new EventEmitter()

			const mockGeminiProcess = new EventEmitter() as any
			mockGeminiProcess.stdout = new EventEmitter()
			mockGeminiProcess.stderr = new EventEmitter()

			vi.mocked(spawn).mockReturnValueOnce(mockAuthProcess).mockReturnValueOnce(mockGeminiProcess)

			const messages = [
				{ role: "user" as const, content: "Hello" },
				{ role: "assistant" as const, content: "Hi there!" },
				{
					role: "user" as const,
					content: [
						{ type: "text" as const, text: "Check this image" },
						{
							type: "image" as const,
							source: { type: "base64" as const, media_type: "image/png" as const, data: "base64data" },
						},
					],
				},
			]

			const generator = handler.createMessage("System prompt", messages)

			// Simulate successful auth
			setImmediate(() => {
				mockAuthProcess.emit("close", 0)
			})

			// Simulate gemini response
			setImmediate(() => {
				// Check the formatted prompt after auth completes
				const spawnCalls = vi.mocked(spawn).mock.calls
				if (spawnCalls.length > 1) {
					const callArgs = spawnCalls[1][1]
					const promptArg = callArgs[1] // The prompt is the second argument

					expect(promptArg).toContain("System prompt")
					expect(promptArg).toContain("User: Hello")
					expect(promptArg).toContain("Assistant: Hi there!")
					expect(promptArg).toContain("User: Check this image")
					expect(promptArg).toContain("[Image provided]")
				}

				mockGeminiProcess.stdout.emit("data", JSON.stringify({ text: "Response" }))
				mockGeminiProcess.emit("close", 0)
			})

			const results = []
			for await (const chunk of generator) {
				results.push(chunk)
			}

			expect(results[0]).toEqual({
				type: "text",
				text: "Response",
			})
		})
	})

	describe("telemetry parsing", () => {
		it("should parse token usage from stderr output", async () => {
			const mockAuthProcess = new EventEmitter() as any
			mockAuthProcess.stdout = new EventEmitter()
			mockAuthProcess.stderr = new EventEmitter()

			const mockGeminiProcess = new EventEmitter() as any
			mockGeminiProcess.stdout = new EventEmitter()
			mockGeminiProcess.stderr = new EventEmitter()

			vi.mocked(spawn).mockReturnValueOnce(mockAuthProcess).mockReturnValueOnce(mockGeminiProcess)

			const messages = [{ role: "user" as const, content: "Test" }]
			const generator = handler.createMessage("System prompt", messages)

			// Simulate successful auth
			setImmediate(() => {
				mockAuthProcess.emit("close", 0)
			})

			// Simulate various telemetry outputs
			setImmediate(() => {
				mockGeminiProcess.stderr.emit("data", "Input tokens: 150")
				mockGeminiProcess.stderr.emit("data", "Output tokens: 75")
				mockGeminiProcess.stderr.emit("data", "Cache read tokens: 25")
				mockGeminiProcess.stderr.emit("data", "Cache write tokens: 10")
				mockGeminiProcess.stdout.emit("data", JSON.stringify({ text: "Response" }))
				mockGeminiProcess.emit("close", 0)
			})

			const results = []
			for await (const chunk of generator) {
				results.push(chunk)
			}

			const usageChunk = results.find((r) => r.type === "usage")
			expect(usageChunk).toMatchObject({
				type: "usage",
				inputTokens: 150,
				outputTokens: 75,
				cacheReadTokens: 25,
				cacheWriteTokens: 10,
			})
		})
	})

	describe("cost calculation", () => {
		it("should calculate cost correctly", async () => {
			const mockAuthProcess = new EventEmitter() as any
			mockAuthProcess.stdout = new EventEmitter()
			mockAuthProcess.stderr = new EventEmitter()

			const mockGeminiProcess = new EventEmitter() as any
			mockGeminiProcess.stdout = new EventEmitter()
			mockGeminiProcess.stderr = new EventEmitter()

			vi.mocked(spawn).mockReturnValueOnce(mockAuthProcess).mockReturnValueOnce(mockGeminiProcess)

			const messages = [{ role: "user" as const, content: "Test" }]
			const generator = handler.createMessage("System prompt", messages)

			// Simulate successful auth
			setImmediate(() => {
				mockAuthProcess.emit("close", 0)
			})

			// Simulate telemetry with known values
			setImmediate(() => {
				mockGeminiProcess.stderr.emit("data", "Input tokens: 1000000") // 1M tokens
				mockGeminiProcess.stderr.emit("data", "Output tokens: 1000000") // 1M tokens
				mockGeminiProcess.stdout.emit("data", JSON.stringify({ text: "Response" }))
				mockGeminiProcess.emit("close", 0)
			})

			const results = []
			for await (const chunk of generator) {
				results.push(chunk)
			}

			const usageChunk = results.find((r) => r.type === "usage")
			expect(usageChunk?.totalCost).toBe(0.5) // 0.1 + 0.4 = 0.5 for 1M input + 1M output
		})
	})
})
