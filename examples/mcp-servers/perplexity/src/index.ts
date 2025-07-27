#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import axios, { AxiosInstance } from "axios"

// Get API key from environment
const API_KEY = process.env.PERPLEXITY_API_KEY
if (!API_KEY) {
	throw new Error("PERPLEXITY_API_KEY environment variable is required")
}

// Define types for Perplexity API
interface PerplexityMessage {
	role: "system" | "user" | "assistant"
	content: string
}

interface PerplexitySearchOptions {
	model?: string
	temperature?: number
	top_p?: number
	search_domain_filter?: string[]
	return_citations?: boolean
	return_images?: boolean
	return_related_questions?: boolean
	search_recency_filter?: "month" | "week" | "day" | "hour"
	top_k?: number
	stream?: boolean
	presence_penalty?: number
	frequency_penalty?: number
}

interface PerplexityResponse {
	id: string
	model: string
	created: number
	usage: {
		prompt_tokens: number
		completion_tokens: number
		total_tokens: number
	}
	citations?: string[]
	choices: Array<{
		index: number
		finish_reason: string
		message: {
			role: string
			content: string
		}
		delta?: {
			role?: string
			content?: string
		}
	}>
}

// Create MCP server
const server = new McpServer({
	name: "perplexity-server",
	version: "0.1.0",
})

// Create axios instance for Perplexity API
const perplexityApi: AxiosInstance = axios.create({
	baseURL: "https://api.perplexity.ai",
	headers: {
		Authorization: `Bearer ${API_KEY}`,
		"Content-Type": "application/json",
	},
})

// Tool for web search using Perplexity
server.tool(
	"web_search",
	{
		query: z.string().describe("Search query for web search"),
		search_domain_filter: z.array(z.string()).optional().describe("List of domains to restrict search to"),
		return_citations: z.boolean().optional().default(true).describe("Whether to return source citations"),
		return_images: z.boolean().optional().default(false).describe("Whether to return relevant images"),
		return_related_questions: z.boolean().optional().default(true).describe("Whether to return related questions"),
		search_recency_filter: z
			.enum(["month", "week", "day", "hour"])
			.optional()
			.describe("Filter results by recency"),
		temperature: z.number().min(0).max(2).optional().default(0.2).describe("Temperature for response generation"),
	},
	async ({
		query,
		search_domain_filter,
		return_citations,
		return_images,
		return_related_questions,
		search_recency_filter,
		temperature,
	}) => {
		try {
			const messages: PerplexityMessage[] = [
				{
					role: "system",
					content:
						"You are a helpful search assistant. Provide accurate and relevant information based on web search results.",
				},
				{
					role: "user",
					content: query,
				},
			]

			const searchOptions: PerplexitySearchOptions = {
				model: "sonar",
				temperature,
				return_citations,
				return_images,
				return_related_questions,
				search_domain_filter,
				search_recency_filter,
			}

			const response = await perplexityApi.post<PerplexityResponse>("/chat/completions", {
				messages,
				...searchOptions,
			})

			const result = response.data.choices[0].message.content
			const citations = response.data.citations || []

			let formattedResult = `## Search Results\n\n${result}`

			if (citations.length > 0) {
				formattedResult += `\n\n## Sources\n`
				citations.forEach((citation, index) => {
					formattedResult += `${index + 1}. ${citation}\n`
				})
			}

			return {
				content: [
					{
						type: "text",
						text: formattedResult,
					},
				],
			}
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					content: [
						{
							type: "text",
							text: `Perplexity API error: ${error.response?.data?.error?.message || error.message}`,
						},
					],
					isError: true,
				}
			}
			throw error
		}
	},
)

// Tool for deep research using Perplexity Pro models
server.tool(
	"deep_research",
	{
		topic: z.string().describe("Research topic or question for in-depth analysis"),
		model: z
			.enum(["sonar-pro", "sonar-reasoning"])
			.optional()
			.default("sonar-pro")
			.describe("Model to use for research"),
		focus_areas: z.array(z.string()).optional().describe("Specific areas to focus the research on"),
		max_tokens: z.number().min(100).max(4000).optional().default(2000).describe("Maximum tokens for response"),
		temperature: z.number().min(0).max(2).optional().default(0.1).describe("Temperature for response generation"),
		return_citations: z.boolean().optional().default(true).describe("Whether to return source citations"),
	},
	async ({ topic, model, focus_areas, max_tokens, temperature, return_citations }) => {
		try {
			let systemPrompt =
				"You are an expert research assistant. Provide comprehensive, well-structured, and accurate information based on the latest available data. Include relevant details, examples, and explanations."

			if (focus_areas && focus_areas.length > 0) {
				systemPrompt += ` Focus particularly on these areas: ${focus_areas.join(", ")}.`
			}

			const messages: PerplexityMessage[] = [
				{
					role: "system",
					content: systemPrompt,
				},
				{
					role: "user",
					content: `Please provide a comprehensive research report on: ${topic}`,
				},
			]

			const response = await perplexityApi.post<PerplexityResponse>("/chat/completions", {
				model,
				messages,
				max_tokens,
				temperature,
				return_citations,
			})

			const result = response.data.choices[0].message.content
			const citations = response.data.citations || []
			const usage = response.data.usage

			let formattedResult = `# Research Report: ${topic}\n\n${result}`

			if (citations.length > 0) {
				formattedResult += `\n\n## References\n`
				citations.forEach((citation, index) => {
					formattedResult += `[${index + 1}] ${citation}\n`
				})
			}

			formattedResult += `\n\n---\n_Model: ${model} | Tokens used: ${usage.total_tokens}_`

			return {
				content: [
					{
						type: "text",
						text: formattedResult,
					},
				],
			}
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					content: [
						{
							type: "text",
							text: `Perplexity API error: ${error.response?.data?.error?.message || error.message}`,
						},
					],
					isError: true,
				}
			}
			throw error
		}
	},
)

// Tool for asking follow-up questions based on previous research
server.tool(
	"ask_followup",
	{
		context: z.string().describe("Previous research context or conversation"),
		question: z.string().describe("Follow-up question to ask"),
		model: z.enum(["sonar", "sonar-pro"]).optional().default("sonar").describe("Model to use"),
		temperature: z.number().min(0).max(2).optional().default(0.3).describe("Temperature for response generation"),
	},
	async ({ context, question, model, temperature }) => {
		try {
			const messages: PerplexityMessage[] = [
				{
					role: "system",
					content:
						"You are a helpful research assistant. Answer follow-up questions based on the provided context and any additional information you can find.",
				},
				{
					role: "user",
					content: `Context: ${context}\n\nQuestion: ${question}`,
				},
			]

			const response = await perplexityApi.post<PerplexityResponse>("/chat/completions", {
				model,
				messages,
				temperature,
				return_citations: true,
			})

			const result = response.data.choices[0].message.content
			const citations = response.data.citations || []

			let formattedResult = `## Follow-up Answer\n\n${result}`

			if (citations.length > 0) {
				formattedResult += `\n\n## Additional Sources\n`
				citations.forEach((citation, index) => {
					formattedResult += `${index + 1}. ${citation}\n`
				})
			}

			return {
				content: [
					{
						type: "text",
						text: formattedResult,
					},
				],
			}
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					content: [
						{
							type: "text",
							text: `Perplexity API error: ${error.response?.data?.error?.message || error.message}`,
						},
					],
					isError: true,
				}
			}
			throw error
		}
	},
)

// Start the server
const transport = new StdioServerTransport()
await server.connect(transport)
console.error("Perplexity MCP server running on stdio")
