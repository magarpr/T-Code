import {
	internationalZAiModels,
	mainlandZAiModels,
	internationalZAiDefaultModelId,
	mainlandZAiDefaultModelId,
	type InternationalZAiModelId,
	type MainlandZAiModelId,
	ZAI_DEFAULT_TEMPERATURE,
} from "@roo-code/types"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import type { ApiHandlerOptions } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { convertToOpenAiMessages } from "../transform/openai-format"
import type { ApiHandlerCreateMessageMetadata } from "../index"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class ZAiHandler extends BaseOpenAiCompatibleProvider<InternationalZAiModelId | MainlandZAiModelId> {
	private readonly isGLM45: boolean

	constructor(options: ApiHandlerOptions) {
		const isChina = options.zaiApiLine === "china"
		const models = isChina ? mainlandZAiModels : internationalZAiModels
		const defaultModelId = isChina ? mainlandZAiDefaultModelId : internationalZAiDefaultModelId

		super({
			...options,
			providerName: "Z AI",
			baseURL: isChina ? "https://open.bigmodel.cn/api/paas/v4" : "https://api.z.ai/api/paas/v4",
			apiKey: options.zaiApiKey ?? "not-provided",
			defaultProviderModelId: defaultModelId,
			providerModels: models,
			defaultTemperature: ZAI_DEFAULT_TEMPERATURE,
		})

		// Check if the model is GLM-4.5 or GLM-4.5-Air
		const modelId = options.apiModelId || defaultModelId
		this.isGLM45 = modelId.includes("glm-4.5")
	}

	/**
	 * Override createMessage to add GLM-specific handling
	 */
	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		// For GLM-4.5 models, enhance the system prompt with clearer instructions
		let enhancedSystemPrompt = systemPrompt

		if (this.isGLM45) {
			// Add GLM-specific instructions to prevent hallucination and improve tool understanding
			const glmInstructions = `

# CRITICAL INSTRUCTIONS FOR GLM MODEL

## File and Code Awareness
- NEVER assume or hallucinate files that don't exist. Always verify file existence using the provided tools.
- When exploring code, ALWAYS use the available tools (read_file, list_files, search_files) to examine actual files.
- If you're unsure about a file's existence or location, use list_files to explore the directory structure first.
- Base all code analysis and modifications on actual file contents retrieved through tools, not assumptions.

## Tool Usage Protocol
- Tools are invoked using XML-style tags as shown in the examples.
- Each tool invocation must be properly formatted with the exact tool name as the XML tag.
- Wait for tool execution results before proceeding to the next step.
- Never simulate or imagine tool outputs - always use actual results.

## Content Management
- When working with large files or responses, focus on the specific sections relevant to the task.
- Use partial reads when available to efficiently handle large files.
- Condense and summarize appropriately while maintaining accuracy.
- Keep responses concise and within token limits by focusing on essential information.

## Code Indexing Integration
- The code index provides semantic understanding of the codebase.
- Use codebase_search for initial exploration when available.
- Combine index results with actual file reading for complete understanding.
- Trust the index for finding relevant code patterns and implementations.`

			enhancedSystemPrompt = systemPrompt + glmInstructions
		}

		const {
			id: model,
			info: { maxTokens: max_tokens },
		} = this.getModel()

		const temperature = this.options.modelTemperature ?? this.defaultTemperature

		// For GLM models, we may need to adjust the max_tokens to leave room for proper responses
		// GLM models sometimes struggle with very high token limits
		const adjustedMaxTokens = this.isGLM45 && max_tokens ? Math.min(max_tokens, 32768) : max_tokens

		const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model,
			max_tokens: adjustedMaxTokens || 32768,
			temperature,
			messages: [
				{ role: "system", content: enhancedSystemPrompt },
				...this.preprocessMessages(convertToOpenAiMessages(messages)),
			],
			stream: true,
			stream_options: { include_usage: true },
		}

		// Add additional parameters for GLM models to improve response quality
		if (this.isGLM45) {
			// GLM models benefit from explicit top_p and frequency_penalty settings
			Object.assign(params, {
				top_p: 0.95,
				frequency_penalty: 0.1,
				presence_penalty: 0.1,
			})
		}

		const stream = await this.client.chat.completions.create(params)

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

	/**
	 * Preprocess messages for GLM models to ensure better understanding
	 */
	private preprocessMessages(
		messages: OpenAI.Chat.ChatCompletionMessageParam[],
	): OpenAI.Chat.ChatCompletionMessageParam[] {
		if (!this.isGLM45) {
			return messages
		}

		// For GLM models, ensure tool-related messages are clearly formatted
		return messages.map((msg) => {
			if (msg.role === "assistant" && typeof msg.content === "string") {
				// Ensure XML tags in assistant messages are properly formatted
				// GLM models sometimes struggle with complex XML structures
				const content = msg.content
					.replace(/(<\/?[^>]+>)/g, "\n$1\n") // Add newlines around XML tags
					.replace(/\n\n+/g, "\n") // Remove excessive newlines
					.trim()

				return { ...msg, content }
			}

			if (msg.role === "user" && Array.isArray(msg.content)) {
				// For user messages with multiple content blocks, ensure text is clear
				const processedContent = msg.content.map((block: any) => {
					if (block.type === "text") {
						// Add clear markers for tool results to help GLM understand context
						if (block.text.includes("[ERROR]") || block.text.includes("Error:")) {
							return {
								...block,
								text: `[TOOL EXECUTION RESULT - ERROR]\n${block.text}\n[END TOOL RESULT]`,
							}
						} else if (block.text.includes("Success:") || block.text.includes("successfully")) {
							return {
								...block,
								text: `[TOOL EXECUTION RESULT - SUCCESS]\n${block.text}\n[END TOOL RESULT]`,
							}
						}
					}
					return block
				})

				return { ...msg, content: processedContent }
			}

			return msg
		})
	}

	/**
	 * Override completePrompt for better GLM handling
	 */
	override async completePrompt(prompt: string): Promise<string> {
		const { id: modelId } = this.getModel()

		try {
			// For GLM models, add a clear instruction prefix
			const enhancedPrompt = this.isGLM45
				? `[INSTRUCTION] Please provide a direct and accurate response based on facts. Do not hallucinate or make assumptions.\n\n${prompt}`
				: prompt

			const response = await this.client.chat.completions.create({
				model: modelId,
				messages: [{ role: "user", content: enhancedPrompt }],
				temperature: this.defaultTemperature,
				max_tokens: 4096,
			})

			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`${this.providerName} completion error: ${error.message}`)
			}

			throw error
		}
	}
}
