import * as vscode from "vscode"
import { Anthropic } from "@anthropic-ai/sdk"
import debounce from "lodash.debounce"

import { buildApiHandler, ApiHandler } from "../../api"
import { ProviderSettings } from "@roo-code/types"
import { Package } from "../../shared/package"

export class AiCompletionProvider implements vscode.InlineCompletionItemProvider {
	private apiHandler: ApiHandler | null = null
	private outputChannel: vscode.OutputChannel
	private debouncedProvideCompletions: ReturnType<typeof debounce>
	private lastCompletionRequestId = 0
	private activeCompletionRequest: AbortController | null = null

	constructor(outputChannel: vscode.OutputChannel) {
		this.outputChannel = outputChannel

		// Initialize debounced completion function
		const debounceDelay = vscode.workspace
			.getConfiguration(Package.name)
			.get<number>("aiTabCompletion.debounceDelay", 300)
		this.debouncedProvideCompletions = debounce(this.provideCompletionsInternal.bind(this), debounceDelay)

		// Update configuration when settings change
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(`${Package.name}.aiTabCompletion`)) {
				this.updateConfiguration()
			}
		})

		this.updateConfiguration()
	}

	private updateConfiguration() {
		const config = vscode.workspace.getConfiguration(Package.name)
		const enabled = config.get<boolean>("aiTabCompletion.enabled", false)

		if (!enabled) {
			this.apiHandler = null
			return
		}

		const provider = config.get<string>("aiTabCompletion.provider", "anthropic")
		const model = config.get<string>("aiTabCompletion.model", "claude-3-haiku-20240307")

		// Build provider settings based on configuration
		const providerSettings: ProviderSettings = {
			apiProvider: provider as any,
			apiModelId: model,
		}

		// Add API keys based on provider
		switch (provider) {
			case "anthropic": {
				const anthropicKey = config.get<string>("anthropicApiKey")
				if (anthropicKey) {
					providerSettings.apiKey = anthropicKey
				}
				break
			}
			case "openai": {
				const openaiKey = config.get<string>("openaiApiKey")
				if (openaiKey) {
					providerSettings.openAiApiKey = openaiKey
				}
				break
			}
			case "openrouter": {
				const openrouterKey = config.get<string>("openRouterApiKey")
				if (openrouterKey) {
					providerSettings.openRouterApiKey = openrouterKey
				}
				break
			}
			// Add other providers as needed
		}

		try {
			this.apiHandler = buildApiHandler(providerSettings)
			this.outputChannel.appendLine(`AI Tab Completion: Initialized with provider ${provider} and model ${model}`)
		} catch (error) {
			this.outputChannel.appendLine(`AI Tab Completion: Failed to initialize - ${error}`)
			this.apiHandler = null
		}

		// Update debounce delay
		const newDebounceDelay = config.get<number>("aiTabCompletion.debounceDelay", 300)
		this.debouncedProvideCompletions = debounce(this.provideCompletionsInternal.bind(this), newDebounceDelay)
	}

	async provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.InlineCompletionContext,
		token: vscode.CancellationToken,
	): Promise<vscode.InlineCompletionItem[] | undefined> {
		if (!this.apiHandler) {
			return undefined
		}

		// Cancel any existing completion request
		if (this.activeCompletionRequest) {
			this.activeCompletionRequest.abort()
		}

		// Create new abort controller for this request
		this.activeCompletionRequest = new AbortController()
		const requestId = ++this.lastCompletionRequestId

		// Use debounced function
		return new Promise((resolve) => {
			this.debouncedProvideCompletions(document, position, context, token, requestId, resolve)
		})
	}

	private async provideCompletionsInternal(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.InlineCompletionContext,
		token: vscode.CancellationToken,
		requestId: number,
		resolve: (value: vscode.InlineCompletionItem[] | undefined) => void,
	) {
		// Check if this request is still the latest
		if (requestId !== this.lastCompletionRequestId) {
			resolve(undefined)
			return
		}

		try {
			const config = vscode.workspace.getConfiguration(Package.name)
			const maxTokens = config.get<number>("aiTabCompletion.maxTokens", 150)
			const temperature = config.get<number>("aiTabCompletion.temperature", 0.2)

			// Get context around cursor
			const linePrefix = document.lineAt(position.line).text.substring(0, position.character)
			const lineSuffix = document.lineAt(position.line).text.substring(position.character)

			// Get preceding lines for context (up to 50 lines)
			const precedingLines: string[] = []
			for (let i = Math.max(0, position.line - 50); i < position.line; i++) {
				precedingLines.push(document.lineAt(i).text)
			}

			// Get following lines for context (up to 10 lines)
			const followingLines: string[] = []
			for (let i = position.line + 1; i < Math.min(document.lineCount, position.line + 10); i++) {
				followingLines.push(document.lineAt(i).text)
			}

			// Build prompt for completion
			const prompt = this.buildCompletionPrompt(
				document.languageId,
				precedingLines.join("\n"),
				linePrefix,
				lineSuffix,
				followingLines.join("\n"),
			)

			// Create messages for API
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: prompt,
				},
			]

			// Use streaming for faster response
			const stream = this.apiHandler!.createMessage(
				"You are a code completion assistant. Complete the code at the cursor position. Only provide the completion text, no explanations.",
				messages,
				{
					taskId: `completion-${requestId}`,
					mode: "completion",
				},
			)

			let completion = ""
			for await (const chunk of stream) {
				if (token.isCancellationRequested || requestId !== this.lastCompletionRequestId) {
					break
				}

				if (chunk.type === "text") {
					completion += chunk.text
				}
			}

			// Clean up the completion
			completion = this.cleanCompletion(completion, linePrefix, lineSuffix)

			if (completion && !token.isCancellationRequested && requestId === this.lastCompletionRequestId) {
				const item = new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))
				resolve([item])
			} else {
				resolve(undefined)
			}
		} catch (error) {
			this.outputChannel.appendLine(`AI Tab Completion Error: ${error}`)
			resolve(undefined)
		} finally {
			if (requestId === this.lastCompletionRequestId) {
				this.activeCompletionRequest = null
			}
		}
	}

	private buildCompletionPrompt(
		languageId: string,
		precedingContext: string,
		linePrefix: string,
		lineSuffix: string,
		followingContext: string,
	): string {
		return `Language: ${languageId}

Context before cursor:
${precedingContext}

Current line before cursor: ${linePrefix}
Current line after cursor: ${lineSuffix}

Context after cursor:
${followingContext}

Complete the code at the cursor position. Provide only the code to insert, nothing else. The completion should fit naturally between the prefix and suffix.`
	}

	private cleanCompletion(completion: string, linePrefix: string, lineSuffix: string): string {
		// Remove any markdown code blocks
		completion = completion.replace(/```[\w]*\n?/g, "").replace(/```$/g, "")

		// Trim whitespace
		completion = completion.trim()

		// Remove duplicate prefix if AI included it
		if (completion.startsWith(linePrefix.trimEnd())) {
			completion = completion.substring(linePrefix.trimEnd().length)
		}

		// Remove duplicate suffix if AI included it
		if (lineSuffix && completion.endsWith(lineSuffix.trimStart())) {
			completion = completion.substring(0, completion.length - lineSuffix.trimStart().length)
		}

		// Handle proper spacing
		if (
			linePrefix &&
			!linePrefix.endsWith(" ") &&
			completion &&
			!completion.startsWith(" ") &&
			/\w$/.test(linePrefix)
		) {
			// Add space if needed between words
			completion = " " + completion
		}

		return completion
	}

	dispose() {
		this.debouncedProvideCompletions.cancel()
		if (this.activeCompletionRequest) {
			this.activeCompletionRequest.abort()
		}
	}
}
