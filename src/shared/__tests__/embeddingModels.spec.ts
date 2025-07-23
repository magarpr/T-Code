import { describe, it, expect } from "vitest"
import { getModelDimension, EMBEDDING_MODEL_PROFILES } from "../embeddingModels"

describe("embeddingModels", () => {
	describe("EMBEDDING_MODEL_PROFILES", () => {
		it("should have codestral-embed model defined for openai-compatible provider", () => {
			const openAiCompatibleModels = EMBEDDING_MODEL_PROFILES["openai-compatible"]
			expect(openAiCompatibleModels).toBeDefined()
			expect(openAiCompatibleModels?.["codestral-embed"]).toBeDefined()
			expect(openAiCompatibleModels?.["codestral-embed"].dimension).toBe(3072)
			expect(openAiCompatibleModels?.["codestral-embed"].scoreThreshold).toBe(0.4)
		})

		it("should have codestral-embed model defined for mistral provider", () => {
			const mistralModels = EMBEDDING_MODEL_PROFILES["mistral"]
			expect(mistralModels).toBeDefined()
			expect(mistralModels?.["codestral-embed-2505"]).toBeDefined()
			expect(mistralModels?.["codestral-embed-2505"].dimension).toBe(1536)
			expect(mistralModels?.["codestral-embed-2505"].scoreThreshold).toBe(0.4)
		})
	})

	describe("getModelDimension", () => {
		it("should return correct dimension for codestral-embed in openai-compatible provider", () => {
			const dimension = getModelDimension("openai-compatible", "codestral-embed")
			expect(dimension).toBe(3072)
		})

		it("should return correct dimension for codestral-embed-2505 in mistral provider", () => {
			const dimension = getModelDimension("mistral", "codestral-embed-2505")
			expect(dimension).toBe(1536)
		})

		it("should return undefined for unknown model", () => {
			const dimension = getModelDimension("openai-compatible", "unknown-model")
			expect(dimension).toBeUndefined()
		})

		it("should return correct dimensions for other openai-compatible models", () => {
			expect(getModelDimension("openai-compatible", "text-embedding-3-small")).toBe(1536)
			expect(getModelDimension("openai-compatible", "text-embedding-3-large")).toBe(3072)
			expect(getModelDimension("openai-compatible", "text-embedding-ada-002")).toBe(1536)
			expect(getModelDimension("openai-compatible", "nomic-embed-code")).toBe(3584)
		})
	})
})
