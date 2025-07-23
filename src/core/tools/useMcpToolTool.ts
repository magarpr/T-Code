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

	let parsedArguments: Record<string, unknown> | undefined

	if (params.arguments) {
		// Check if arguments appear to be truncated (common around 4000 characters)
		const argLength = params.arguments.length
		const TRUNCATION_WARNING_THRESHOLD = 3800 // Warn when close to 4000 chars
		const LIKELY_TRUNCATED_THRESHOLD = 3900 // Very likely truncated if over this

		// Check for signs of truncation
		const lastChar = params.arguments[params.arguments.length - 1]
		const endsWithIncompleteJSON =
			argLength > LIKELY_TRUNCATED_THRESHOLD && lastChar !== "}" && lastChar !== "]" && lastChar !== '"'

		if (endsWithIncompleteJSON || argLength > TRUNCATION_WARNING_THRESHOLD) {
			// Try to parse anyway to see if it's valid JSON
			try {
				parsedArguments = JSON.parse(params.arguments)

				// Valid JSON but very large - warn the user
				if (argLength > TRUNCATION_WARNING_THRESHOLD) {
					await cline.say(
						"error",
						`⚠️ Warning: The MCP tool arguments are very large (${argLength} characters). ` +
							`Some language models may truncate tool calls around 4000 characters. ` +
							`Consider breaking this into smaller operations if the tool fails.`,
					)
				}
			} catch (error) {
				// Invalid JSON and likely truncated
				cline.consecutiveMistakeCount++
				cline.recordToolError("use_mcp_tool")

				const errorMessage =
					argLength > LIKELY_TRUNCATED_THRESHOLD
						? `The MCP tool arguments appear to be truncated (${argLength} characters). ` +
							`The JSON is incomplete and cannot be parsed. ` +
							`This is a known limitation where some language models truncate tool calls around 4000 characters. ` +
							`Please try breaking this operation into smaller chunks or reducing the data size.`
						: t("mcp:errors.invalidJsonArgument", { toolName: params.tool_name })

				await cline.say("error", errorMessage)

				pushToolResult(
					formatResponse.toolError(
						argLength > LIKELY_TRUNCATED_THRESHOLD
							? `Tool arguments were truncated by the language model. The JSON is incomplete (${argLength} characters). Please use smaller data chunks.`
							: formatResponse.invalidMcpToolArgumentError(params.server_name, params.tool_name),
					),
				)
				return { isValid: false }
			}
		} else {
			// Normal JSON parsing for smaller arguments
			try {
				parsedArguments = JSON.parse(params.arguments)
			} catch (error) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("use_mcp_tool")
				await cline.say("error", t("mcp:errors.invalidJsonArgument", { toolName: params.tool_name }))

				pushToolResult(
					formatResponse.toolError(
						formatResponse.invalidMcpToolArgumentError(params.server_name, params.tool_name),
					),
				)
				return { isValid: false }
			}
		}
	}

	return {
		isValid: true,
		serverName: params.server_name,
		toolName: params.tool_name,
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

	const toolResult = await cline.providerRef.deref()?.getMcpHub()?.callTool(serverName, toolName, parsedArguments)

	let toolResultPretty = "(No response)"

	if (toolResult) {
		const outputText = processToolContent(toolResult)

		if (outputText) {
			await sendExecutionStatus(cline, {
				executionId,
				status: "output",
				response: outputText,
			})

			toolResultPretty = (toolResult.isError ? "Error:\n" : "") + outputText
		}

		// Send completion status
		await sendExecutionStatus(cline, {
			executionId,
			status: toolResult.isError ? "error" : "completed",
			response: toolResultPretty,
			error: toolResult.isError ? "Error executing MCP tool" : undefined,
		})
	} else {
		// Send error status if no result
		await sendExecutionStatus(cline, {
			executionId,
			status: "error",
			error: "No response from MCP server",
		})
	}

	await cline.say("mcp_server_response", toolResultPretty)
	pushToolResult(formatResponse.toolResult(toolResultPretty))
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
