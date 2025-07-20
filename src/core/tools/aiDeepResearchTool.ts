import { Task } from "../task/Task"
import { AIDeepResearchService } from "../../services/ai-deep-research/AIDeepResearchService"
import { formatResponse } from "../prompts/responses"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag, ToolUse } from "../../shared/tools"
import { ClineSayTool } from "../../shared/ExtensionMessage"

export async function aiDeepResearchTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const toolName = "ai_deep_research"

	// --- Parameter Extraction and Validation ---
	let query: string | undefined = block.params.query
	query = removeClosingTag("query", query)

	const sharedMessageProps: ClineSayTool = {
		tool: "aiDeepResearch",
		query: query,
	}

	if (block.partial) {
		await cline.ask("tool", JSON.stringify(sharedMessageProps), block.partial).catch(() => {})
		return
	}

	if (!query) {
		cline.consecutiveMistakeCount++
		pushToolResult(await cline.sayAndCreateMissingParamError(toolName, "query"))
		return
	}

	const didApprove = await askApproval("tool", JSON.stringify(sharedMessageProps))
	if (!didApprove) {
		pushToolResult(formatResponse.toolDenied())
		return
	}

	cline.consecutiveMistakeCount = 0

	// --- Core Logic ---
	try {
		const context = cline.providerRef.deref()?.context
		if (!context) {
			throw new Error("Extension context is not available.")
		}

		// Initialize the AI Deep Research Service
		const service = new AIDeepResearchService(context)

		// Send initial status to UI
		const initialStatus = {
			tool: "aiDeepResearch",
			query: query,
			status: "thinking",
			content: "",
		}
		await cline.say("ai_deep_research_result", JSON.stringify(initialStatus))

		// Start the research with SSE streaming
		const result = await service.performResearch(query, {
			onThinking: async (thought: string) => {
				// Send thinking updates to UI
				const thinkingStatus = {
					tool: "aiDeepResearch",
					query: query,
					status: "thinking",
					content: thought,
				}
				await cline.say("ai_deep_research_result", JSON.stringify(thinkingStatus))
			},
			onSearching: async (searchQuery: string) => {
				// Send search status to UI
				const searchStatus = {
					tool: "aiDeepResearch",
					query: query,
					status: "searching",
					content: searchQuery,
				}
				await cline.say("ai_deep_research_result", JSON.stringify(searchStatus))
			},
			onReading: async (url: string) => {
				// Send reading status to UI
				const readingStatus = {
					tool: "aiDeepResearch",
					query: query,
					status: "reading",
					content: url,
				}
				await cline.say("ai_deep_research_result", JSON.stringify(readingStatus))
			},
			onAnalyzing: async (content: string) => {
				// Send analyzing status to UI
				const analyzingStatus = {
					tool: "aiDeepResearch",
					query: query,
					status: "analyzing",
					content: content,
				}
				await cline.say("ai_deep_research_result", JSON.stringify(analyzingStatus))
			},
			onResult: async (finalResult: string) => {
				// Send final result to UI
				const resultStatus = {
					tool: "aiDeepResearch",
					query: query,
					status: "completed",
					content: finalResult,
				}
				await cline.say("ai_deep_research_result", JSON.stringify(resultStatus))
			},
		})

		// Push the final result to the AI
		pushToolResult(result)
	} catch (error: any) {
		await handleError(toolName, error)
	}
}
