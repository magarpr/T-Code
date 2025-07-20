import * as vscode from "vscode"
import { Task } from "../task/Task"
import { ClineSayTool } from "../../shared/ExtensionMessage"
import { formatResponse } from "../prompts/responses"
import { ToolUse, AskApproval, HandleError, PushToolResult } from "../../shared/tools"

export async function webPreviewTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
) {
	const action = block.params.action
	const url = block.params.url

	if (!action) {
		cline.consecutiveMistakeCount++
		const errorMsg = await cline.sayAndCreateMissingParamError("web_preview", "action")
		pushToolResult(formatResponse.toolError(errorMsg))
		return
	}

	if (action === "open" && !url) {
		cline.consecutiveMistakeCount++
		const errorMsg = await cline.sayAndCreateMissingParamError("web_preview", "url")
		pushToolResult(formatResponse.toolError(errorMsg))
		return
	}

	try {
		// Handle partial message
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "web_preview",
				action,
				url,
			} satisfies ClineSayTool)
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		// Ask for approval
		const completeMessage = JSON.stringify({
			tool: "web_preview",
			action,
			url,
		} satisfies ClineSayTool)

		const { response, text, images } = await cline.ask("tool", completeMessage, false)

		if (response !== "yesButtonClicked") {
			if (text) {
				await cline.say("user_feedback", text, images)
			}
			cline.didRejectTool = true
			pushToolResult(formatResponse.toolDenied())
			return
		}

		if (text) {
			await cline.say("user_feedback", text, images)
		}

		// Execute the web preview action
		if (action === "open") {
			// Open the web preview panel with the URL
			await vscode.commands.executeCommand("roo-code.openWebPreview", url)
			pushToolResult(formatResponse.toolResult(`Opened web preview for: ${url}`))
		} else if (action === "select") {
			// Get the current selected element context from the preview
			const selectedContext = await vscode.commands.executeCommand("roo-code.getSelectedElement")
			if (selectedContext) {
				pushToolResult(
					formatResponse.toolResult(`Selected element context:\n${JSON.stringify(selectedContext, null, 2)}`),
				)
			} else {
				pushToolResult(
					formatResponse.toolResult(
						"No element is currently selected. Click on an element in the preview to select it.",
					),
				)
			}
		} else {
			pushToolResult(formatResponse.toolError(`Unknown action: ${action}. Valid actions are: open, select`))
		}
	} catch (error) {
		await handleError("web preview operation", error instanceof Error ? error : new Error(String(error)))
		pushToolResult(formatResponse.toolError(error instanceof Error ? error.message : String(error)))
	}
}
