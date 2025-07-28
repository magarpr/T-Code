import { vitest, describe, it, expect, beforeEach } from "vitest"
import { VertexEmbedder } from "../vertex"
import { GoogleGenAI } from "@google/genai"

// Mock the @google/genai library
vitest.mock("@google/genai")

// Mock TelemetryService
vitest.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureEvent: vitest.fn(),
		},
	},
}))

// Mock i18n
vitest.mock("../../../../i18n", () => ({
	t: (key: string, params?: Record<string, any>) => {
		const translations: Record<string, string> = {
			"validation.apiKeyRequired": "API key is required",
			"embeddings:validation.authenticationFailed": "Authentication failed",
			"embeddings:validation.connectionFailed": "Connection failed",
			"embeddings:validation.modelNotAvailable": "Model not available",
			"embeddings:validation.unexpectedError": "Unexpected error",
			"embeddings:validation.vertexAuthRequired": "At least one authentication method is required for Vertex AI",
			"embeddings:validation.noEmbeddingsReturned": "No embeddings returned",
			"embeddings:validation.configurationError": "Configuration error",
		}
		return translations[key] || key
	},
}))

// Mock safeJsonParse
vitest.mock("../../../shared/safeJsonParse", () => ({
	safeJsonParse: (json: string, defaultValue: any) => {
		try {
			return JSON.parse(json)
		} catch {
			return defaultValue
		}
	},
}))

describe("VertexEmbedder", () => {
	let embedder: VertexEmbedder
	let mockClient: any
	let mockModel: any
	let mockEmbedContent: any

	beforeEach(() => {
		vitest.clearAllMocks()

		// Setup mock for embedContent
		mockEmbedContent = vitest.fn()
		mockModel = {
			embedContent: mockEmbedContent,
		}
		mockClient = {
			models: {
				embedContent: mockEmbedContent,
			},
		}

		// Mock GoogleGenAI constructor
		;(GoogleGenAI as any).mockImplementation(() => mockClient)
	})

	describe("constructor", () => {
		it("should create an instance with API key authentication", () => {
			// Act
			embedder = new VertexEmbedder({
				apiKey: "test-api-key",
				projectId: "test-project",
				location: "us-central1",
			})

			// Assert
			expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: "test-api-key" })
			expect(embedder.embedderInfo.name).toBe("vertex")
		})

		it("should create an instance with JSON credentials authentication", () => {
			// Act
			embedder = new VertexEmbedder({
				jsonCredentials: '{"type": "service_account"}',
				projectId: "test-project",
				location: "us-central1",
			})

			// Assert
			expect(GoogleGenAI).toHaveBeenCalledWith({
				vertexai: true,
				project: "test-project",
				location: "us-central1",
				googleAuthOptions: {
					credentials: { type: "service_account" },
				},
			})
			expect(embedder.embedderInfo.name).toBe("vertex")
		})

		it("should create an instance with key file authentication", () => {
			// Act
			embedder = new VertexEmbedder({
				keyFile: "/path/to/keyfile.json",
				projectId: "test-project",
				location: "us-central1",
			})

			// Assert
			expect(GoogleGenAI).toHaveBeenCalledWith({
				vertexai: true,
				project: "test-project",
				location: "us-central1",
				googleAuthOptions: { keyFile: "/path/to/keyfile.json" },
			})
			expect(embedder.embedderInfo.name).toBe("vertex")
		})

		it("should create an instance with application default credentials", () => {
			// Act
			embedder = new VertexEmbedder({
				apiKey: "", // Empty string to trigger ADC path
				projectId: "test-project",
				location: "us-central1",
			})

			// Assert
			expect(GoogleGenAI).toHaveBeenCalledWith({
				vertexai: true,
				project: "test-project",
				location: "us-central1",
			})
			expect(embedder.embedderInfo.name).toBe("vertex")
		})

		it("should use default model when not specified", () => {
			// Act
			embedder = new VertexEmbedder({
				apiKey: "test-api-key",
				projectId: "test-project",
				location: "us-central1",
			})

			// Assert
			expect(embedder["modelId"]).toBe("text-embedding-004")
		})

		it("should use specified model", () => {
			// Act
			embedder = new VertexEmbedder({
				apiKey: "test-api-key",
				modelId: "text-multilingual-embedding-002",
				projectId: "test-project",
				location: "us-central1",
			})

			// Assert
			expect(embedder["modelId"]).toBe("text-multilingual-embedding-002")
		})
	})

	describe("embedderInfo", () => {
		it("should return correct embedder info", () => {
			// Arrange
			embedder = new VertexEmbedder({
				apiKey: "test-api-key",
				projectId: "test-project",
				location: "us-central1",
			})

			// Act
			const info = embedder.embedderInfo

			// Assert
			expect(info).toEqual({
				name: "vertex",
			})
		})
	})

	describe("createEmbeddings", () => {
		beforeEach(() => {
			embedder = new VertexEmbedder({
				apiKey: "test-api-key",
				projectId: "test-project",
				location: "us-central1",
			})
		})

		it("should create embeddings for single text", async () => {
			// Arrange
			const texts = ["test text"]
			const mockResponse = {
				embeddings: [{ values: [0.1, 0.2, 0.3] }],
			}
			mockEmbedContent.mockResolvedValue(mockResponse)

			// Act
			const result = await embedder.createEmbeddings(texts)

			// Assert
			expect(mockEmbedContent).toHaveBeenCalledWith({
				model: "text-embedding-004",
				contents: [{ parts: [{ text: "test text" }] }],
			})
			expect(result).toEqual({
				embeddings: [[0.1, 0.2, 0.3]],
			})
		})

		it("should create embeddings for multiple texts in batches", async () => {
			// Arrange
			const texts = ["text1", "text2", "text3"]
			const mockResponse = {
				embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }, { values: [0.5, 0.6] }],
			}
			mockEmbedContent.mockResolvedValue(mockResponse)

			// Act
			const result = await embedder.createEmbeddings(texts)

			// Assert
			expect(mockEmbedContent).toHaveBeenCalledTimes(1)
			expect(mockEmbedContent).toHaveBeenCalledWith({
				model: "text-embedding-004",
				contents: [
					{ parts: [{ text: "text1" }] },
					{ parts: [{ text: "text2" }] },
					{ parts: [{ text: "text3" }] },
				],
			})
			expect(result).toEqual({
				embeddings: [
					[0.1, 0.2],
					[0.3, 0.4],
					[0.5, 0.6],
				],
			})
		})

		it("should use custom model when provided", async () => {
			// Arrange
			const texts = ["test text"]
			const mockResponse = {
				embeddings: [{ values: [0.1, 0.2] }],
			}
			mockEmbedContent.mockResolvedValue(mockResponse)

			// Act
			await embedder.createEmbeddings(texts, "text-multilingual-embedding-002")

			// Assert
			expect(mockEmbedContent).toHaveBeenCalledWith({
				model: "text-multilingual-embedding-002",
				contents: [{ parts: [{ text: "test text" }] }],
			})
		})

		it("should handle empty text array", async () => {
			// Act
			const result = await embedder.createEmbeddings([])

			// Assert
			expect(mockEmbedContent).not.toHaveBeenCalled()
			expect(result).toEqual({ embeddings: [] })
		})

		it("should handle API errors", async () => {
			// Arrange
			const texts = ["test text"]
			const error = new Error("API Error")
			mockEmbedContent.mockRejectedValue(error)

			// Act & Assert
			await expect(embedder.createEmbeddings(texts)).rejects.toThrow("API Error")
		})
	})

	describe("validateConfiguration", () => {
		beforeEach(() => {
			embedder = new VertexEmbedder({
				apiKey: "test-api-key",
				projectId: "test-project",
				location: "us-central1",
			})
		})

		it("should validate configuration successfully", async () => {
			// Arrange
			const mockResponse = {
				embeddings: [{ values: [0.1, 0.2] }],
			}
			mockEmbedContent.mockResolvedValue(mockResponse)

			// Act
			const result = await embedder.validateConfiguration()

			// Assert
			expect(mockEmbedContent).toHaveBeenCalledWith({
				model: "text-embedding-004",
				contents: [{ parts: [{ text: "test" }] }],
			})
			expect(result).toEqual({ valid: true })
		})

		it("should handle unexpected errors", async () => {
			// Arrange
			const error = new Error("Something went wrong")
			mockEmbedContent.mockRejectedValue(error)

			// Act
			const result = await embedder.validateConfiguration()

			// Assert
			expect(result).toEqual({
				valid: false,
				error: "Something went wrong",
			})
		})
	})

	describe("createBatches", () => {
		beforeEach(() => {
			embedder = new VertexEmbedder({
				apiKey: "test-api-key",
				projectId: "test-project",
				location: "us-central1",
			})
		})

		it("should create batches respecting token limits", () => {
			// Arrange
			const texts = [
				"short text",
				"another short text",
				"a".repeat(5000), // Long text
				"more text",
			]

			// Act
			const batches = embedder["createBatches"](texts)

			// Assert
			expect(batches.length).toBe(1)
			expect(batches[0].length).toBe(4) // All texts in one batch (under 100 limit)
		})

		it("should handle all oversized texts", () => {
			// Arrange
			const texts = ["a".repeat(10000), "b".repeat(10000)]

			// Act
			const batches = embedder["createBatches"](texts)

			// Assert
			expect(batches.length).toBe(1)
			expect(batches[0].length).toBe(2) // Both texts in one batch
		})
	})
})
