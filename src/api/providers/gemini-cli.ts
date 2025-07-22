import { spawn, ChildProcess } from "child_process"
import { Anthropic } from "@anthropic-ai/sdk"
import * as vscode from "vscode"

import { type ModelInfo, type GeminiCliModelId, geminiCliDefaultModelId, geminiCliModels } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { ApiStream } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"

interface GeminiCliUsage {
	inputTokens: number
	outputTokens: number
	cacheReadTokens?: number
	cacheWriteTokens?: number
}

export class GeminiCliHandler extends BaseProvider implements SingleCompletionHandler {
	private options: ApiHandlerOptions
	private telemetryCollector: Map<string, GeminiCliUsage> = new Map()
	private currentRequestId: string | null = null

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
	}

	async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const { id: modelId, info } = this.getModel()

		// Generate a unique request ID for telemetry tracking
		this.currentRequestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

		// Initialize usage tracking for this request
		this.telemetryCollector.set(this.currentRequestId, {
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
		})

		try {
			// Prepare the prompt combining system prompt and messages
			const fullPrompt = this.formatPrompt(systemPrompt, messages)

			// Build the command arguments
			const args = this.buildCommandArgs(modelId, fullPrompt)

			// Check if user needs to authenticate
			const needsAuth = await this.checkAuthentication()
			if (needsAuth) {
				yield {
					type: "text",
					text: "Please authenticate with Google in your browser. Once authenticated, please retry your request.",
				}

				// Trigger OAuth flow
				await this.triggerOAuthFlow()
				return
			}

			// Execute the gemini CLI command
			const { text, usage } = await this.executeGeminiCli(args)

			// Yield the response text
			yield {
				type: "text",
				text,
			}

			// Yield usage information
			if (usage) {
				yield {
					type: "usage",
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
					cacheReadTokens: usage.cacheReadTokens,
					cacheWriteTokens: usage.cacheWriteTokens,
					totalCost: this.calculateCost(info, usage),
				}
			}
		} finally {
			// Clean up telemetry data for this request
			if (this.currentRequestId) {
				this.telemetryCollector.delete(this.currentRequestId)
				this.currentRequestId = null
			}
		}
	}

	override getModel() {
		const modelId = this.options.apiModelId
		let id = modelId && modelId in geminiCliModels ? (modelId as GeminiCliModelId) : geminiCliDefaultModelId
		const info: ModelInfo = geminiCliModels[id]
		const params = getModelParams({ format: "gemini", modelId: id, model: info, settings: this.options })

		return { id, info, ...params }
	}

	async completePrompt(prompt: string): Promise<string> {
		const { id: modelId } = this.getModel()
		const args = this.buildCommandArgs(modelId, prompt)

		const { text } = await this.executeGeminiCli(args)
		return text
	}

	private formatPrompt(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): string {
		let fullPrompt = systemPrompt + "\n\n"

		for (const message of messages) {
			if (message.role === "user") {
				fullPrompt += "User: "
			} else if (message.role === "assistant") {
				fullPrompt += "Assistant: "
			}

			if (typeof message.content === "string") {
				fullPrompt += message.content + "\n\n"
			} else if (Array.isArray(message.content)) {
				for (const content of message.content) {
					if (content.type === "text") {
						fullPrompt += content.text + "\n"
					} else if (content.type === "image") {
						fullPrompt += "[Image provided]\n"
					}
				}
				fullPrompt += "\n"
			}
		}

		return fullPrompt.trim()
	}

	private buildCommandArgs(modelId: string, prompt: string): string[] {
		const args = ["prompt", prompt, "--model", modelId]

		// Add project ID if configured
		if (this.options.geminiCliProjectId) {
			args.push("--project", this.options.geminiCliProjectId)
		}

		// Add temperature if configured
		if (this.options.modelTemperature !== undefined && this.options.modelTemperature !== null) {
			args.push("--temperature", this.options.modelTemperature.toString())
		}

		// Add max tokens if configured
		if (this.options.modelMaxTokens) {
			args.push("--max-output-tokens", this.options.modelMaxTokens.toString())
		}

		// Enable JSON output for easier parsing
		args.push("--json")

		return args
	}

	private async checkAuthentication(): Promise<boolean> {
		return new Promise((resolve) => {
			const checkAuth = spawn("gemini", ["auth", "status"], {
				env: { ...process.env },
			})

			checkAuth.on("close", (code) => {
				// If auth check fails, user needs to authenticate
				resolve(code !== 0)
			})

			checkAuth.on("error", () => {
				// If command fails, assume auth is needed
				resolve(true)
			})
		})
	}

	private async triggerOAuthFlow(): Promise<void> {
		return new Promise((resolve, reject) => {
			const authProcess = spawn("gemini", ["auth", "login"], {
				env: { ...process.env },
			})

			authProcess.on("close", (code) => {
				if (code === 0) {
					resolve()
				} else {
					reject(new Error("Authentication failed"))
				}
			})

			authProcess.on("error", (error) => {
				reject(error)
			})
		})
	}

	private async executeGeminiCli(args: string[]): Promise<{ text: string; usage?: GeminiCliUsage }> {
		return new Promise((resolve, reject) => {
			let stdout = ""
			let stderr = ""

			const geminiProcess = spawn("gemini", args, {
				env: { ...process.env },
			})

			geminiProcess.stdout.on("data", (data) => {
				stdout += data.toString()
			})

			geminiProcess.stderr.on("data", (data) => {
				stderr += data.toString()

				// Try to parse telemetry data from stderr
				this.parseTelemetryFromOutput(data.toString())
			})

			geminiProcess.on("close", (code) => {
				if (code !== 0) {
					reject(new Error(`Gemini CLI failed with code ${code}: ${stderr}`))
					return
				}

				try {
					// Parse JSON response
					const response = JSON.parse(stdout)

					// Extract text and usage
					const text = response.text || response.content || ""
					const usage = this.currentRequestId ? this.telemetryCollector.get(this.currentRequestId) : undefined

					resolve({ text, usage })
				} catch (error) {
					// Fallback to plain text if JSON parsing fails
					resolve({ text: stdout.trim() })
				}
			})

			geminiProcess.on("error", (error) => {
				reject(error)
			})
		})
	}

	private parseTelemetryFromOutput(output: string): void {
		if (!this.currentRequestId) return

		// Look for token usage patterns in the output
		// This is a simplified example - actual implementation would depend on gemini CLI output format
		const patterns = {
			inputTokens: /Input tokens:\s*(\d+)/i,
			outputTokens: /Output tokens:\s*(\d+)/i,
			cacheRead: /Cache read tokens:\s*(\d+)/i,
			cacheWrite: /Cache write tokens:\s*(\d+)/i,
		}

		const usage = this.telemetryCollector.get(this.currentRequestId)
		if (!usage) return

		for (const [key, pattern] of Object.entries(patterns)) {
			const match = output.match(pattern)
			if (match) {
				const value = parseInt(match[1], 10)
				switch (key) {
					case "inputTokens":
						usage.inputTokens = value
						break
					case "outputTokens":
						usage.outputTokens = value
						break
					case "cacheRead":
						usage.cacheReadTokens = value
						break
					case "cacheWrite":
						usage.cacheWriteTokens = value
						break
				}
			}
		}

		this.telemetryCollector.set(this.currentRequestId, usage)
	}

	private calculateCost(info: ModelInfo, usage: GeminiCliUsage): number | undefined {
		if (!info.inputPrice || !info.outputPrice) {
			return undefined
		}

		const inputCost = (usage.inputTokens / 1_000_000) * info.inputPrice
		const outputCost = (usage.outputTokens / 1_000_000) * info.outputPrice

		let cacheReadCost = 0
		if (usage.cacheReadTokens && info.cacheReadsPrice) {
			cacheReadCost = (usage.cacheReadTokens / 1_000_000) * info.cacheReadsPrice
		}

		let cacheWriteCost = 0
		if (usage.cacheWriteTokens && info.cacheWritesPrice) {
			cacheWriteCost = (usage.cacheWriteTokens / 1_000_000) * info.cacheWritesPrice
		}

		return inputCost + outputCost + cacheReadCost + cacheWriteCost
	}
}
