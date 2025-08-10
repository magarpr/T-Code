import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI, { AzureOpenAI } from "openai"
import axios from "axios"

import {
	type ModelInfo,
	azureOpenAiDefaultApiVersion,
	openAiModelInfoSaneDefaults,
	DEEP_SEEK_DEFAULT_TEMPERATURE,
	OPENAI_AZURE_AI_INFERENCE_PATH,
	type ReasoningEffortWithMinimal,
	type VerbosityLevel,
	GPT5_DEFAULT_TEMPERATURE,
} from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { XmlMatcher } from "../../utils/xml-matcher"

import { convertToOpenAiMessages } from "../transform/openai-format"
import { convertToR1Format } from "../transform/r1-format"
import { convertToSimpleMessages } from "../transform/simple-format"
import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { DEFAULT_HEADERS } from "./constants"
import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"

// TODO: Rename this to OpenAICompatibleHandler. Also, I think the
// `OpenAINativeHandler` can subclass from this, since it's obviously
// compatible with the OpenAI API. We can also rename it to `OpenAIHandler`.
export class OpenAiHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options

		const baseURL = this.options.openAiBaseUrl ?? "https://api.openai.com/v1"
		const apiKey = this.options.openAiApiKey ?? "not-provided"
		const isAzureAiInference = this._isAzureAiInference(this.options.openAiBaseUrl)
		const urlHost = this._getUrlHost(this.options.openAiBaseUrl)
		const isAzureOpenAi = urlHost === "azure.com" || urlHost.endsWith(".azure.com") || options.openAiUseAzure

		const headers = {
			...DEFAULT_HEADERS,
			...(this.options.openAiHeaders || {}),
		}

		if (isAzureAiInference) {
			// Azure AI Inference Service (e.g., for DeepSeek) uses a different path structure
			this.client = new OpenAI({
				baseURL,
				apiKey,
				defaultHeaders: headers,
				defaultQuery: { "api-version": this.options.azureApiVersion || "2024-05-01-preview" },
			})
		} else if (isAzureOpenAi) {
			// Azure API shape slightly differs from the core API shape:
			// https://github.com/openai/openai-node?tab=readme-ov-file#microsoft-azure-openai
			this.client = new AzureOpenAI({
				baseURL,
				apiKey,
				apiVersion: this.options.azureApiVersion || azureOpenAiDefaultApiVersion,
				defaultHeaders: headers,
			})
		} else {
			this.client = new OpenAI({
				baseURL,
				apiKey,
				defaultHeaders: headers,
			})
		}
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const { info: modelInfo, reasoning } = this.getModel()
		const modelUrl = this.options.openAiBaseUrl ?? ""
		const modelId = this.options.openAiModelId ?? ""
		const enabledR1Format = this.options.openAiR1FormatEnabled ?? false
		const enabledLegacyFormat = this.options.openAiLegacyFormat ?? false
		const isAzureAiInference = this._isAzureAiInference(modelUrl)
		const deepseekReasoner = modelId.includes("deepseek-reasoner") || enabledR1Format
		const ark = modelUrl.includes(".volces.com")

		// Check if this is a GPT-5 model on Azure that needs the responses API
		if (this.isGpt5Model(modelId) && this.options.openAiUseAzure) {
			yield* this.handleGpt5ResponsesAPI(modelId, systemPrompt, messages, metadata)
			return
		}

		if (modelId.includes("o1") || modelId.includes("o3") || modelId.includes("o4")) {
			yield* this.handleO3FamilyMessage(modelId, systemPrompt, messages)
			return
		}

		if (this.options.openAiStreamingEnabled ?? true) {
			let systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
				role: "system",
				content: systemPrompt,
			}

			let convertedMessages

			if (deepseekReasoner) {
				convertedMessages = convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
			} else if (ark || enabledLegacyFormat) {
				convertedMessages = [systemMessage, ...convertToSimpleMessages(messages)]
			} else {
				if (modelInfo.supportsPromptCache) {
					systemMessage = {
						role: "system",
						content: [
							{
								type: "text",
								text: systemPrompt,
								// @ts-ignore-next-line
								cache_control: { type: "ephemeral" },
							},
						],
					}
				}

				convertedMessages = [systemMessage, ...convertToOpenAiMessages(messages)]

				if (modelInfo.supportsPromptCache) {
					// Note: the following logic is copied from openrouter:
					// Add cache_control to the last two user messages
					// (note: this works because we only ever add one user message at a time, but if we added multiple we'd need to mark the user message before the last assistant message)
					const lastTwoUserMessages = convertedMessages.filter((msg) => msg.role === "user").slice(-2)

					lastTwoUserMessages.forEach((msg) => {
						if (typeof msg.content === "string") {
							msg.content = [{ type: "text", text: msg.content }]
						}

						if (Array.isArray(msg.content)) {
							// NOTE: this is fine since env details will always be added at the end. but if it weren't there, and the user added a image_url type message, it would pop a text part before it and then move it after to the end.
							let lastTextPart = msg.content.filter((part) => part.type === "text").pop()

							if (!lastTextPart) {
								lastTextPart = { type: "text", text: "..." }
								msg.content.push(lastTextPart)
							}

							// @ts-ignore-next-line
							lastTextPart["cache_control"] = { type: "ephemeral" }
						}
					})
				}
			}

			const isGrokXAI = this._isGrokXAI(this.options.openAiBaseUrl)

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
				model: modelId,
				temperature: this.options.modelTemperature ?? (deepseekReasoner ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0),
				messages: convertedMessages,
				stream: true as const,
				...(isGrokXAI ? {} : { stream_options: { include_usage: true } }),
				...(reasoning && reasoning),
			}

			// Add max_tokens if needed
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			const stream = await this.client.chat.completions.create(
				requestOptions,
				isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
			)

			const matcher = new XmlMatcher(
				"think",
				(chunk) =>
					({
						type: chunk.matched ? "reasoning" : "text",
						text: chunk.data,
					}) as const,
			)

			let lastUsage

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta ?? {}

				if (delta.content) {
					for (const chunk of matcher.update(delta.content)) {
						yield chunk
					}
				}

				if ("reasoning_content" in delta && delta.reasoning_content) {
					yield {
						type: "reasoning",
						text: (delta.reasoning_content as string | undefined) || "",
					}
				}
				if (chunk.usage) {
					lastUsage = chunk.usage
				}
			}

			for (const chunk of matcher.final()) {
				yield chunk
			}

			if (lastUsage) {
				yield this.processUsageMetrics(lastUsage, modelInfo)
			}
		} else {
			// o1 for instance doesnt support streaming, non-1 temp, or system prompt
			const systemMessage: OpenAI.Chat.ChatCompletionUserMessageParam = {
				role: "user",
				content: systemPrompt,
			}

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: modelId,
				messages: deepseekReasoner
					? convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
					: enabledLegacyFormat
						? [systemMessage, ...convertToSimpleMessages(messages)]
						: [systemMessage, ...convertToOpenAiMessages(messages)],
			}

			// Add max_tokens if needed
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			const response = await this.client.chat.completions.create(
				requestOptions,
				this._isAzureAiInference(modelUrl) ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
			)

			yield {
				type: "text",
				text: response.choices[0]?.message.content || "",
			}

			yield this.processUsageMetrics(response.usage, modelInfo)
		}
	}

	protected processUsageMetrics(usage: any, _modelInfo?: ModelInfo): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.input_tokens || usage?.prompt_tokens || 0,
			outputTokens: usage?.output_tokens || usage?.completion_tokens || 0,
			cacheWriteTokens: usage?.cache_creation_input_tokens || undefined,
			cacheReadTokens: usage?.cache_read_input_tokens || undefined,
		}
	}

	override getModel() {
		const id = this.options.openAiModelId ?? ""
		const info = this.options.openAiCustomModelInfo ?? openAiModelInfoSaneDefaults
		const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const isAzureAiInference = this._isAzureAiInference(this.options.openAiBaseUrl)
			const model = this.getModel()
			const modelInfo = model.info

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: model.id,
				messages: [{ role: "user", content: prompt }],
			}

			// Add max_tokens if needed
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			const response = await this.client.chat.completions.create(
				requestOptions,
				isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
			)

			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`OpenAI completion error: ${error.message}`)
			}

			throw error
		}
	}

	private async *handleO3FamilyMessage(
		modelId: string,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): ApiStream {
		const modelInfo = this.getModel().info
		const methodIsAzureAiInference = this._isAzureAiInference(this.options.openAiBaseUrl)

		if (this.options.openAiStreamingEnabled ?? true) {
			const isGrokXAI = this._isGrokXAI(this.options.openAiBaseUrl)

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
				model: modelId,
				messages: [
					{
						role: "developer",
						content: `Formatting re-enabled\n${systemPrompt}`,
					},
					...convertToOpenAiMessages(messages),
				],
				stream: true,
				...(isGrokXAI ? {} : { stream_options: { include_usage: true } }),
				reasoning_effort: modelInfo.reasoningEffort as "low" | "medium" | "high" | undefined,
				temperature: undefined,
			}

			// O3 family models do not support the deprecated max_tokens parameter
			// but they do support max_completion_tokens (the modern OpenAI parameter)
			// This allows O3 models to limit response length when includeMaxTokens is enabled
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			const stream = await this.client.chat.completions.create(
				requestOptions,
				methodIsAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
			)

			yield* this.handleStreamResponse(stream)
		} else {
			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: modelId,
				messages: [
					{
						role: "developer",
						content: `Formatting re-enabled\n${systemPrompt}`,
					},
					...convertToOpenAiMessages(messages),
				],
				reasoning_effort: modelInfo.reasoningEffort as "low" | "medium" | "high" | undefined,
				temperature: undefined,
			}

			// O3 family models do not support the deprecated max_tokens parameter
			// but they do support max_completion_tokens (the modern OpenAI parameter)
			// This allows O3 models to limit response length when includeMaxTokens is enabled
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			const response = await this.client.chat.completions.create(
				requestOptions,
				methodIsAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
			)

			yield {
				type: "text",
				text: response.choices[0]?.message.content || "",
			}
			yield this.processUsageMetrics(response.usage)
		}
	}

	private async *handleStreamResponse(stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>): ApiStream {
		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta
			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if (chunk.usage) {
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
				}
			}
		}
	}

	private _getUrlHost(baseUrl?: string): string {
		try {
			return new URL(baseUrl ?? "").host
		} catch (error) {
			return ""
		}
	}

	private _isGrokXAI(baseUrl?: string): boolean {
		const urlHost = this._getUrlHost(baseUrl)
		return urlHost.includes("x.ai")
	}

	private _isAzureAiInference(baseUrl?: string): boolean {
		const urlHost = this._getUrlHost(baseUrl)
		return urlHost.endsWith(".services.ai.azure.com")
	}

	/**
	 * Adds max_completion_tokens to the request body if needed based on provider configuration
	 * Note: max_tokens is deprecated in favor of max_completion_tokens as per OpenAI documentation
	 * O3 family models handle max_tokens separately in handleO3FamilyMessage
	 */
	private addMaxTokensIfNeeded(
		requestOptions:
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
		modelInfo: ModelInfo,
	): void {
		// Only add max_completion_tokens if includeMaxTokens is true
		if (this.options.includeMaxTokens === true) {
			// Use user-configured modelMaxTokens if available, otherwise fall back to model's default maxTokens
			// Using max_completion_tokens as max_tokens is deprecated
			requestOptions.max_completion_tokens = this.options.modelMaxTokens || modelInfo.maxTokens
		}
	}

	/**
	 * Checks if the model ID is a GPT-5 model
	 */
	private isGpt5Model(modelId: string): boolean {
		return modelId.startsWith("gpt-5") || modelId.toLowerCase().startsWith("gpt-5")
	}

	/**
	 * Handles GPT-5 models using the Azure responses API format
	 */
	private async *handleGpt5ResponsesAPI(
		modelId: string,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const apiKey = this.options.openAiApiKey ?? "not-provided"
		const baseUrl = this.options.openAiBaseUrl ?? ""

		// Extract the base URL without the path for Azure endpoints
		// Azure URLs typically look like: https://<resource>.openai.azure.com/openai/responses?api-version=...
		const urlParts = baseUrl.match(/^(https?:\/\/[^\/]+)(\/.*)?$/)
		const azureBaseUrl = urlParts ? urlParts[1] : baseUrl
		const responsesUrl = `${azureBaseUrl}/openai/responses`

		// Format the input for the responses API
		const formattedInput = this.formatInputForResponsesAPI(systemPrompt, messages)

		// Get model parameters
		const { info: modelInfo, reasoning, verbosity } = this.getModel()
		const reasoningEffort = this.getGpt5ReasoningEffort(reasoning)

		// Build request body for GPT-5 responses API
		const requestBody: any = {
			model: modelId,
			input: formattedInput,
			stream: true,
			temperature: this.options.modelTemperature ?? GPT5_DEFAULT_TEMPERATURE,
		}

		// Add reasoning effort if configured
		if (reasoningEffort) {
			requestBody.reasoning = {
				effort: reasoningEffort,
			}
			// Add reasoning summary if enabled
			if (this.options.enableGpt5ReasoningSummary !== false) {
				requestBody.reasoning.summary = "auto"
			}
		}

		// Add verbosity if configured
		if (verbosity) {
			requestBody.text = { verbosity: verbosity }
		}

		// Add max_output_tokens if configured
		if (modelInfo.maxTokens) {
			requestBody.max_output_tokens = modelInfo.maxTokens
		}

		try {
			const response = await fetch(responsesUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"api-key": apiKey,
					Accept: "text/event-stream",
				},
				body: JSON.stringify(requestBody),
			})

			if (!response.ok) {
				const errorText = await response.text()
				let errorMessage = `GPT-5 API request failed (${response.status})`

				try {
					const errorJson = JSON.parse(errorText)
					if (errorJson.error?.message) {
						errorMessage += `: ${errorJson.error.message}`
					}
				} catch {
					errorMessage += `: ${errorText}`
				}

				throw new Error(errorMessage)
			}

			if (!response.body) {
				throw new Error("GPT-5 Responses API error: No response body")
			}

			// Handle streaming response
			yield* this.handleGpt5StreamResponse(response.body, modelInfo)
		} catch (error) {
			if (error instanceof Error) {
				throw error
			}
			throw new Error("Unexpected error connecting to GPT-5 API")
		}
	}

	/**
	 * Formats the conversation for the GPT-5 responses API input field
	 */
	private formatInputForResponsesAPI(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): string {
		// Use Developer role format for GPT-5 (consistent with OpenAI Native implementation)
		let formattedInput = `Developer: ${systemPrompt}\n\n`

		for (const message of messages) {
			const role = message.role === "user" ? "User" : "Assistant"

			// Handle text content
			if (typeof message.content === "string") {
				formattedInput += `${role}: ${message.content}\n\n`
			} else if (Array.isArray(message.content)) {
				// Handle content blocks
				const textContent = message.content
					.filter((block) => block.type === "text")
					.map((block) => (block as any).text)
					.join("\n")
				if (textContent) {
					formattedInput += `${role}: ${textContent}\n\n`
				}
			}
		}

		return formattedInput.trim()
	}

	/**
	 * Gets the GPT-5 reasoning effort from model configuration
	 */
	private getGpt5ReasoningEffort(reasoning: any): ReasoningEffortWithMinimal | undefined {
		if (reasoning && "reasoning_effort" in reasoning) {
			const effort = reasoning.reasoning_effort as string
			if (effort === "minimal" || effort === "low" || effort === "medium" || effort === "high") {
				return effort as ReasoningEffortWithMinimal
			}
		}

		// Check if reasoning effort is in options
		const effort = this.options.reasoningEffort
		if (effort === "minimal" || effort === "low" || effort === "medium" || effort === "high") {
			return effort as ReasoningEffortWithMinimal
		}

		return undefined
	}

	/**
	 * Handles the streaming response from the GPT-5 Responses API
	 */
	private async *handleGpt5StreamResponse(body: ReadableStream<Uint8Array>, modelInfo: ModelInfo): ApiStream {
		const reader = body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""
		let hasContent = false

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split("\n")
				buffer = lines.pop() || ""

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6).trim()
						if (data === "[DONE]") {
							continue
						}

						try {
							const parsed = JSON.parse(data)

							// Handle text delta events
							if (parsed.type === "response.text.delta" || parsed.type === "response.output_text.delta") {
								if (parsed.delta) {
									hasContent = true
									yield {
										type: "text",
										text: parsed.delta,
									}
								}
							}
							// Handle reasoning delta events
							else if (
								parsed.type === "response.reasoning.delta" ||
								parsed.type === "response.reasoning_text.delta" ||
								parsed.type === "response.reasoning_summary.delta" ||
								parsed.type === "response.reasoning_summary_text.delta"
							) {
								if (parsed.delta) {
									hasContent = true
									yield {
										type: "reasoning",
										text: parsed.delta,
									}
								}
							}
							// Handle refusal delta events
							else if (parsed.type === "response.refusal.delta") {
								if (parsed.delta) {
									hasContent = true
									yield {
										type: "text",
										text: `[Refusal] ${parsed.delta}`,
									}
								}
							}
							// Handle output item events
							else if (parsed.type === "response.output_item.added") {
								if (parsed.item) {
									if (parsed.item.type === "text" && parsed.item.text) {
										hasContent = true
										yield { type: "text", text: parsed.item.text }
									} else if (parsed.item.type === "reasoning" && parsed.item.text) {
										hasContent = true
										yield { type: "reasoning", text: parsed.item.text }
									}
								}
							}
							// Handle completion events with usage
							else if (parsed.type === "response.done" || parsed.type === "response.completed") {
								if (parsed.response?.usage || parsed.usage) {
									const usage = parsed.response?.usage || parsed.usage
									yield this.processUsageMetrics(usage, modelInfo)
								}
							}
							// Handle complete response in initial event
							else if (
								parsed.response &&
								parsed.response.output &&
								Array.isArray(parsed.response.output)
							) {
								for (const outputItem of parsed.response.output) {
									if (outputItem.type === "text" && outputItem.content) {
										for (const content of outputItem.content) {
											if (content.type === "text" && content.text) {
												hasContent = true
												yield {
													type: "text",
													text: content.text,
												}
											}
										}
									}
								}
								// Check for usage in the complete response
								if (parsed.response.usage) {
									yield this.processUsageMetrics(parsed.response.usage, modelInfo)
								}
							}
							// Handle error events
							else if (parsed.type === "response.error" || parsed.type === "error") {
								if (parsed.error || parsed.message) {
									throw new Error(
										`GPT-5 API error: ${parsed.error?.message || parsed.message || "Unknown error"}`,
									)
								}
							}
						} catch (e) {
							// Silently ignore parsing errors for non-critical SSE data
						}
					}
				}
			}
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Error processing GPT-5 response stream: ${error.message}`)
			}
			throw new Error("Unexpected error processing GPT-5 response stream")
		} finally {
			reader.releaseLock()
		}
	}
}

export async function getOpenAiModels(baseUrl?: string, apiKey?: string, openAiHeaders?: Record<string, string>) {
	try {
		if (!baseUrl) {
			return []
		}

		// Trim whitespace from baseUrl to handle cases where users accidentally include spaces
		const trimmedBaseUrl = baseUrl.trim()

		if (!URL.canParse(trimmedBaseUrl)) {
			return []
		}

		const config: Record<string, any> = {}
		const headers: Record<string, string> = {
			...DEFAULT_HEADERS,
			...(openAiHeaders || {}),
		}

		if (apiKey) {
			headers["Authorization"] = `Bearer ${apiKey}`
		}

		if (Object.keys(headers).length > 0) {
			config["headers"] = headers
		}

		const response = await axios.get(`${trimmedBaseUrl}/models`, config)
		const modelsArray = response.data?.data?.map((model: any) => model.id) || []
		return [...new Set<string>(modelsArray)]
	} catch (error) {
		return []
	}
}
