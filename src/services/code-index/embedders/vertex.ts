import { OpenAICompatibleEmbedder } from "./openai-compatible"
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from "../interfaces/embedder"
import { VERTEX_MAX_ITEM_TOKENS } from "../constants"
import { t } from "../../../i18n"
import { TelemetryEventName } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

/**
 * Vertex AI embedder implementation that wraps the OpenAI Compatible embedder
 * with configuration for Google's Vertex AI embedding API.
 *
 * Supported models:
 * - text-embedding-004 (dimension: 768)
 * - text-multilingual-embedding-002 (dimension: 768)
 * - textembedding-gecko@003 (dimension: 768)
 * - textembedding-gecko-multilingual@001 (dimension: 768)
 */
export class VertexEmbedder implements IEmbedder {
	private readonly openAICompatibleEmbedder: OpenAICompatibleEmbedder
	private static readonly VERTEX_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
	private static readonly DEFAULT_MODEL = "text-embedding-004"
	private readonly modelId: string

	/**
	 * Creates a new Vertex AI embedder
	 * @param apiKey The Google AI API key for authentication
	 * @param modelId The model ID to use (defaults to text-embedding-004)
	 */
	constructor(apiKey: string, modelId?: string) {
		if (!apiKey) {
			throw new Error(t("embeddings:validation.apiKeyRequired"))
		}

		// Use provided model or default
		this.modelId = modelId || VertexEmbedder.DEFAULT_MODEL

		// Create an OpenAI Compatible embedder with Vertex AI's configuration
		this.openAICompatibleEmbedder = new OpenAICompatibleEmbedder(
			VertexEmbedder.VERTEX_BASE_URL,
			apiKey,
			this.modelId,
			VERTEX_MAX_ITEM_TOKENS,
		)
	}

	/**
	 * Creates embeddings for the given texts using Vertex AI's embedding API
	 * @param texts Array of text strings to embed
	 * @param model Optional model identifier (uses constructor model if not provided)
	 * @returns Promise resolving to embedding response
	 */
	async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
		try {
			// Use the provided model or fall back to the instance's model
			const modelToUse = model || this.modelId
			return await this.openAICompatibleEmbedder.createEmbeddings(texts, modelToUse)
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
	 * Validates the Vertex AI embedder configuration by delegating to the underlying OpenAI-compatible embedder
	 * @returns Promise resolving to validation result with success status and optional error message
	 */
	async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
		try {
			// Delegate validation to the OpenAI-compatible embedder
			// The error messages will be specific to Vertex AI since we're using Vertex AI's base URL
			return await this.openAICompatibleEmbedder.validateConfiguration()
		} catch (error) {
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				location: "VertexEmbedder:validateConfiguration",
			})
			throw error
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
