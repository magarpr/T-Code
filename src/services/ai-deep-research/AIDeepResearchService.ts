import * as vscode from "vscode"

export interface AIDeepResearchCallbacks {
	onThinking?: (thought: string) => Promise<void>
	onSearching?: (query: string) => Promise<void>
	onReading?: (url: string) => Promise<void>
	onAnalyzing?: (content: string) => Promise<void>
	onResult?: (result: string) => Promise<void>
}

export interface SSEEvent {
	type: "thinking" | "searching" | "reading" | "analyzing" | "result" | "error"
	content: string
}

export class AIDeepResearchService {
	private context: vscode.ExtensionContext
	private serverUrl: string

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		// Get server URL from configuration or use default
		const config = vscode.workspace.getConfiguration("roo-code")
		this.serverUrl = config.get<string>("aiDeepResearchServerUrl") || "https://node-deepresearch-ai.onrender.com"
	}

	async performResearch(query: string, callbacks: AIDeepResearchCallbacks): Promise<string> {
		const endpoint = `${this.serverUrl}/v1/chat/completions`

		const requestBody = {
			model: "jina-deepsearch-v2",
			messages: [
				{
					role: "user",
					content: query,
				},
			],
			stream: true,
		}

		try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "text/event-stream",
				},
				body: JSON.stringify(requestBody),
			})

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`)
			}

			if (!response.body) {
				throw new Error("Response body is null")
			}

			// Process SSE stream manually
			const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
			let buffer = ""
			let fullResult = ""
			let currentThought = ""

			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += value
				const lines = buffer.split("\n")
				buffer = lines.pop() || ""

				for (const line of lines) {
					if (line.trim() === "") continue
					if (line.startsWith("data: ")) {
						const data = line.slice(6)

						if (data === "[DONE]") {
							break
						}

						try {
							const parsed = JSON.parse(data)
							const content = parsed.choices?.[0]?.delta?.content

							if (content) {
								// Parse the content to determine the event type
								const event = this.parseEventFromContent(content)

								switch (event.type) {
									case "thinking":
										currentThought += event.content
										if (callbacks.onThinking) {
											await callbacks.onThinking(currentThought)
										}
										break
									case "searching":
										if (callbacks.onSearching) {
											await callbacks.onSearching(event.content)
										}
										break
									case "reading":
										if (callbacks.onReading) {
											await callbacks.onReading(event.content)
										}
										break
									case "analyzing":
										if (callbacks.onAnalyzing) {
											await callbacks.onAnalyzing(event.content)
										}
										break
									case "result":
										fullResult += event.content
										if (callbacks.onResult) {
											await callbacks.onResult(fullResult)
										}
										break
								}
							}
						} catch (error) {
							console.error("Error parsing SSE data:", error)
						}
					}
				}
			}

			return fullResult || "Research completed but no results were returned."
		} catch (error) {
			console.error("AI Deep Research error:", error)
			throw error
		}
	}

	private parseEventFromContent(content: string): SSEEvent {
		// Simple parsing logic - in a real implementation, the server would send structured events
		// For now, we'll use heuristics to determine the event type

		if (content.includes("thinking") || content.includes("analyzing")) {
			return { type: "thinking", content }
		} else if (content.includes("searching") || content.includes("query")) {
			return { type: "searching", content }
		} else if (content.includes("reading") || content.includes("URL") || content.includes("http")) {
			return { type: "reading", content }
		} else if (content.includes("found") || content.includes("result")) {
			return { type: "result", content }
		} else {
			// Default to thinking for general content
			return { type: "thinking", content }
		}
	}
}
