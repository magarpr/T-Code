import { GoogleGenAI } from "@google/genai"
import type { JWTInput } from "google-auth-library"
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from "../interfaces/embedder"
import { VERTEX_MAX_ITEM_TOKENS } from "../constants"
import { t } from "../../../i18n"
import { TelemetryEventName } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"
import { safeJsonParse } from "../../../shared/safeJsonParse"

/**
 * Vertex AI embedder implementation using the @google/genai library
 * with support for multiple authentication methods.
 *
 * Supported models:
 * - text-embedding-004 (dimension: 768)
 * - text-multilingual-embedding-002 (dimension: 768)
 * - textembedding-gecko@003 (dimension: 768)
 * - textembedding-gecko-multilingual@001 (dimension: 768)
 */
export class VertexEmbedder implements IEmbedder {
	private readonly client: GoogleGenAI
	private static readonly DEFAULT_MODEL = "text-embedding-004"
	private readonly modelId: string
	private readonly maxItemTokens: number

	/**
	 * Creates a new Vertex AI embedder
	 * @param options Configuration options including authentication methods
	 */
	constructor(options: {
		apiKey?: string
		jsonCredentials?: string
		keyFile?: string
		projectId: string
		location: string
		modelId?: string
	}) {
		const { apiKey, jsonCredentials, keyFile, projectId, location, modelId } = options

		// Validate required fields
		if (!projectId) {
			throw new Error("Project ID is required for Vertex AI")
		}
		if (!location) {
			throw new Error("Location is required for Vertex AI")
		}

		// Use provided model or default
		this.modelId = modelId || VertexEmbedder.DEFAULT_MODEL
		this.maxItemTokens = VERTEX_MAX_ITEM_TOKENS

		// Create the GoogleGenAI client with appropriate auth
		if (jsonCredentials) {
			this.client = new GoogleGenAI({
				vertexai: true,
				project: projectId,
				location,
				googleAuthOptions: {
					credentials: safeJsonParse<JWTInput>(jsonCredentials, undefined),
				},
			})
		} else if (keyFile) {
			this.client = new GoogleGenAI({
				vertexai: true,
				project: projectId,
				location,
				googleAuthOptions: { keyFile },
			})
		} else if (apiKey && apiKey.trim() !== "") {
			// For API key auth, we use the regular Gemini API endpoint
			this.client = new GoogleGenAI({ apiKey })
		} else {
			// Default to application default credentials
			this.client = new GoogleGenAI({
				vertexai: true,
				project: projectId,
				location,
			})
		}
	}

	/**
	 * Creates embeddings for the given texts using Vertex AI's embedding API
	 * @param texts Array of text strings to embed
	 * @param model Optional model identifier (uses constructor model if not provided)
	 * @returns Promise resolving to embedding response
	 */
	async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
		try {
			const modelToUse = model || this.modelId

			// Batch texts if they exceed token limits
			const batches = this.createBatches(texts)
			const allEmbeddings: number[][] = []

			for (const batch of batches) {
				const result = await this.client.models.embedContent({
					model: modelToUse,
					contents: batch.map((text) => ({ parts: [{ text }] })),
				})

				if (!result.embeddings || result.embeddings.length === 0) {
					throw new Error(t("embeddings:validation.noEmbeddingsReturned"))
				}

				// Filter out any embeddings without values
				const validEmbeddings = result.embeddings
					.filter((e) => e.values !== undefined)
					.map((e) => e.values as number[])

				allEmbeddings.push(...validEmbeddings)
			}

			return {
				embeddings: allEmbeddings,
			}
		} catch (error) {
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				location: "VertexEmbedder:createEmbeddings",
			})
			throw error
		}
	}

	/**
	 * Creates batches of texts that respect token limits
	 */
	private createBatches(texts: string[]): string[][] {
		// Simple batching - in production, you'd want to estimate tokens
		const batchSize = 100 // Vertex AI typically supports up to 100 texts per batch
		const batches: string[][] = []

		for (let i = 0; i < texts.length; i += batchSize) {
			batches.push(texts.slice(i, i + batchSize))
		}

		return batches
	}

	/**
	 * Validates the Vertex AI embedder configuration
	 * @returns Promise resolving to validation result with success status and optional error message
	 */
	async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
		try {
			// Test with a simple embedding request
			const testText = "test"
			const result = await this.client.models.embedContent({
				model: this.modelId,
				contents: [{ parts: [{ text: testText }] }],
			})

			if (!result.embeddings || result.embeddings.length === 0) {
				return {
					valid: false,
					error: t("embeddings:validation.noEmbeddingsReturned"),
				}
			}

			return { valid: true }
		} catch (error) {
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				location: "VertexEmbedder:validateConfiguration",
			})

			return {
				valid: false,
				error: error instanceof Error ? error.message : t("embeddings:validation.configurationError"),
			}
		}
	}

	/**
	 * Returns information about this embedder
	 */
	get embedderInfo(): EmbedderInfo {
		return {
			name: "vertex",
		}
	}
}
