import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { CodeIndexOrchestrator } from "../orchestrator"
import { CodeIndexConfigManager } from "../config-manager"
import { CodeIndexStateManager } from "../state-manager"
import { CacheManager } from "../cache-manager"
import { IVectorStore, IFileWatcher } from "../interfaces"
import { DirectoryScanner } from "../processors"
import * as vscode from "vscode"

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [
			{
				uri: { fsPath: "/test/workspace" },
				name: "test",
				index: 0,
			},
		],
	},
}))

// Mock TelemetryService
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureEvent: vi.fn(),
		},
	},
}))

// Mock i18n
vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string, params?: any) => {
		if (key === "embeddings:orchestrator.rateLimitError") {
			return `Indexing paused due to rate limit: ${params?.errorMessage}. Progress has been preserved. Please try again later.`
		}
		if (key === "embeddings:orchestrator.failedDuringInitialScan") {
			return `Failed during initial scan: ${params?.errorMessage}`
		}
		if (key === "embeddings:orchestrator.unknownError") {
			return "Unknown error"
		}
		return key
	}),
}))

describe("CodeIndexOrchestrator - Rate Limit Error Handling", () => {
	let orchestrator: CodeIndexOrchestrator
	let mockConfigManager: any
	let mockStateManager: any
	let mockCacheManager: any
	let mockVectorStore: any
	let mockScanner: any
	let mockFileWatcher: any

	beforeEach(() => {
		// Create mock instances
		mockConfigManager = {
			isFeatureConfigured: true,
			isFeatureEnabled: true,
		}

		mockStateManager = {
			setSystemState: vi.fn(),
			state: "Standby",
		}

		mockCacheManager = {
			clearCacheFile: vi.fn(),
			initialize: vi.fn(),
		}

		mockVectorStore = {
			initialize: vi.fn().mockResolvedValue(false), // Return false to indicate collection already exists
			clearCollection: vi.fn(),
			deleteCollection: vi.fn(),
		}

		mockScanner = {
			scanDirectory: vi.fn(),
		}

		mockFileWatcher = {
			initialize: vi.fn(),
			onDidStartBatchProcessing: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			onBatchProgressUpdate: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			onDidFinishBatchProcessing: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			dispose: vi.fn(),
		}

		// Create orchestrator instance
		orchestrator = new CodeIndexOrchestrator(
			mockConfigManager as CodeIndexConfigManager,
			mockStateManager as CodeIndexStateManager,
			"/test/workspace",
			mockCacheManager as CacheManager,
			mockVectorStore as IVectorStore,
			mockScanner as DirectoryScanner,
			mockFileWatcher as IFileWatcher,
		)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("should preserve cache and not clear vector store on 429 rate limit error", async () => {
		// Create a 429 error
		const rateLimitError = new Error("Rate limit exceeded") as any
		rateLimitError.status = 429

		// Mock scanner to throw rate limit error
		mockScanner.scanDirectory.mockRejectedValue(rateLimitError)

		// Start indexing
		await orchestrator.startIndexing()

		// Verify that cache was NOT cleared
		expect(mockCacheManager.clearCacheFile).not.toHaveBeenCalled()

		// Verify that vector store was NOT cleared
		expect(mockVectorStore.clearCollection).not.toHaveBeenCalled()

		// Verify that the appropriate error message was set
		expect(mockStateManager.setSystemState).toHaveBeenCalledWith(
			"Error",
			expect.stringContaining("Indexing paused due to rate limit"),
		)
		expect(mockStateManager.setSystemState).toHaveBeenCalledWith(
			"Error",
			expect.stringContaining("Progress has been preserved"),
		)
	})

	it("should clear cache and vector store on non-rate-limit errors", async () => {
		// Create a generic error (not 429)
		const genericError = new Error("Connection failed")

		// Mock scanner to throw generic error
		mockScanner.scanDirectory.mockRejectedValue(genericError)

		// Start indexing
		await orchestrator.startIndexing()

		// Verify that cache WAS cleared
		expect(mockCacheManager.clearCacheFile).toHaveBeenCalled()

		// Verify that vector store WAS cleared
		expect(mockVectorStore.clearCollection).toHaveBeenCalled()

		// Verify that the appropriate error message was set
		expect(mockStateManager.setSystemState).toHaveBeenCalledWith(
			"Error",
			expect.stringContaining("Failed during initial scan"),
		)
	})

	it("should handle 429 errors with response.status property", async () => {
		// Create a 429 error with response.status property
		const rateLimitError = new Error("Rate limit exceeded") as any
		rateLimitError.response = { status: 429 }

		// Mock scanner to throw rate limit error
		mockScanner.scanDirectory.mockRejectedValue(rateLimitError)

		// Start indexing
		await orchestrator.startIndexing()

		// Verify that cache was NOT cleared
		expect(mockCacheManager.clearCacheFile).not.toHaveBeenCalled()

		// Verify that vector store was NOT cleared
		expect(mockVectorStore.clearCollection).not.toHaveBeenCalled()

		// Verify that the appropriate error message was set
		expect(mockStateManager.setSystemState).toHaveBeenCalledWith(
			"Error",
			expect.stringContaining("Indexing paused due to rate limit"),
		)
	})

	it("should handle errors during vector store cleanup gracefully", async () => {
		// Create a generic error (not 429)
		const genericError = new Error("Connection failed")

		// Mock scanner to throw generic error
		mockScanner.scanDirectory.mockRejectedValue(genericError)

		// Mock vector store to throw error during cleanup
		mockVectorStore.clearCollection.mockRejectedValue(new Error("Cleanup failed"))

		// Start indexing
		await orchestrator.startIndexing()

		// Verify that cache WAS still cleared even if vector store cleanup failed
		expect(mockCacheManager.clearCacheFile).toHaveBeenCalled()

		// Verify that the appropriate error message was set
		expect(mockStateManager.setSystemState).toHaveBeenCalledWith(
			"Error",
			expect.stringContaining("Failed during initial scan"),
		)
	})

	it("should clear cache when vector store creates new collection", async () => {
		// Mock vector store to return true (new collection created)
		mockVectorStore.initialize.mockResolvedValue(true)

		// Mock successful scan
		mockScanner.scanDirectory.mockImplementation(async () => {
			return {
				stats: { processed: 1, skipped: 0 },
				totalBlockCount: 1,
			}
		})

		// Start indexing
		await orchestrator.startIndexing()

		// Verify that cache WAS cleared when new collection is created
		expect(mockCacheManager.clearCacheFile).toHaveBeenCalled()

		// Verify that the success state was set
		expect(mockStateManager.setSystemState).toHaveBeenCalledWith("Indexed", expect.any(String))
	})
})
