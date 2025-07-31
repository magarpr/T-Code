import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Task } from "../Task"
import { ClineProvider } from "../../webview/ClineProvider"
import { ProviderSettings } from "@roo-code/types"
import delay from "delay"

// Mock vscode module
vi.mock("vscode", () => ({
	RelativePattern: vi.fn().mockImplementation((base, pattern) => ({ base, pattern })),
	workspace: {
		createFileSystemWatcher: vi.fn().mockReturnValue({
			onDidCreate: vi.fn(),
			onDidChange: vi.fn(),
			onDidDelete: vi.fn(),
			dispose: vi.fn(),
		}),
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn().mockReturnValue(true),
		}),
	},
	Uri: {
		file: vi.fn().mockImplementation((path) => ({ fsPath: path })),
	},
}))

// Mock other dependencies
vi.mock("delay")
vi.mock("../../webview/ClineProvider")
vi.mock("../../../api", () => ({
	buildApiHandler: vi.fn().mockReturnValue({
		getModel: vi.fn().mockReturnValue({
			id: "test-model",
			info: { supportsComputerUse: false },
		}),
	}),
}))
vi.mock("../../../services/browser/UrlContentFetcher")
vi.mock("../../../services/browser/BrowserSession")
vi.mock("../../../integrations/editor/DiffViewProvider")
vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn().mockReturnValue("/test/workspace"),
}))
vi.mock("../../ignore/RooIgnoreController", () => ({
	RooIgnoreController: vi.fn().mockImplementation(() => ({
		initialize: vi.fn().mockResolvedValue(undefined),
		dispose: vi.fn(),
		getInstructions: vi.fn().mockReturnValue(""),
	})),
}))
vi.mock("../../protect/RooProtectedController", () => ({
	RooProtectedController: vi.fn().mockImplementation(() => ({
		dispose: vi.fn(),
	})),
}))
vi.mock("../../context-tracking/FileContextTracker", () => ({
	FileContextTracker: vi.fn().mockImplementation(() => ({
		dispose: vi.fn(),
	})),
}))

const mockDelay = vi.mocked(delay)

describe("Task Connection Management", () => {
	let task: Task
	let mockProvider: ClineProvider
	let mockApiConfiguration: ProviderSettings

	beforeEach(() => {
		vi.clearAllMocks()

		// Mock provider
		mockProvider = {
			context: { globalStorageUri: { fsPath: "/test" } },
			getState: vi.fn().mockResolvedValue({ mode: "code" }),
			log: vi.fn(),
			postStateToWebview: vi.fn(),
			updateTaskHistory: vi.fn(),
		} as any

		// Mock API configuration with enterprise settings
		mockApiConfiguration = {
			apiProvider: "anthropic",
			apiKey: "test-key",
			connectionKeepAliveEnabled: true,
			connectionKeepAliveInterval: 30000,
			connectionRetryEnabled: true,
			connectionMaxRetries: 3,
			connectionRetryBaseDelay: 2000,
		} as ProviderSettings

		// Mock delay to resolve immediately for tests
		mockDelay.mockResolvedValue(undefined)

		// Create task instance
		task = new Task({
			provider: mockProvider,
			apiConfiguration: mockApiConfiguration,
			task: "Test task",
			startTask: false,
		})
	})

	afterEach(() => {
		if (task) {
			task.dispose()
		}
		vi.clearAllTimers()
	})

	describe("Connection Keep-Alive", () => {
		it("should start keep-alive when enabled", () => {
			const setIntervalSpy = vi.spyOn(global, "setInterval")

			// Access private method for testing
			;(task as any).startConnectionKeepAlive()

			expect(setIntervalSpy).toHaveBeenCalledWith(
				expect.any(Function),
				30000, // Default keep-alive interval
			)
		})

		it("should not start keep-alive when disabled", () => {
			const setIntervalSpy = vi.spyOn(global, "setInterval")

			// Disable keep-alive in configuration
			task.apiConfiguration.connectionKeepAliveEnabled = false
			;(task as any).startConnectionKeepAlive()

			expect(setIntervalSpy).not.toHaveBeenCalled()
		})

		it("should use custom keep-alive interval", () => {
			const setIntervalSpy = vi.spyOn(global, "setInterval")
			const customInterval = 60000

			task.apiConfiguration.connectionKeepAliveInterval = customInterval
			;(task as any).startConnectionKeepAlive()

			expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), customInterval)
		})

		it("should clear existing interval before starting new one", () => {
			const clearIntervalSpy = vi.spyOn(global, "clearInterval")
			const setIntervalSpy = vi.spyOn(global, "setInterval")

			// Start keep-alive twice
			;(task as any).startConnectionKeepAlive()
			;(task as any).startConnectionKeepAlive()

			expect(clearIntervalSpy).toHaveBeenCalled()
			expect(setIntervalSpy).toHaveBeenCalledTimes(2)
		})

		it("should stop keep-alive and clear interval", () => {
			const clearIntervalSpy = vi.spyOn(global, "clearInterval")

			// Start then stop keep-alive
			;(task as any).startConnectionKeepAlive()
			;(task as any).stopConnectionKeepAlive()

			expect(clearIntervalSpy).toHaveBeenCalled()
		})
	})

	describe("Connection Error Detection", () => {
		it("should identify retryable connection errors", () => {
			const testCases = [
				{ error: { message: "502 Bad Gateway" }, expected: true },
				{ error: { message: "503 Service Unavailable" }, expected: true },
				{ error: { message: "504 Gateway Timeout" }, expected: true },
				{ error: { message: "Connection timeout" }, expected: true },
				{ error: { message: "ECONNRESET" }, expected: true },
				{ error: { message: "ECONNREFUSED" }, expected: true },
				{ error: { message: "ETIMEDOUT" }, expected: true },
				{ error: { status: 502 }, expected: true },
				{ error: { status: 503 }, expected: true },
				{ error: { status: 504 }, expected: true },
				{ error: { code: "ECONNRESET" }, expected: true },
				{ error: { message: "Invalid API key" }, expected: false },
				{ error: { status: 401 }, expected: false },
				{ error: { status: 400 }, expected: false },
			]

			testCases.forEach(({ error, expected }) => {
				const result = (task as any).isRetryableConnectionError(error)
				expect(result).toBe(expected)
			})
		})

		it("should handle null/undefined errors", () => {
			expect((task as any).isRetryableConnectionError(null)).toBe(false)
			expect((task as any).isRetryableConnectionError(undefined)).toBe(false)
			expect((task as any).isRetryableConnectionError({})).toBe(false)
		})
	})

	describe("Connection Error Handling", () => {
		it("should retry on retryable errors", async () => {
			const retryCallback = vi.fn().mockResolvedValue("success")
			const error = { message: "502 Bad Gateway" }

			// Mock the say method to avoid actual UI updates
			const saySpy = vi.spyOn(task, "say").mockResolvedValue(undefined)

			const result = await (task as any).handleConnectionError(error, retryCallback)

			expect(result).toBe("success")
			expect(retryCallback).toHaveBeenCalledTimes(1)
			expect(saySpy).toHaveBeenCalledWith(
				"api_req_retry_delayed",
				expect.stringContaining("Connection interrupted"),
				undefined,
				true,
			)
		})

		it("should not retry when retry is disabled", async () => {
			const retryCallback = vi.fn()
			const error = { message: "502 Bad Gateway" }

			// Disable retry in configuration
			task.apiConfiguration.connectionRetryEnabled = false

			await expect((task as any).handleConnectionError(error, retryCallback)).rejects.toThrow()
			expect(retryCallback).not.toHaveBeenCalled()
		})

		it("should not retry non-retryable errors", async () => {
			const retryCallback = vi.fn()
			const error = { message: "Invalid API key", status: 401 }

			await expect((task as any).handleConnectionError(error, retryCallback)).rejects.toThrow()
			expect(retryCallback).not.toHaveBeenCalled()
		})

		it("should respect max retry limit", async () => {
			const retryCallback = vi.fn().mockRejectedValue(new Error("Still failing"))
			const error = { message: "502 Bad Gateway" }

			// Set max retries to 2
			task.apiConfiguration.connectionMaxRetries = 2

			// Mock the say method
			vi.spyOn(task, "say").mockResolvedValue(undefined)

			await expect((task as any).handleConnectionError(error, retryCallback)).rejects.toThrow()

			// Should have tried 2 times (initial + 1 retry)
			expect(retryCallback).toHaveBeenCalledTimes(2)
		})

		it("should use exponential backoff with custom base delay", async () => {
			const retryCallback = vi.fn().mockRejectedValueOnce(new Error("Still failing")).mockResolvedValue("success")
			const error = { message: "502 Bad Gateway" }

			// Set custom base delay
			task.apiConfiguration.connectionRetryBaseDelay = 1000

			// Mock the say method
			vi.spyOn(task, "say").mockResolvedValue(undefined)

			const result = await (task as any).handleConnectionError(error, retryCallback)

			expect(result).toBe("success")
			expect(mockDelay).toHaveBeenCalledWith(1000) // First retry: base delay
		})

		it("should reset retry count on successful recovery", async () => {
			const retryCallback = vi.fn().mockResolvedValue("success")
			const error = { message: "502 Bad Gateway" }

			// Mock the say method
			vi.spyOn(task, "say").mockResolvedValue(undefined)

			// Simulate previous failed attempts
			;(task as any).connectionRetryCount = 2

			await (task as any).handleConnectionError(error, retryCallback)

			// Retry count should be reset to 0
			expect((task as any).connectionRetryCount).toBe(0)
		})

		it("should restart keep-alive on successful recovery", async () => {
			const retryCallback = vi.fn().mockResolvedValue("success")
			const error = { message: "502 Bad Gateway" }

			// Mock the say method and keep-alive methods
			vi.spyOn(task, "say").mockResolvedValue(undefined)
			const startKeepAliveSpy = vi.spyOn(task as any, "startConnectionKeepAlive").mockImplementation(() => {})

			await (task as any).handleConnectionError(error, retryCallback)

			expect(startKeepAliveSpy).toHaveBeenCalled()
			expect((task as any).isConnectionHealthy).toBe(true)
		})
	})

	describe("Task State Preservation", () => {
		it("should save task state for resumption", async () => {
			// Mock the save methods
			const saveClineMessagesSpy = vi.spyOn(task as any, "saveClineMessages").mockResolvedValue(undefined)
			const saveApiHistorySpy = vi.spyOn(task as any, "saveApiConversationHistory").mockResolvedValue(undefined)
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

			await (task as any).saveTaskStateForResumption()

			expect(saveClineMessagesSpy).toHaveBeenCalled()
			expect(saveApiHistorySpy).toHaveBeenCalled()
			expect(consoleSpy).toHaveBeenCalledWith("Task state saved for potential resumption:", expect.any(Object))
		})

		it("should handle save errors gracefully", async () => {
			// Mock save methods to throw errors
			vi.spyOn(task as any, "saveClineMessages").mockRejectedValue(new Error("Save failed"))
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			// Should not throw
			await expect((task as any).saveTaskStateForResumption()).resolves.toBeUndefined()
			expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to save task state for resumption:", expect.any(Error))
		})
	})

	describe("Integration with Task Lifecycle", () => {
		it("should clear keep-alive on task disposal", () => {
			const clearIntervalSpy = vi.spyOn(global, "clearInterval")

			// Start keep-alive
			;(task as any).startConnectionKeepAlive()

			// Dispose task
			task.dispose()

			expect(clearIntervalSpy).toHaveBeenCalled()
		})

		it("should clear keep-alive on task abort", async () => {
			const clearIntervalSpy = vi.spyOn(global, "clearInterval")

			// Start keep-alive
			;(task as any).startConnectionKeepAlive()

			// Abort task
			await task.abortTask()

			expect(clearIntervalSpy).toHaveBeenCalled()
		})
	})
})
