import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"
import axios from "axios"

import { type ModelInfo, openAiModelInfoSaneDefaults, LMSTUDIO_DEFAULT_TEMPERATURE } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { XmlMatcher } from "../../utils/xml-matcher"

import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"

import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { getModels, getModelsFromCache } from "./fetchers/modelCache"

// Default timeout for LM Studio requests (10 minutes)
const LMSTUDIO_DEFAULT_TIMEOUT_SECONDS = 600

export class LmStudioHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.client = new OpenAI({
			baseURL: (this.options.lmStudioBaseUrl || "http://localhost:1234") + "/v1",
			apiKey: "noop",
		})
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertToOpenAiMessages(messages),
		]

		// -------------------------
		// Track token usage
		// -------------------------
		const toContentBlocks = (
			blocks: Anthropic.Messages.MessageParam[] | string,
		): Anthropic.Messages.ContentBlockParam[] => {
			if (typeof blocks === "string") {
				return [{ type: "text", text: blocks }]
			}

			const result: Anthropic.Messages.ContentBlockParam[] = []
			for (const msg of blocks) {
				if (typeof msg.content === "string") {
					result.push({ type: "text", text: msg.content })
				} else if (Array.isArray(msg.content)) {
					for (const part of msg.content) {
						if (part.type === "text") {
							result.push({ type: "text", text: part.text })
						}
					}
				}
			}
			return result
		}

		let inputTokens = 0
		try {
			inputTokens = await this.countTokens([{ type: "text", text: systemPrompt }, ...toContentBlocks(messages)])
		} catch (err) {
			console.error("[LmStudio] Failed to count input tokens:", err)
			inputTokens = 0
		}

		let assistantText = ""

		// Create AbortController with configurable timeout
		const controller = new AbortController()
		let timeoutId: NodeJS.Timeout | undefined

		// Get timeout from settings or use default (10 minutes)
		const timeoutSeconds = this.options.lmStudioTimeoutSeconds ?? LMSTUDIO_DEFAULT_TIMEOUT_SECONDS
		const timeoutMs = timeoutSeconds * 1000

		try {
			timeoutId = setTimeout(() => {
				controller.abort()
			}, timeoutMs)

			const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming & { draft_model?: string } = {
				model: this.getModel().id,
				messages: openAiMessages,
				temperature: this.options.modelTemperature ?? LMSTUDIO_DEFAULT_TEMPERATURE,
				stream: true,
			}

			if (this.options.lmStudioSpeculativeDecodingEnabled && this.options.lmStudioDraftModelId) {
				params.draft_model = this.options.lmStudioDraftModelId
			}

			const results = await this.client.chat.completions.create(params, {
				signal: controller.signal,
			})

			const matcher = new XmlMatcher(
				"think",
				(chunk) =>
					({
						type: chunk.matched ? "reasoning" : "text",
						text: chunk.data,
					}) as const,
			)

			for await (const chunk of results) {
				const delta = chunk.choices[0]?.delta

				if (delta?.content) {
					assistantText += delta.content
					for (const processedChunk of matcher.update(delta.content)) {
						yield processedChunk
					}
				}
			}

			for (const processedChunk of matcher.final()) {
				yield processedChunk
			}

			let outputTokens = 0
			try {
				outputTokens = await this.countTokens([{ type: "text", text: assistantText }])
			} catch (err) {
				console.error("[LmStudio] Failed to count output tokens:", err)
				outputTokens = 0
			}

			yield {
				type: "usage",
				inputTokens,
				outputTokens,
			} as const

			// Clear timeout after successful completion
			clearTimeout(timeoutId)
		} catch (error: unknown) {
			// Clear timeout on error
			clearTimeout(timeoutId)

			// Check if this is an abort error (timeout)
			if (error instanceof Error && error.name === "AbortError") {
				throw new Error(
					`LM Studio request timed out after ${timeoutSeconds} seconds. This can happen with large models that need more processing time. Try increasing the timeout in LM Studio settings or use a smaller model.`,
				)
			}

			throw new Error(
				"Please check the LM Studio developer logs to debug what went wrong. You may need to load the model with a larger context length to work with Roo Code's prompts.",
			)
		}
	}

	override getModel(): { id: string; info: ModelInfo } {
		const models = getModelsFromCache("lmstudio")
		if (models && this.options.lmStudioModelId && models[this.options.lmStudioModelId]) {
			return {
				id: this.options.lmStudioModelId,
				info: models[this.options.lmStudioModelId],
			}
		} else {
			return {
				id: this.options.lmStudioModelId || "",
				info: openAiModelInfoSaneDefaults,
			}
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		// Create AbortController with configurable timeout
		const controller = new AbortController()
		let timeoutId: NodeJS.Timeout | undefined

		// Get timeout from settings or use default (10 minutes)
		const timeoutSeconds = this.options.lmStudioTimeoutSeconds ?? LMSTUDIO_DEFAULT_TIMEOUT_SECONDS
		const timeoutMs = timeoutSeconds * 1000

		try {
			timeoutId = setTimeout(() => {
				controller.abort()
			}, timeoutMs)

			// Create params object with optional draft model
			const params: any = {
				model: this.getModel().id,
				messages: [{ role: "user", content: prompt }],
				temperature: this.options.modelTemperature ?? LMSTUDIO_DEFAULT_TEMPERATURE,
				stream: false,
			}

			// Add draft model if speculative decoding is enabled and a draft model is specified
			if (this.options.lmStudioSpeculativeDecodingEnabled && this.options.lmStudioDraftModelId) {
				params.draft_model = this.options.lmStudioDraftModelId
			}

			const response = await this.client.chat.completions.create(params, {
				signal: controller.signal,
			})

			// Clear timeout after successful completion
			clearTimeout(timeoutId)

			return response.choices[0]?.message.content || ""
		} catch (error: unknown) {
			// Clear timeout on error
			clearTimeout(timeoutId)

			// Check if this is an abort error (timeout)
			if (error instanceof Error && error.name === "AbortError") {
				throw new Error(
					`LM Studio request timed out after ${timeoutSeconds} seconds. This can happen with large models that need more processing time. Try increasing the timeout in LM Studio settings or use a smaller model.`,
				)
			}

			throw new Error(
				"Please check the LM Studio developer logs to debug what went wrong. You may need to load the model with a larger context length to work with Roo Code's prompts.",
			)
		}
	}
}

export async function getLmStudioModels(baseUrl = "http://localhost:1234") {
	try {
		if (!URL.canParse(baseUrl)) {
			return []
		}

		const response = await axios.get(`${baseUrl}/v1/models`)
		const modelsArray = response.data?.data?.map((model: any) => model.id) || []
		return [...new Set<string>(modelsArray)]
	} catch (error) {
		return []
	}
}
