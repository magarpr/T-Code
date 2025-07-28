import * as path from "path"

import {
	type ToolUse,
	type AskApproval,
	type HandleError,
	type PushToolResult,
	type RemoveClosingTag,
} from "../../shared/tools"
import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { WorkflowParser } from "../workflow/WorkflowParser"
import { WorkflowEngine } from "../workflow/WorkflowEngine"
import { fileExistsAtPath } from "../../utils/fs"
import { getWorkspacePath } from "../../utils/path"

export async function executeWorkflowTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const filePath: string | undefined = block.params.path
	const workflowYaml: string | undefined = block.params.workflow

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "executeWorkflow",
				path: removeClosingTag("path", filePath),
				workflow: removeClosingTag("workflow", workflowYaml),
			})

			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		} else {
			// Must have either path or workflow content
			if (!filePath && !workflowYaml) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("execute_workflow")
				pushToolResult(
					await cline.sayAndCreateMissingParamError(
						"execute_workflow",
						"path or workflow",
						"Either 'path' to a workflow file or 'workflow' YAML content is required",
					),
				)
				return
			}

			cline.consecutiveMistakeCount = 0

			let workflowConfig
			let displayPath = ""

			// Parse workflow configuration
			if (filePath) {
				// Load from file
				const workspacePath = getWorkspacePath()
				const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath)

				if (!(await fileExistsAtPath(absolutePath))) {
					pushToolResult(formatResponse.toolError(`Workflow file not found: ${filePath}`))
					return
				}

				displayPath = filePath
				workflowConfig = await WorkflowParser.loadFromFile(absolutePath)
			} else if (workflowYaml) {
				// Parse from YAML content
				displayPath = "inline workflow"
				workflowConfig = WorkflowParser.parseYaml(workflowYaml)
			}

			if (!workflowConfig) {
				pushToolResult(formatResponse.toolError("Failed to parse workflow configuration"))
				return
			}

			// Show workflow details for approval
			const toolMessage = JSON.stringify({
				tool: "executeWorkflow",
				workflow: workflowConfig.name,
				description: workflowConfig.description,
				agents: workflowConfig.agents.length,
				stages: workflowConfig.workflow.length,
				source: displayPath,
			})

			const didApprove = await askApproval("tool", toolMessage)

			if (!didApprove) {
				return
			}

			const provider = cline.providerRef.deref()
			if (!provider) {
				pushToolResult(formatResponse.toolError("Provider reference lost"))
				return
			}

			// Create workflow engine
			const workflowEngine = new WorkflowEngine(provider)

			// Execute workflow with parent task context
			const result = await workflowEngine.executeWorkflow(workflowConfig, {
				parentTaskId: cline.taskId,
				initialContext: {
					parentTaskId: cline.taskId,
					workingDirectory: cline.cwd,
				},
			})

			// Format result
			const resultMessage = `Workflow "${workflowConfig.name}" ${result.status}
Duration: ${Math.round(result.duration / 1000)}s
Completed stages: ${result.stages.filter((s) => s.status === "completed").length}/${result.stages.length}

Stage Results:
${result.stages
	.map((stage) => {
		const icon =
			stage.status === "completed"
				? "✅"
				: stage.status === "failed"
					? "❌"
					: stage.status === "skipped"
						? "⏭️"
						: "⏸️"
		return `${icon} ${stage.name}: ${stage.status}${stage.error ? ` - ${stage.error}` : ""}`
	})
	.join("\n")}

Final Context:
${JSON.stringify(result.context, null, 2)}`

			pushToolResult(resultMessage)

			// Clean up
			workflowEngine.dispose()
		}
	} catch (error) {
		await handleError("executing workflow", error)
		return
	}
}
