import { describe, it, expect, vi, beforeEach } from "vitest"
import { CodeIndexSearchService } from "../search-service"
import { CodeIndexConfigManager } from "../config-manager"
import { CodeIndexStateManager } from "../state-manager"
import { IEmbedder } from "../interfaces/embedder"
import { IVectorStore } from "../interfaces/vector-store"
import { TelemetryService } from "@roo-code/telemetry"
import { TelemetryEventName } from "@roo-code/types"

// Mock dependencies
vi.mock("@roo-code/telemetry")

describe("CodeIndexSearchService", () => {
	let searchService: CodeIndexSearchService
	let mockConfigManager: any
	let mockStateManager: any
	let mockEmbedder: any
	let mockVectorStore: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Setup mock config manager
		mockConfigManager = {
			isFeatureEnabled: true,
			isFeatureConfigured: true,
			currentSearchMinScore: 0.5,
			currentSearchMaxResults: 10,
		}

		// Setup mock state manager
		mockStateManager = {
			getCurrentStatus: vi.fn(() => ({ systemStatus: "Indexed" })),
			setSystemState: vi.fn(),
		}

		// Setup mock embedder
		mockEmbedder = {
			createEmbeddings: vi.fn().mockResolvedValue({
				embeddings: [[0.1, 0.2, 0.3]],
			}),
		}

		// Setup mock vector store
		mockVectorStore = {
			search: vi.fn().mockResolvedValue([
				{
					score: 0.9,
					payload: {
						filePath: "/test/file.ts",
						startLine: 1,
						endLine: 10,
						codeChunk: "test code",
					},
				},
			]),
		}

		// Setup mock telemetry
		const mockTelemetryInstance = {
			captureEvent: vi.fn(),
		}
		vi.spyOn(TelemetryService, "instance", "get").mockReturnValue(mockTelemetryInstance as any)

		searchService = new CodeIndexSearchService(
			mockConfigManager as CodeIndexConfigManager,
			mockStateManager as CodeIndexStateManager,
			mockEmbedder as IEmbedder,
			mockVectorStore as IVectorStore,
		)
	})

	describe("searchIndex", () => {
		it("should throw error when feature is disabled", async () => {
			mockConfigManager.isFeatureEnabled = false

			await expect(searchService.searchIndex("test query")).rejects.toThrow(
				"Code index feature is disabled or not configured.",
			)
		})

		it("should throw error when feature is not configured", async () => {
			mockConfigManager.isFeatureConfigured = false

			await expect(searchService.searchIndex("test query")).rejects.toThrow(
				"Code index feature is disabled or not configured.",
			)
		})

		it("should perform search successfully when in Indexed state", async () => {
			const query = "test query"
			const results = await searchService.searchIndex(query)

			expect(mockEmbedder.createEmbeddings).toHaveBeenCalledWith([query])
			expect(mockVectorStore.search).toHaveBeenCalledWith([0.1, 0.2, 0.3], undefined, 0.5, 10)
			expect(results).toHaveLength(1)
			expect(results[0].score).toBe(0.9)
		})

		it("should handle directory prefix correctly", async () => {
			const query = "test query"
			const directoryPrefix = "src/components"

			await searchService.searchIndex(query, directoryPrefix)

			expect(mockVectorStore.search).toHaveBeenCalledWith([0.1, 0.2, 0.3], "src/components", 0.5, 10)
		})

		it("should NOT throw error when in Error state (state checking moved to tool)", async () => {
			mockStateManager.getCurrentStatus.mockReturnValue({ systemStatus: "Error" })

			// Should not throw, as state checking is now handled in the tool
			const results = await searchService.searchIndex("test query")
			expect(results).toHaveLength(1)
		})

		it("should handle embedding generation failure", async () => {
			mockEmbedder.createEmbeddings.mockResolvedValue({ embeddings: [] })

			await expect(searchService.searchIndex("test query")).rejects.toThrow(
				"Failed to generate embedding for query.",
			)
		})

		it("should capture telemetry and set error state on search failure", async () => {
			const error = new Error("Vector store error")
			mockVectorStore.search.mockRejectedValue(error)

			await expect(searchService.searchIndex("test query")).rejects.toThrow("Vector store error")

			expect(mockStateManager.setSystemState).toHaveBeenCalledWith("Error", "Search failed: Vector store error")
			expect(TelemetryService.instance.captureEvent).toHaveBeenCalledWith(TelemetryEventName.CODE_INDEX_ERROR, {
				error: "Vector store error",
				stack: expect.any(String),
				location: "searchIndex",
			})
		})

		it("should work correctly when in Indexing state", async () => {
			mockStateManager.getCurrentStatus.mockReturnValue({ systemStatus: "Indexing" })

			// Should not throw, as state checking is now handled in the tool
			const results = await searchService.searchIndex("test query")
			expect(results).toHaveLength(1)
		})

		it("should work correctly when in Standby state", async () => {
			mockStateManager.getCurrentStatus.mockReturnValue({ systemStatus: "Standby" })

			// Should not throw, as state checking is now handled in the tool
			const results = await searchService.searchIndex("test query")
			expect(results).toHaveLength(1)
		})
	})
})
