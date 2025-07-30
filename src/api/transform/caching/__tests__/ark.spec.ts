// npx vitest run api/transform/caching/__tests__/ark.spec.ts

import {
	addArkCaching,
	extractArkResponseId,
	getArkCachedTokens,
	hasArkCachedTokens,
	ArkChatCompletionCreateParamsStreaming,
	ArkChatCompletionCreateParamsNonStreaming,
} from "../ark"
import OpenAI from "openai"

describe("Ark Context Caching", () => {
	describe("addArkCaching", () => {
		it("should add basic caching configuration", () => {
			const requestOptions: ArkChatCompletionCreateParamsStreaming = {
				model: "doubao-pro-4k",
				messages: [
					{ role: "system", content: "You are a helpful assistant." },
					{ role: "user", content: "Hello!" },
				],
				stream: true,
			}

			addArkCaching(requestOptions)

			expect(requestOptions).toEqual(
				expect.objectContaining({
					model: "doubao-pro-4k",
					messages: expect.any(Array),
					stream: true,
					caching: { type: "enabled" },
				}),
			)
		})

		it("should add previous response ID when provided", () => {
			const requestOptions: ArkChatCompletionCreateParamsStreaming = {
				model: "doubao-pro-4k",
				messages: [{ role: "user", content: "Follow up question" }],
				stream: true,
			}

			addArkCaching(requestOptions, {
				previousResponseId: "response-123",
			})

			expect(requestOptions).toEqual(
				expect.objectContaining({
					caching: { type: "enabled" },
					previous_response_id: "response-123",
				}),
			)
		})

		it("should add cache TTL when provided", () => {
			const requestOptions: ArkChatCompletionCreateParamsStreaming = {
				model: "doubao-pro-4k",
				messages: [{ role: "user", content: "Hello!" }],
				stream: true,
			}

			addArkCaching(requestOptions, {
				cacheTtl: 7200, // 2 hours
			})

			expect(requestOptions).toEqual(
				expect.objectContaining({
					caching: { type: "enabled" },
					cache_ttl: 7200,
				}),
			)
		})

		it("should add both previous response ID and cache TTL", () => {
			const requestOptions: ArkChatCompletionCreateParamsStreaming = {
				model: "doubao-pro-4k",
				messages: [{ role: "user", content: "Hello!" }],
				stream: true,
			}

			addArkCaching(requestOptions, {
				previousResponseId: "response-456",
				cacheTtl: 3600,
			})

			expect(requestOptions).toEqual(
				expect.objectContaining({
					caching: { type: "enabled" },
					previous_response_id: "response-456",
					cache_ttl: 3600,
				}),
			)
		})

		it("should work with non-streaming requests", () => {
			const requestOptions: ArkChatCompletionCreateParamsNonStreaming = {
				model: "doubao-pro-4k",
				messages: [{ role: "user", content: "Hello!" }],
			}

			addArkCaching(requestOptions, {
				previousResponseId: "response-789",
				cacheTtl: 1800,
			})

			expect(requestOptions).toEqual(
				expect.objectContaining({
					caching: { type: "enabled" },
					previous_response_id: "response-789",
					cache_ttl: 1800,
				}),
			)
		})

		it("should not add optional fields when not provided", () => {
			const requestOptions: ArkChatCompletionCreateParamsStreaming = {
				model: "doubao-pro-4k",
				messages: [{ role: "user", content: "Hello!" }],
				stream: true,
			}

			addArkCaching(requestOptions, {})

			expect(requestOptions).toEqual(
				expect.objectContaining({
					caching: { type: "enabled" },
				}),
			)
			expect(requestOptions).not.toHaveProperty("previous_response_id")
			expect(requestOptions).not.toHaveProperty("cache_ttl")
		})
	})

	describe("extractArkResponseId", () => {
		it("should extract response ID from valid response", () => {
			const response = {
				id: "response-123",
				choices: [
					{
						message: { role: "assistant", content: "Hello!" },
						finish_reason: "stop",
						index: 0,
					},
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 5,
					total_tokens: 15,
				},
			}

			const responseId = extractArkResponseId(response)
			expect(responseId).toBe("response-123")
		})

		it("should return undefined for response without ID", () => {
			const response = {
				choices: [
					{
						message: { role: "assistant", content: "Hello!" },
						finish_reason: "stop",
						index: 0,
					},
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 5,
					total_tokens: 15,
				},
			}

			const responseId = extractArkResponseId(response)
			expect(responseId).toBeUndefined()
		})

		it("should return undefined for null/undefined response", () => {
			expect(extractArkResponseId(null)).toBeUndefined()
			expect(extractArkResponseId(undefined)).toBeUndefined()
		})

		it("should return undefined for empty object", () => {
			const responseId = extractArkResponseId({})
			expect(responseId).toBeUndefined()
		})
	})

	describe("hasArkCachedTokens", () => {
		it("should return true when cached tokens are present and greater than 0", () => {
			const usage = {
				prompt_tokens: 20,
				completion_tokens: 10,
				total_tokens: 30,
				prompt_tokens_details: {
					cached_tokens: 15,
				},
			}

			expect(hasArkCachedTokens(usage)).toBe(true)
		})

		it("should return false when cached tokens are 0", () => {
			const usage = {
				prompt_tokens: 20,
				completion_tokens: 10,
				total_tokens: 30,
				prompt_tokens_details: {
					cached_tokens: 0,
				},
			}

			expect(hasArkCachedTokens(usage)).toBe(false)
		})

		it("should return false when cached tokens are missing", () => {
			const usage = {
				prompt_tokens: 20,
				completion_tokens: 10,
				total_tokens: 30,
				prompt_tokens_details: {},
			}

			expect(hasArkCachedTokens(usage)).toBe(false)
		})

		it("should return false when prompt_tokens_details is missing", () => {
			const usage = {
				prompt_tokens: 20,
				completion_tokens: 10,
				total_tokens: 30,
			}

			expect(hasArkCachedTokens(usage)).toBe(false)
		})

		it("should return false for null/undefined usage", () => {
			expect(hasArkCachedTokens(null)).toBe(false)
			expect(hasArkCachedTokens(undefined)).toBe(false)
		})

		it("should return false for empty object", () => {
			expect(hasArkCachedTokens({})).toBe(false)
		})
	})

	describe("getArkCachedTokens", () => {
		it("should return cached tokens count when present", () => {
			const usage = {
				prompt_tokens: 20,
				completion_tokens: 10,
				total_tokens: 30,
				prompt_tokens_details: {
					cached_tokens: 15,
				},
			}

			expect(getArkCachedTokens(usage)).toBe(15)
		})

		it("should return 0 when cached tokens are 0", () => {
			const usage = {
				prompt_tokens: 20,
				completion_tokens: 10,
				total_tokens: 30,
				prompt_tokens_details: {
					cached_tokens: 0,
				},
			}

			expect(getArkCachedTokens(usage)).toBe(0)
		})

		it("should return 0 when cached tokens are missing", () => {
			const usage = {
				prompt_tokens: 20,
				completion_tokens: 10,
				total_tokens: 30,
				prompt_tokens_details: {},
			}

			expect(getArkCachedTokens(usage)).toBe(0)
		})

		it("should return 0 when prompt_tokens_details is missing", () => {
			const usage = {
				prompt_tokens: 20,
				completion_tokens: 10,
				total_tokens: 30,
			}

			expect(getArkCachedTokens(usage)).toBe(0)
		})

		it("should return 0 for null/undefined usage", () => {
			expect(getArkCachedTokens(null)).toBe(0)
			expect(getArkCachedTokens(undefined)).toBe(0)
		})

		it("should return 0 for empty object", () => {
			expect(getArkCachedTokens({})).toBe(0)
		})

		it("should handle negative cached tokens gracefully", () => {
			const usage = {
				prompt_tokens: 20,
				completion_tokens: 10,
				total_tokens: 30,
				prompt_tokens_details: {
					cached_tokens: -5, // Invalid but should be handled
				},
			}

			expect(getArkCachedTokens(usage)).toBe(-5)
		})

		it("should handle non-numeric cached tokens gracefully", () => {
			const usage = {
				prompt_tokens: 20,
				completion_tokens: 10,
				total_tokens: 30,
				prompt_tokens_details: {
					cached_tokens: "invalid", // Invalid type
				},
			}

			expect(getArkCachedTokens(usage)).toBe("invalid")
		})
	})

	describe("integration scenarios", () => {
		it("should handle complete caching workflow", () => {
			// First request - no previous response ID
			const firstRequest: ArkChatCompletionCreateParamsStreaming = {
				model: "doubao-pro-4k",
				messages: [{ role: "user", content: "Hello!" }],
				stream: true,
			}

			addArkCaching(firstRequest, { cacheTtl: 3600 })

			expect(firstRequest).toEqual(
				expect.objectContaining({
					caching: { type: "enabled" },
					cache_ttl: 3600,
				}),
			)
			expect(firstRequest).not.toHaveProperty("previous_response_id")

			// Simulate first response
			const firstResponse = {
				id: "response-first",
				choices: [
					{
						message: { role: "assistant", content: "Hi there!" },
						finish_reason: "stop",
						index: 0,
					},
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 5,
					total_tokens: 15,
					prompt_tokens_details: {
						cached_tokens: 0, // No cache on first request
					},
				},
			}

			const firstResponseId = extractArkResponseId(firstResponse)
			expect(firstResponseId).toBe("response-first")
			expect(hasArkCachedTokens(firstResponse.usage)).toBe(false)

			// Second request - with previous response ID
			const secondRequest: ArkChatCompletionCreateParamsStreaming = {
				model: "doubao-pro-4k",
				messages: [
					{ role: "user", content: "Hello!" },
					{ role: "assistant", content: "Hi there!" },
					{ role: "user", content: "How are you?" },
				],
				stream: true,
			}

			addArkCaching(secondRequest, {
				previousResponseId: firstResponseId,
				cacheTtl: 3600,
			})

			expect(secondRequest).toEqual(
				expect.objectContaining({
					caching: { type: "enabled" },
					previous_response_id: "response-first",
					cache_ttl: 3600,
				}),
			)

			// Simulate second response with cached tokens
			const secondResponse = {
				id: "response-second",
				choices: [
					{
						message: { role: "assistant", content: "I'm doing well, thanks!" },
						finish_reason: "stop",
						index: 0,
					},
				],
				usage: {
					prompt_tokens: 20,
					completion_tokens: 8,
					total_tokens: 28,
					prompt_tokens_details: {
						cached_tokens: 15, // Cache hit!
					},
				},
			}

			expect(hasArkCachedTokens(secondResponse.usage)).toBe(true)
			expect(getArkCachedTokens(secondResponse.usage)).toBe(15)
		})
	})
})
