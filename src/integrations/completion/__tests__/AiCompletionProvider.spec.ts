import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { AiCompletionProvider } from "../AiCompletionProvider"
import { buildApiHandler } from "../../../api"

// Mock vscode
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(),
		onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
	},
	languages: {
		registerInlineCompletionItemProvider: vi.fn(),
	},
	window: {
		showInformationMessage: vi.fn(),
	},
	commands: {
		executeCommand: vi.fn(),
	},
	Position: vi.fn((line, character) => ({ line, character })),
	Range: vi.fn((start, end) => ({ start, end })),
	InlineCompletionItem: vi.fn((text, range) => ({ text, range })),
	CancellationTokenSource: vi.fn(() => ({
		token: { isCancellationRequested: false },
		cancel: vi.fn(),
		dispose: vi.fn(),
	})),
}))

// Mock API handler
vi.mock("../../../api", () => ({
	buildApiHandler: vi.fn(),
}))

// Mock lodash.debounce
vi.mock("lodash.debounce", () => ({
	default: (fn: any) => {
		const debounced = (...args: any[]) => fn(...args)
		debounced.cancel = vi.fn()
		return debounced
	},
}))

describe("AiCompletionProvider", () => {
	let provider: AiCompletionProvider
	let mockOutputChannel: any
	let mockConfig: any
	let mockApiHandler: any

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks()

		// Mock output channel
		mockOutputChannel = {
			appendLine: vi.fn(),
		}

		// Mock configuration
		mockConfig = {
			get: vi.fn((key: string, defaultValue?: any) => {
				const configMap: Record<string, any> = {
					"aiTabCompletion.enabled": true,
					"aiTabCompletion.provider": "anthropic",
					"aiTabCompletion.model": "claude-3-haiku-20240307",
					"aiTabCompletion.debounceDelay": 300,
					"aiTabCompletion.maxTokens": 150,
					"aiTabCompletion.temperature": 0.2,
					anthropicApiKey: "test-api-key",
				}
				return configMap[key] ?? defaultValue
			}),
		}

		// Mock API handler
		mockApiHandler = {
			createMessage: vi.fn(() => {
				// Return an async generator
				return (async function* () {
					yield { type: "text", text: "test completion" }
				})()
			}),
		}

		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any)
		vi.mocked(buildApiHandler).mockReturnValue(mockApiHandler)

		provider = new AiCompletionProvider(mockOutputChannel)
	})

	afterEach(() => {
		provider.dispose()
	})

	describe("initialization", () => {
		it("should initialize with enabled configuration", () => {
			expect(buildApiHandler).toHaveBeenCalledWith({
				apiProvider: "anthropic",
				apiModelId: "claude-3-haiku-20240307",
				apiKey: "test-api-key",
			})
			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
				"AI Tab Completion: Initialized with provider anthropic and model claude-3-haiku-20240307",
			)
		})

		it("should not initialize API handler when disabled", () => {
			vi.clearAllMocks()
			mockConfig.get.mockImplementation((key: string, defaultValue?: any) => {
				if (key === "aiTabCompletion.enabled") return false
				return defaultValue
			})

			new AiCompletionProvider(mockOutputChannel)

			expect(buildApiHandler).not.toHaveBeenCalled()
		})

		it("should handle initialization errors gracefully", () => {
			vi.clearAllMocks()
			vi.mocked(buildApiHandler).mockImplementation(() => {
				throw new Error("API initialization failed")
			})

			new AiCompletionProvider(mockOutputChannel)

			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
				"AI Tab Completion: Failed to initialize - Error: API initialization failed",
			)
		})
	})

	describe("provideInlineCompletionItems", () => {
		it("should return undefined when API handler is not initialized", async () => {
			mockConfig.get.mockImplementation((key: string, defaultValue?: any) => {
				if (key === "aiTabCompletion.enabled") return false
				return defaultValue
			})
			const disabledProvider = new AiCompletionProvider(mockOutputChannel)

			const mockDocument = {
				languageId: "typescript",
				lineAt: vi.fn(() => ({ text: "const x = " })),
				lineCount: 10,
			}
			const mockPosition = new (vscode as any).Position(0, 10)
			const mockContext = {}
			const mockToken = { isCancellationRequested: false }

			const result = await disabledProvider.provideInlineCompletionItems(
				mockDocument as any,
				mockPosition as any,
				mockContext as any,
				mockToken as any,
			)

			expect(result).toBeUndefined()
		})

		it("should provide completion items", async () => {
			const mockDocument = {
				languageId: "typescript",
				lineAt: vi.fn((line: number) => {
					if (line === 5) return { text: "const x = " }
					return { text: "// some code" }
				}),
				lineCount: 10,
			}
			const mockPosition = new (vscode as any).Position(5, 10)
			const mockContext = {}
			const mockToken = { isCancellationRequested: false }

			const result = await provider.provideInlineCompletionItems(
				mockDocument as any,
				mockPosition as any,
				mockContext as any,
				mockToken as any,
			)

			expect(result).toBeDefined()
			expect(result).toHaveLength(1)
			expect(result![0]).toHaveProperty("text", "test completion")
		})

		it("should handle cancellation", async () => {
			const mockDocument = {
				languageId: "typescript",
				lineAt: vi.fn(() => ({ text: "const x = " })),
				lineCount: 10,
			}
			const mockPosition = new (vscode as any).Position(0, 10)
			const mockContext = {}
			const mockToken = { isCancellationRequested: true }

			mockApiHandler.createMessage.mockReturnValue(
				(async function* () {
					yield { type: "text", text: "test" }
				})(),
			)

			const result = await provider.provideInlineCompletionItems(
				mockDocument as any,
				mockPosition as any,
				mockContext as any,
				mockToken as any,
			)

			expect(result).toBeUndefined()
		})

		it("should handle API errors gracefully", async () => {
			mockApiHandler.createMessage.mockImplementation(() => {
				throw new Error("API error")
			})

			const mockDocument = {
				languageId: "typescript",
				lineAt: vi.fn(() => ({ text: "const x = " })),
				lineCount: 10,
			}
			const mockPosition = new (vscode as any).Position(0, 10)
			const mockContext = {}
			const mockToken = { isCancellationRequested: false }

			const result = await provider.provideInlineCompletionItems(
				mockDocument as any,
				mockPosition as any,
				mockContext as any,
				mockToken as any,
			)

			expect(result).toBeUndefined()
			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith("AI Tab Completion Error: Error: API error")
		})
	})

	describe("completion cleaning", () => {
		it("should remove markdown code blocks from completion", async () => {
			mockApiHandler.createMessage.mockReturnValue(
				(async function* () {
					yield { type: "text", text: "```typescript\nconst y = 42\n```" }
				})(),
			)

			const mockDocument = {
				languageId: "typescript",
				lineAt: vi.fn((line: number) => {
					if (line === 0) return { text: "const x = " }
					return { text: "" }
				}),
				lineCount: 1,
			}
			const mockPosition = new (vscode as any).Position(0, 10)
			const mockContext = {}
			const mockToken = { isCancellationRequested: false }

			const result = await provider.provideInlineCompletionItems(
				mockDocument as any,
				mockPosition as any,
				mockContext as any,
				mockToken as any,
			)

			expect(result).toBeDefined()
			expect(result![0]).toHaveProperty("text", "const y = 42")
		})

		it("should handle proper spacing between words", async () => {
			mockApiHandler.createMessage.mockReturnValue(
				(async function* () {
					yield { type: "text", text: "world" }
				})(),
			)

			const mockDocument = {
				languageId: "typescript",
				lineAt: vi.fn(() => ({ text: "hello" })),
				lineCount: 1,
			}
			const mockPosition = new (vscode as any).Position(0, 5)
			const mockContext = {}
			const mockToken = { isCancellationRequested: false }

			const result = await provider.provideInlineCompletionItems(
				mockDocument as any,
				mockPosition as any,
				mockContext as any,
				mockToken as any,
			)

			expect(result).toBeDefined()
			expect(result![0]).toHaveProperty("text", " world")
		})
	})

	describe("configuration updates", () => {
		it("should update configuration when settings change", () => {
			const onDidChangeConfiguration = vi.mocked(vscode.workspace.onDidChangeConfiguration)
			const changeHandler = onDidChangeConfiguration.mock.calls[0][0]

			// Clear previous calls
			vi.clearAllMocks()

			// Update configuration
			mockConfig.get.mockImplementation((key: string, defaultValue?: any) => {
				const configMap: Record<string, any> = {
					"aiTabCompletion.enabled": true,
					"aiTabCompletion.provider": "openai",
					"aiTabCompletion.model": "gpt-4",
					"aiTabCompletion.debounceDelay": 500,
					openaiApiKey: "new-api-key",
				}
				return configMap[key] ?? defaultValue
			})

			// Trigger configuration change
			changeHandler({
				affectsConfiguration: (section: string) => section.includes("aiTabCompletion"),
			} as any)

			expect(buildApiHandler).toHaveBeenCalledWith({
				apiProvider: "openai",
				apiModelId: "gpt-4",
				openAiApiKey: "new-api-key",
			})
		})
	})
})
