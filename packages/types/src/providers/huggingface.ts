import { z } from "zod"
import { modelInfoSchema } from "../model.js"

export const huggingFaceDefaultModelId = "meta-llama/Llama-3.3-70B-Instruct"

export const huggingFaceModels = {
	"meta-llama/Llama-3.3-70B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
	},
	"meta-llama/Llama-3.2-11B-Vision-Instruct": {
		maxTokens: 4096,
		contextWindow: 131072,
		supportsImages: true,
		supportsPromptCache: false,
	},
	"Qwen/Qwen2.5-72B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
	},
	"mistralai/Mistral-7B-Instruct-v0.3": {
		maxTokens: 8192,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
	},
} as const

export type HuggingFaceModelId = keyof typeof huggingFaceModels

export const huggingFaceModelSchema = z.enum(
	Object.keys(huggingFaceModels) as [HuggingFaceModelId, ...HuggingFaceModelId[]],
)

export const huggingFaceModelInfoSchema = z
	.discriminatedUnion("id", [
		z.object({
			id: z.literal("meta-llama/Llama-3.3-70B-Instruct"),
			info: modelInfoSchema.optional(),
		}),
		z.object({
			id: z.literal("meta-llama/Llama-3.2-11B-Vision-Instruct"),
			info: modelInfoSchema.optional(),
		}),
		z.object({
			id: z.literal("Qwen/Qwen2.5-72B-Instruct"),
			info: modelInfoSchema.optional(),
		}),
		z.object({
			id: z.literal("mistralai/Mistral-7B-Instruct-v0.3"),
			info: modelInfoSchema.optional(),
		}),
	])
	.transform(({ id, info }) => ({
		id,
		info: { ...huggingFaceModels[id], ...info },
	}))
