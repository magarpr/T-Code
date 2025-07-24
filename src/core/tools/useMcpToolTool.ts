import { Task } from "../task/Task"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { ClineAskUseMcpServer } from "../../shared/ExtensionMessage"
import { McpExecutionStatus } from "@roo-code/types"
import { t } from "../../i18n"

interface McpToolParams {
	server_name?: string
	tool_name?: string
	arguments?: string
}

type ValidationResult =
	| { isValid: false }
	| {
			isValid: true
			serverName: string
			toolName: string
			parsedArguments?: Record<string, unknown>
	  }

async function handlePartialRequest(
	cline: Task,
	params: McpToolParams,
	removeClosingTag: RemoveClosingTag,
): Promise<void> {
	const partialMessage = JSON.stringify({
		type: "use_mcp_tool",
		serverName: removeClosingTag("server_name", params.server_name),
		toolName: removeClosingTag("tool_name", params.tool_name),
		arguments: removeClosingTag("arguments", params.arguments),
	} satisfies ClineAskUseMcpServer)

	await cline.ask("use_mcp_server", partialMessage, true).catch(() => {})
}

async function validateParams(
	cline: Task,
	params: McpToolParams,
	pushToolResult: PushToolResult,
): Promise<ValidationResult> {
	if (!params.server_name) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("use_mcp_tool")
		pushToolResult(await cline.sayAndCreateMissingParamError("use_mcp_tool", "server_name"))
		return { isValid: false }
	}

	if (!params.tool_name) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("use_mcp_tool")
		pushToolResult(await cline.sayAndCreateMissingParamError("use_mcp_tool", "tool_name"))
		return { isValid: false }
	}

	// Validate server name format
	const serverName = params.server_name.trim()
	if (!serverName) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("use_mcp_tool")
		await cline.say("error", "Server name cannot be empty or contain only whitespace")
		pushToolResult(formatResponse.toolError("Invalid server name: cannot be empty"))
		return { isValid: false }
	}

	// Validate tool name format
	const toolName = params.tool_name.trim()
	if (!toolName) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("use_mcp_tool")
		await cline.say("error", "Tool name cannot be empty or contain only whitespace")
		pushToolResult(formatResponse.toolError("Invalid tool name: cannot be empty"))
		return { isValid: false }
	}

	let parsedArguments: Record<string, unknown> | undefined

	if (params.arguments) {
		try {
			parsedArguments = JSON.parse(params.arguments)

			// Validate that arguments is an object (not array or primitive)
			if ((parsedArguments !== null && typeof parsedArguments !== "object") || Array.isArray(parsedArguments)) {
				throw new Error("Arguments must be a JSON object, not an array or primitive value")
			}
		} catch (error) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("use_mcp_tool")

			const errorMessage = error instanceof Error ? error.message : "Invalid JSON"
			await cline.say("error", `Invalid JSON arguments for tool '${toolName}': ${errorMessage}`)

			pushToolResult(
				formatResponse.toolError(`Invalid JSON arguments for ${serverName}.${toolName}: ${errorMessage}`),
			)
			return { isValid: false }
		}
	}

	return {
		isValid: true,
		serverName,
		toolName,
		parsedArguments,
	}
}

async function sendExecutionStatus(cline: Task, status: McpExecutionStatus): Promise<void> {
	const clineProvider = await cline.providerRef.deref()
	clineProvider?.postMessageToWebview({
		type: "mcpExecutionStatus",
		text: JSON.stringify(status),
	})
}

function processToolContent(toolResult: any): string {
	if (!toolResult?.content || toolResult.content.length === 0) {
		return ""
	}

	return toolResult.content
		.map((item: any) => {
			if (item.type === "text") {
				return item.text
			}
			if (item.type === "resource") {
				const { blob: _, ...rest } = item.resource
				return JSON.stringify(rest, null, 2)
			}
			return ""
		})
		.filter(Boolean)
		.join("\n\n")
}

async function executeToolAndProcessResult(
	cline: Task,
	serverName: string,
	toolName: string,
	parsedArguments: Record<string, unknown> | undefined,
	executionId: string,
	pushToolResult: PushToolResult,
): Promise<void> {
	await cline.say("mcp_server_request_started")

	// Send started status
	await sendExecutionStatus(cline, {
		executionId,
		status: "started",
		serverName,
		toolName,
	})

	let retryCount = 0
	const maxRetries = 3
	let lastError: Error | null = null

	while (retryCount <= maxRetries) {
		try {
			const mcpHub = cline.providerRef.deref()?.getMcpHub()
			if (!mcpHub) {
				throw new Error("MCP Hub is not available. Please ensure MCP servers are properly configured.")
			}

			const toolResult = await mcpHub.callTool(serverName, toolName, parsedArguments)

			if (toolResult) {
				const outputText = processToolContent(toolResult)

				if (outputText) {
					await sendExecutionStatus(cline, {
						executionId,
						status: "output",
						response: outputText,
					})

					const toolResultPretty = (toolResult.isError ? "Error:\n" : "") + outputText

					// Send completion status
					await sendExecutionStatus(cline, {
						executionId,
						status: toolResult.isError ? "error" : "completed",
						response: toolResultPretty,
						error: toolResult.isError ? outputText : undefined,
					})

					await cline.say("mcp_server_response", toolResultPretty)
					pushToolResult(formatResponse.toolResult(toolResultPretty))
					return
				}
			}

			// If we get here, toolResult was null/undefined
			throw new Error(`No response received from MCP server '${serverName}' for tool '${toolName}'`)
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))
			retryCount++

			if (retryCount <= maxRetries) {
				const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000) // Exponential backoff with max 5s
				await cline.say(
					"error",
					`MCP tool execution failed (attempt ${retryCount}/${maxRetries}). Retrying in ${delay / 1000}s...`,
				)
				await new Promise((resolve) => setTimeout(resolve, delay))
			}
		}
	}

	// All retries failed
	const errorMessage = lastError?.message || "Unknown error occurred"
	const userFriendlyError = `Failed to execute MCP tool '${toolName}' on server '${serverName}' after ${maxRetries} attempts. ${errorMessage}`

	await sendExecutionStatus(cline, {
		executionId,
		status: "error",
		error: userFriendlyError,
	})

	await cline.say("mcp_server_response", `Error: ${userFriendlyError}`)
	pushToolResult(formatResponse.toolError(userFriendlyError))
}

export async function useMcpToolTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	try {
		const params: McpToolParams = {
			server_name: block.params.server_name,
			tool_name: block.params.tool_name,
			arguments: block.params.arguments,
		}

		// Handle partial requests
		if (block.partial) {
			await handlePartialRequest(cline, params, removeClosingTag)
			return
		}

		// Validate parameters
		const validation = await validateParams(cline, params, pushToolResult)
		if (!validation.isValid) {
			return
		}

		const { serverName, toolName, parsedArguments } = validation

		// Reset mistake count on successful validation
		cline.consecutiveMistakeCount = 0

		// Get user approval
		const completeMessage = JSON.stringify({
			type: "use_mcp_tool",
			serverName,
			toolName,
			arguments: params.arguments,
		} satisfies ClineAskUseMcpServer)

		const executionId = cline.lastMessageTs?.toString() ?? Date.now().toString()
		const didApprove = await askApproval("use_mcp_server", completeMessage)

		if (!didApprove) {
			return
		}

		// Execute the tool and process results
		await executeToolAndProcessResult(cline, serverName!, toolName!, parsedArguments, executionId, pushToolResult)
	} catch (error) {
		await handleError("executing MCP tool", error)
	}
}
