import type { ModelInfo } from "../model.js"

// https://docs.sambanova.ai/cloud/docs/get-started/supported-models
export type SambaNovaModelId =
	| "Meta-Llama-3.1-8B-Instruct"
	| "Meta-Llama-3.1-70B-Instruct"
	| "Meta-Llama-3.1-405B-Instruct"
	| "Meta-Llama-3.2-1B-Instruct"
	| "Meta-Llama-3.2-3B-Instruct"
	| "Meta-Llama-3.3-70B-Instruct"
	| "Llama-3.2-11B-Vision-Instruct"
	| "Llama-3.2-90B-Vision-Instruct"
	| "QwQ-32B-Preview"
	| "Qwen2.5-72B-Instruct"
	| "Qwen2.5-Coder-32B-Instruct"
	| "deepseek-r1"
	| "deepseek-r1-distill-llama-70b"

export const sambaNovaDefaultModelId: SambaNovaModelId = "Meta-Llama-3.3-70B-Instruct"

export const sambaNovaModels = {
	"Meta-Llama-3.1-8B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.1,
		outputPrice: 0.2,
		description: "Meta Llama 3.1 8B Instruct model with 128K context window.",
	},
	"Meta-Llama-3.1-70B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.64,
		outputPrice: 0.8,
		description: "Meta Llama 3.1 70B Instruct model with 128K context window.",
	},
	"Meta-Llama-3.1-405B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 3.0,
		outputPrice: 15.0,
		description: "Meta Llama 3.1 405B Instruct model with 128K context window.",
	},
	"Meta-Llama-3.2-1B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.04,
		outputPrice: 0.04,
		description: "Meta Llama 3.2 1B Instruct model with 128K context window.",
	},
	"Meta-Llama-3.2-3B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.06,
		outputPrice: 0.06,
		description: "Meta Llama 3.2 3B Instruct model with 128K context window.",
	},
	"Meta-Llama-3.3-70B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.64,
		outputPrice: 0.8,
		description: "Meta Llama 3.3 70B Instruct model with 128K context window.",
	},
	"Llama-3.2-11B-Vision-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.18,
		outputPrice: 0.2,
		description: "Meta Llama 3.2 11B Vision Instruct model with image support.",
	},
	"Llama-3.2-90B-Vision-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.9,
		outputPrice: 1.1,
		description: "Meta Llama 3.2 90B Vision Instruct model with image support.",
	},
	"QwQ-32B-Preview": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		supportsReasoningBudget: true,
		inputPrice: 0.15,
		outputPrice: 0.15,
		description: "Alibaba QwQ 32B Preview reasoning model.",
	},
	"Qwen2.5-72B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.59,
		outputPrice: 0.79,
		description: "Alibaba Qwen 2.5 72B Instruct model with 128K context window.",
	},
	"Qwen2.5-Coder-32B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.29,
		outputPrice: 0.39,
		description: "Alibaba Qwen 2.5 Coder 32B Instruct model optimized for coding tasks.",
	},
	"deepseek-r1": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		supportsReasoningBudget: true,
		inputPrice: 0.55,
		outputPrice: 2.19,
		description: "DeepSeek R1 reasoning model with 128K context window.",
	},
	"deepseek-r1-distill-llama-70b": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.27,
		outputPrice: 1.08,
		description: "DeepSeek R1 distilled Llama 70B model with 128K context window.",
	},
} as const satisfies Record<string, ModelInfo>
