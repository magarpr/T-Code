import OpenAI from "openai"

/**
 * Ark/Volcengine context caching implementation using the Responses API
 *
 * According to Volcengine documentation:
 * - Uses `previous_response_id` referring to the `id` of a previous request
 * - Requires `"caching": {"type": "enabled"}` in the request body
 * - Provides finer-grained control compared to the Context API
 * - Supports going back to checkpoints (better for non-linear conversations)
 *
 * @see https://www.volcengine.com/docs/82379/1602228
 */

export interface ArkCacheOptions {
	/** Previous response ID to reference for caching */
	previousResponseId?: string
	/** Cache TTL in seconds (default: 3600 = 1 hour) */
	cacheTtl?: number
}

/**
 * Add context caching support for Ark/Volcengine using the Responses API
 *
 * @param requestOptions - The OpenAI request options to modify
 * @param cacheOptions - Ark-specific caching options
 */
export function addArkCaching(
	requestOptions:
		| OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
		| OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
	cacheOptions: ArkCacheOptions = {},
): void {
	// Enable caching for this request
	;(requestOptions as any).caching = {
		type: "enabled",
	}

	// If we have a previous response ID, reference it for context continuation
	if (cacheOptions.previousResponseId) {
		;(requestOptions as any).previous_response_id = cacheOptions.previousResponseId
	}

	// Set cache TTL (default to 1 hour as recommended in the issue)
	if (cacheOptions.cacheTtl) {
		;(requestOptions as any).cache_ttl = cacheOptions.cacheTtl
	}
}

/**
 * Extract response ID from Ark API response for future caching
 *
 * @param response - The API response from Ark/Volcengine
 * @returns The response ID if available
 */
export function extractArkResponseId(response: any): string | undefined {
	return response?.id
}

/**
 * Check if the response contains cached tokens information
 *
 * @param usage - Usage object from the API response
 * @returns True if cached tokens are present
 */
export function hasArkCachedTokens(usage: any): boolean {
	return usage?.prompt_tokens_details?.cached_tokens > 0
}

/**
 * Extract cached tokens count from Ark usage metrics
 *
 * @param usage - Usage object from the API response
 * @returns Number of cached tokens used
 */
export function getArkCachedTokens(usage: any): number {
	return usage?.prompt_tokens_details?.cached_tokens || 0
}
