import type { ModelInfo } from "../model.js"

// https://docs.fireworks.ai/models/overview
export type FireworksModelId =
	| "accounts/fireworks/models/llama-v3p3-70b-instruct"
	| "accounts/fireworks/models/llama-v3p2-11b-vision-instruct"
	| "accounts/fireworks/models/llama-v3p2-90b-vision-instruct"
	| "accounts/fireworks/models/llama-v3p1-405b-instruct"
	| "accounts/fireworks/models/llama-v3p1-70b-instruct"
	| "accounts/fireworks/models/llama-v3p1-8b-instruct"
	| "accounts/fireworks/models/qwen2p5-72b-instruct"
	| "accounts/fireworks/models/qwen2p5-32b-instruct"
	| "accounts/fireworks/models/qwen2p5-14b-instruct"
	| "accounts/fireworks/models/qwen2p5-7b-instruct"
	| "accounts/fireworks/models/qwen2p5-3b-instruct"
	| "accounts/fireworks/models/qwen2p5-1p5b-instruct"
	| "accounts/fireworks/models/qwen2p5-0p5b-instruct"
	| "accounts/fireworks/models/qwen2p5-coder-32b-instruct"
	| "accounts/moonshot/models/moonshot-v1-auto"

export const fireworksDefaultModelId: FireworksModelId = "accounts/fireworks/models/llama-v3p3-70b-instruct"

export const fireworksModels = {
	// Llama models
	"accounts/fireworks/models/llama-v3p3-70b-instruct": {
		maxTokens: 16384,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.9,
		outputPrice: 0.9,
		description: "Meta Llama 3.3 70B Instruct model with 128K context window",
	},
	"accounts/fireworks/models/llama-v3p2-11b-vision-instruct": {
		maxTokens: 16384,
		contextWindow: 131072,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.2,
		outputPrice: 0.2,
		description: "Meta Llama 3.2 11B Vision Instruct model with multimodal capabilities",
	},
	"accounts/fireworks/models/llama-v3p2-90b-vision-instruct": {
		maxTokens: 16384,
		contextWindow: 131072,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 3.0,
		outputPrice: 3.0,
		description: "Meta Llama 3.2 90B Vision Instruct model with multimodal capabilities",
	},
	"accounts/fireworks/models/llama-v3p1-405b-instruct": {
		maxTokens: 16384,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 3.0,
		outputPrice: 3.0,
		description: "Meta Llama 3.1 405B Instruct model, largest Llama model",
	},
	"accounts/fireworks/models/llama-v3p1-70b-instruct": {
		maxTokens: 16384,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.9,
		outputPrice: 0.9,
		description: "Meta Llama 3.1 70B Instruct model with 128K context window",
	},
	"accounts/fireworks/models/llama-v3p1-8b-instruct": {
		maxTokens: 16384,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.2,
		outputPrice: 0.2,
		description: "Meta Llama 3.1 8B Instruct model, efficient and fast",
	},
	// Qwen models
	"accounts/fireworks/models/qwen2p5-72b-instruct": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.9,
		outputPrice: 0.9,
		description: "Alibaba Qwen 2.5 72B Instruct model",
	},
	"accounts/fireworks/models/qwen2p5-32b-instruct": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.9,
		outputPrice: 0.9,
		description: "Alibaba Qwen 2.5 32B Instruct model",
	},
	"accounts/fireworks/models/qwen2p5-14b-instruct": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.2,
		outputPrice: 0.2,
		description: "Alibaba Qwen 2.5 14B Instruct model",
	},
	"accounts/fireworks/models/qwen2p5-7b-instruct": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.2,
		outputPrice: 0.2,
		description: "Alibaba Qwen 2.5 7B Instruct model",
	},
	"accounts/fireworks/models/qwen2p5-3b-instruct": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.1,
		outputPrice: 0.1,
		description: "Alibaba Qwen 2.5 3B Instruct model",
	},
	"accounts/fireworks/models/qwen2p5-1p5b-instruct": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.1,
		outputPrice: 0.1,
		description: "Alibaba Qwen 2.5 1.5B Instruct model",
	},
	"accounts/fireworks/models/qwen2p5-0p5b-instruct": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.1,
		outputPrice: 0.1,
		description: "Alibaba Qwen 2.5 0.5B Instruct model, smallest Qwen model",
	},
	"accounts/fireworks/models/qwen2p5-coder-32b-instruct": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.9,
		outputPrice: 0.9,
		description: "Alibaba Qwen 2.5 Coder 32B Instruct model, optimized for code generation",
	},
	// Moonshot models
	"accounts/moonshot/models/moonshot-v1-auto": {
		maxTokens: 65536,
		contextWindow: 1000000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1.0,
		outputPrice: 1.0,
		description: "Moonshot Kimi model with up to 1M context window",
	},
} as const satisfies Record<string, ModelInfo>
