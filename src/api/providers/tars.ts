import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import { tarsDefaultModelId, tarsDefaultModelInfo, TARS_PROMPT_CACHING_MODELS } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStreamChunk } from "../transform/stream"
import { addCacheBreakpoints as addAnthropicCacheBreakpoints } from "../transform/caching/anthropic"

import { DEFAULT_HEADERS } from "./constants"
import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler } from "../index"

export class TarsHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options

		const baseURL = this.options.tarsBaseUrl || "https://api.tetrate.io/v1"
		const apiKey = this.options.tarsApiKey ?? "not-provided"

		this.client = new OpenAI({ baseURL, apiKey, defaultHeaders: DEFAULT_HEADERS })
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): AsyncGenerator<ApiStreamChunk> {
		const model = this.getModel()

		const { id: modelId, info: modelInfo } = model
		const maxTokens =
			this.options.includeMaxTokens !== false && modelInfo.maxTokens ? modelInfo.maxTokens : undefined
		const temperature = this.options.modelTemperature ?? 0

		// Convert Anthropic messages to OpenAI format
		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertToOpenAiMessages(messages),
		]

		// Add prompt caching for supported models
		if (TARS_PROMPT_CACHING_MODELS.has(modelId)) {
			addAnthropicCacheBreakpoints(systemPrompt, openAiMessages)
		}

		const completionParams: OpenAI.Chat.ChatCompletionCreateParams = {
			model: modelId,
			...(maxTokens && { max_tokens: maxTokens }),
			temperature,
			messages: openAiMessages,
			stream: true,
			stream_options: { include_usage: true },
		}

		const stream = await this.client.chat.completions.create(completionParams)

		let lastUsage: OpenAI.CompletionUsage | undefined = undefined

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta

			if (delta?.content) {
				yield { type: "text", text: delta.content }
			}

			if (chunk.usage) {
				lastUsage = chunk.usage
			}
		}

		if (lastUsage) {
			yield {
				type: "usage",
				inputTokens: lastUsage.prompt_tokens || 0,
				outputTokens: lastUsage.completion_tokens || 0,
				cacheReadTokens: lastUsage.prompt_tokens_details?.cached_tokens,
				totalCost: 0, // TARS doesn't provide cost information in the API response
			}
		}
	}

	override getModel() {
		const id = this.options.tarsModelId ?? tarsDefaultModelId
		const info = tarsDefaultModelInfo

		return { id, info }
	}

	async completePrompt(prompt: string) {
		const model = this.getModel()
		const { id: modelId, info: modelInfo } = model
		const maxTokens = modelInfo.maxTokens
		const temperature = this.options.modelTemperature ?? 0

		const completionParams: OpenAI.Chat.ChatCompletionCreateParams = {
			model: modelId,
			max_tokens: maxTokens,
			temperature,
			messages: [{ role: "user", content: prompt }],
			stream: false,
		}

		const response = await this.client.chat.completions.create(completionParams)
		return response.choices[0]?.message?.content || ""
	}
}
