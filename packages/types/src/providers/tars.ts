import type { ModelInfo } from "../model.js"

// TARS is a router service similar to OpenRouter, so we'll follow a similar pattern
export const tarsDefaultModelId = "anthropic/claude-3-5-sonnet-20241022"

export const tarsDefaultModelInfo: ModelInfo = {
	maxTokens: 8192,
	contextWindow: 200_000,
	supportsImages: true,
	supportsComputerUse: false,
	supportsPromptCache: true,
	inputPrice: 3.0,
	outputPrice: 15.0,
	cacheWritesPrice: 3.75,
	cacheReadsPrice: 0.3,
	description:
		"Claude 3.5 Sonnet delivers strong performance on tasks requiring visual reasoning, like interpreting charts, graphs, or diagrams. It's a versatile, balanced model that handles both text and image inputs effectively.",
}

export const TARS_DEFAULT_PROVIDER_NAME = "[default]"

// Models that support prompt caching through TARS
export const TARS_PROMPT_CACHING_MODELS = new Set([
	"anthropic/claude-3-haiku-20240307",
	"anthropic/claude-3-opus-20240229",
	"anthropic/claude-3-sonnet-20240229",
	"anthropic/claude-3-5-haiku-20241022",
	"anthropic/claude-3-5-sonnet-20240620",
	"anthropic/claude-3-5-sonnet-20241022",
])
