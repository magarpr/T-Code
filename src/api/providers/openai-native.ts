import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import {
	type ModelInfo,
	openAiNativeDefaultModelId,
	OpenAiNativeModelId,
	openAiNativeModels,
	OPENAI_NATIVE_DEFAULT_TEMPERATURE,
} from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { calculateApiCostOpenAI } from "../../shared/cost"

import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"

export type OpenAiNativeModel = ReturnType<OpenAiNativeHandler["getModel"]>

export class OpenAiNativeHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		const apiKey = this.options.openAiNativeApiKey ?? "not-provided"
		this.client = new OpenAI({ baseURL: this.options.openAiNativeBaseUrl, apiKey })
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const model = this.getModel()
		let id: "o3-mini" | "o3" | "o4-mini" | undefined

		if (model.id.startsWith("o3-mini")) {
			id = "o3-mini"
		} else if (model.id.startsWith("o3")) {
			id = "o3"
		} else if (model.id.startsWith("o4-mini")) {
			id = "o4-mini"
		}

		if (id) {
			yield* this.handleReasonerMessage(model, id, systemPrompt, messages)
		} else if (model.id.startsWith("o1")) {
			yield* this.handleO1FamilyMessage(model, systemPrompt, messages)
		} else if (model.id === "codex-mini-latest") {
			yield* this.handleCodexMiniMessage(model, systemPrompt, messages)
		} else {
			yield* this.handleDefaultModelMessage(model, systemPrompt, messages)
		}
	}

	private async *handleO1FamilyMessage(
		model: OpenAiNativeModel,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): ApiStream {
		// o1 supports developer prompt with formatting
		// o1-preview and o1-mini only support user messages
		const isOriginalO1 = model.id === "o1"
		const response = await this.client.chat.completions.create({
			model: model.id,
			messages: [
				{
					role: isOriginalO1 ? "developer" : "user",
					content: isOriginalO1 ? `Formatting re-enabled\n${systemPrompt}` : systemPrompt,
				},
				...convertToOpenAiMessages(messages),
			],
			stream: true,
			stream_options: { include_usage: true },
		})

		yield* this.handleStreamResponse(response, model)
	}

	private async *handleReasonerMessage(
		model: OpenAiNativeModel,
		family: "o3-mini" | "o3" | "o4-mini",
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): ApiStream {
		const { reasoning } = this.getModel()

		const stream = await this.client.chat.completions.create({
			model: family,
			messages: [
				{
					role: "developer",
					content: `Formatting re-enabled\n${systemPrompt}`,
				},
				...convertToOpenAiMessages(messages),
			],
			stream: true,
			stream_options: { include_usage: true },
			...(reasoning && reasoning),
		})

		yield* this.handleStreamResponse(stream, model)
	}

	private async *handleDefaultModelMessage(
		model: OpenAiNativeModel,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): ApiStream {
		const stream = await this.client.chat.completions.create({
			model: model.id,
			temperature: this.options.modelTemperature ?? OPENAI_NATIVE_DEFAULT_TEMPERATURE,
			messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
			stream: true,
			stream_options: { include_usage: true },
		})

		yield* this.handleStreamResponse(stream, model)
	}

	/**
	 * Makes a request to the OpenAI Responses API endpoint
	 * Used by codex-mini-latest model which requires the v1/responses endpoint
	 */
	private async makeResponsesApiRequest(
		modelId: string,
		instructions: string,
		input: string,
		stream: boolean = true,
	): Promise<Response> {
		// Note: Using fetch() instead of OpenAI client because the OpenAI SDK v5.0.0
		// does not support the v1/responses endpoint used by codex-mini-latest model.
		// This is a special endpoint that requires a different request/response format.
		const apiKey = this.options.openAiNativeApiKey ?? "not-provided"
		const baseURL = this.options.openAiNativeBaseUrl ?? "https://api.openai.com/v1"

		try {
			const response = await fetch(`${baseURL}/responses`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: modelId,
					instructions: instructions,
					input: input,
					stream: stream,
				}),
			})

			if (!response.ok) {
				const errorText = await response.text()
				throw new Error(`OpenAI Responses API error: ${response.status} ${response.statusText} - ${errorText}`)
			}

			return response
		} catch (error) {
			// Handle network failures and other errors
			if (error instanceof TypeError && error.message.includes("fetch")) {
				throw new Error(`Network error while calling OpenAI Responses API: ${error.message}`)
			}
			if (error instanceof Error) {
				throw new Error(`OpenAI Responses API error: ${error.message}`)
			}
			throw new Error("Unknown error occurred while calling OpenAI Responses API")
		}
	}

	private async *handleCodexMiniMessage(
		model: OpenAiNativeModel,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): ApiStream {
		// Convert messages to a single input string
		const input = this.convertMessagesToInput(messages)

		// Make API call using shared helper
		const response = await this.makeResponsesApiRequest(model.id, systemPrompt, input, true)
		yield* this.handleResponsesStreamResponse(response.body, model, systemPrompt, input)
	}

	private convertMessagesToInput(messages: Anthropic.Messages.MessageParam[]): string {
		return messages
			.map((msg) => {
				if (msg.role === "user") {
					if (typeof msg.content === "string") {
						return msg.content
					} else if (Array.isArray(msg.content)) {
						return msg.content
							.filter((part) => part.type === "text")
							.map((part) => part.text)
							.join("\n")
					}
				}
				return ""
			})
			.filter((content) => content)
			.join("\n\n")
	}

	private async *handleResponsesStreamResponse(
		stream: ReadableStream<Uint8Array> | null,
		model: OpenAiNativeModel,
		systemPrompt: string,
		userInput: string,
	): ApiStream {
		if (!stream) {
			throw new Error("No response stream available")
		}

		let totalText = ""
		const reader = stream.getReader()
		const decoder = new TextDecoder()
		let buffer = ""

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split("\n")
				buffer = lines.pop() || ""

				for (const line of lines) {
					if (line.trim() === "") continue
					if (line.startsWith("data: ")) {
						const data = line.slice(6)
						if (data === "[DONE]") continue

						try {
							const event = JSON.parse(data)
							// Handle different event types from responses API
							if (event.type === "response.output_text.delta") {
								yield {
									type: "text",
									text: event.delta,
								}
								totalText += event.delta
							} else if (event.type === "response.completed") {
								// Calculate usage based on text length (approximate)
								// Estimate tokens: ~1 token per 4 characters
								const promptTokens = Math.ceil((systemPrompt.length + userInput.length) / 4)
								const completionTokens = Math.ceil(totalText.length / 4)
								yield* this.yieldUsage(model.info, {
									prompt_tokens: promptTokens,
									completion_tokens: completionTokens,
									total_tokens: promptTokens + completionTokens,
								})
							} else if (event.type === "response.error") {
								// Handle error events from the API
								throw new Error(
									`OpenAI Responses API stream error: ${event.error?.message || "Unknown error"}`,
								)
							} else {
								// Log unknown event types for debugging and future compatibility
								console.debug(
									`OpenAI Responses API: Unknown event type '${event.type}' received`,
									event,
								)
							}
						} catch (e) {
							// Only skip if it's a JSON parsing error
							if (e instanceof SyntaxError) {
								console.debug("OpenAI Responses API: Failed to parse SSE data", data)
							} else {
								// Re-throw other errors (like API errors)
								throw e
							}
						}
					}
				}
			}
		} finally {
			reader.releaseLock()
		}
	}

	private async *handleStreamResponse(
		stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
		model: OpenAiNativeModel,
	): ApiStream {
		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta

			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if (chunk.usage) {
				yield* this.yieldUsage(model.info, chunk.usage)
			}
		}
	}

	private async *yieldUsage(info: ModelInfo, usage: OpenAI.Completions.CompletionUsage | undefined): ApiStream {
		const inputTokens = usage?.prompt_tokens || 0 // sum of cache hits and misses
		const outputTokens = usage?.completion_tokens || 0
		const cacheReadTokens = usage?.prompt_tokens_details?.cached_tokens || 0
		const cacheWriteTokens = 0
		const totalCost = calculateApiCostOpenAI(info, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens)
		const nonCachedInputTokens = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens)

		yield {
			type: "usage",
			inputTokens: nonCachedInputTokens,
			outputTokens: outputTokens,
			cacheWriteTokens: cacheWriteTokens,
			cacheReadTokens: cacheReadTokens,
			totalCost: totalCost,
		}
	}

	override getModel() {
		const modelId = this.options.apiModelId

		let id =
			modelId && modelId in openAiNativeModels ? (modelId as OpenAiNativeModelId) : openAiNativeDefaultModelId

		const info: ModelInfo = openAiNativeModels[id]

		const params = getModelParams({
			format: "openai",
			modelId: id,
			model: info,
			settings: this.options,
			defaultTemperature: OPENAI_NATIVE_DEFAULT_TEMPERATURE,
		})

		// The o3 models are named like "o3-mini-[reasoning-effort]", which are
		// not valid model ids, so we need to strip the suffix.
		return { id: id.startsWith("o3-mini") ? "o3-mini" : id, info, ...params }
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const { id, temperature, reasoning } = this.getModel()

			if (id === "codex-mini-latest") {
				// Make API call using shared helper
				const response = await this.makeResponsesApiRequest(id, "Complete the following prompt:", prompt, false)
				const data = await response.json()
				return data.output_text || ""
			}

			const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: id,
				messages: [{ role: "user", content: prompt }],
				temperature,
				...(reasoning && reasoning),
			}

			const response = await this.client.chat.completions.create(params)
			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`OpenAI Native completion error: ${error.message}`)
			}
			throw error
		}
	}
}
