import * as vscode from "vscode"
import * as path from "path"

import {
	type WorkflowConfig,
	type WorkflowExecutionOptions,
	type WorkflowExecutionResult,
	type WorkflowEvent,
} from "@roo-code/types"

import { ClineProvider } from "../webview/ClineProvider"
import { WorkflowParser } from "./WorkflowParser"
import { WorkflowExecutor } from "./WorkflowExecutor"
import { WorkflowStateManager } from "./WorkflowStateManager"
import { logger } from "../../utils/logging"
import { getWorkspacePath } from "../../utils/path"

/**
 * Main workflow engine that integrates all workflow components
 */
export class WorkflowEngine {
	private executor: WorkflowExecutor
	private stateManager: WorkflowStateManager
	private provider: ClineProvider
	private globalStoragePath: string
	private disposables: vscode.Disposable[] = []

	constructor(provider: ClineProvider) {
		this.provider = provider
		this.globalStoragePath = provider.context.globalStorageUri.fsPath

		// Initialize components
		this.stateManager = new WorkflowStateManager(this.globalStoragePath)
		this.executor = new WorkflowExecutor(provider, this.globalStoragePath)

		// Set up event forwarding
		this.executor.on("workflow:event", (event: WorkflowEvent) => {
			this.handleWorkflowEvent(event)
		})

		// Register commands
		this.registerCommands()

		logger.info("WorkflowEngine initialized")
	}

	/**
	 * Register VS Code commands for workflow management
	 */
	private registerCommands(): void {
		// Command to execute workflow from file
		this.disposables.push(
			vscode.commands.registerCommand("roo-cline.workflow.executeFromFile", async () => {
				await this.executeWorkflowFromFile()
			}),
		)

		// Command to create sample workflow
		this.disposables.push(
			vscode.commands.registerCommand("roo-cline.workflow.createSample", async () => {
				await this.createSampleWorkflow()
			}),
		)

		// Command to list workflows
		this.disposables.push(
			vscode.commands.registerCommand("roo-cline.workflow.list", async () => {
				await this.showWorkflowList()
			}),
		)

		// Command to stop workflow
		this.disposables.push(
			vscode.commands.registerCommand("roo-cline.workflow.stop", async (workflowId?: string) => {
				await this.stopWorkflow(workflowId)
			}),
		)
	}

	/**
	 * Execute a workflow from a YAML file
	 */
	public async executeWorkflowFromFile(filePath?: string): Promise<WorkflowExecutionResult | undefined> {
		try {
			// If no file path provided, prompt user to select
			if (!filePath) {
				const fileUri = await vscode.window.showOpenDialog({
					canSelectFiles: true,
					canSelectFolders: false,
					canSelectMany: false,
					filters: {
						"Workflow Files": ["yaml", "yml"],
						"All Files": ["*"],
					},
					title: "Select Workflow File",
				})

				if (!fileUri || fileUri.length === 0) {
					return undefined
				}

				filePath = fileUri[0].fsPath
			}

			// Parse workflow configuration
			const config = await WorkflowParser.loadFromFile(filePath)

			// Show workflow info and confirm execution
			const proceed = await vscode.window.showInformationMessage(
				`Execute workflow "${config.name}"?`,
				{ modal: true, detail: config.description },
				"Execute",
				"Cancel",
			)

			if (proceed !== "Execute") {
				return undefined
			}

			// Execute workflow
			return await this.executeWorkflow(config)
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			vscode.window.showErrorMessage(`Failed to execute workflow: ${errorMessage}`)
			logger.error("Failed to execute workflow from file", { filePath, error: errorMessage })
			return undefined
		}
	}

	/**
	 * Execute a workflow configuration
	 */
	public async executeWorkflow(
		config: WorkflowConfig,
		options: WorkflowExecutionOptions = {},
	): Promise<WorkflowExecutionResult> {
		try {
			// Show progress notification
			return await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Executing workflow: ${config.name}`,
					cancellable: true,
				},
				async (progress, token) => {
					// Handle cancellation
					token.onCancellationRequested(() => {
						if (options.workflowId) {
							this.executor.stopWorkflow(options.workflowId)
						}
					})

					// Execute workflow
					const result = await this.executor.executeWorkflow(config, options)

					// Show completion message
					const statusIcon = result.status === "completed" ? "✅" : "❌"
					vscode.window.showInformationMessage(
						`${statusIcon} Workflow "${config.name}" ${result.status} in ${Math.round(result.duration / 1000)}s`,
					)

					return result
				},
			)
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			vscode.window.showErrorMessage(`Workflow execution failed: ${errorMessage}`)
			throw error
		}
	}

	/**
	 * Create and save a sample workflow file
	 */
	private async createSampleWorkflow(): Promise<void> {
		try {
			// Get workspace folder
			const workspacePath = getWorkspacePath()
			if (!workspacePath) {
				vscode.window.showErrorMessage("No workspace folder open")
				return
			}

			// Create sample workflow
			const sampleWorkflow = WorkflowParser.createSampleWorkflow()

			// Prompt for file name
			const fileName = await vscode.window.showInputBox({
				prompt: "Enter workflow file name",
				value: "sample-workflow.yaml",
				validateInput: (value) => {
					if (!value.endsWith(".yaml") && !value.endsWith(".yml")) {
						return "File must have .yaml or .yml extension"
					}
					return undefined
				},
			})

			if (!fileName) {
				return
			}

			// Save workflow file
			const filePath = path.join(workspacePath, fileName)
			await WorkflowParser.saveToFile(sampleWorkflow, filePath)

			// Open the file
			const document = await vscode.workspace.openTextDocument(filePath)
			await vscode.window.showTextDocument(document)

			vscode.window.showInformationMessage(`Sample workflow created: ${fileName}`)
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			vscode.window.showErrorMessage(`Failed to create sample workflow: ${errorMessage}`)
		}
	}

	/**
	 * Show list of workflows
	 */
	private async showWorkflowList(): Promise<void> {
		try {
			// Get all workflows
			const workflowIds = await this.stateManager.listWorkflows()
			const runningIds = this.executor.getRunningWorkflows()

			if (workflowIds.length === 0) {
				vscode.window.showInformationMessage("No workflows found")
				return
			}

			// Create quick pick items
			const items = await Promise.all(
				workflowIds.map(async (id) => {
					const state = await this.stateManager.loadState(id)
					const isRunning = runningIds.includes(id)
					const statusIcon = isRunning ? "🔄" : state?.status === "completed" ? "✅" : "❌"

					return {
						label: `${statusIcon} ${state?.name || id}`,
						description: `Status: ${state?.status || "unknown"}`,
						detail: state ? `Started: ${new Date(state.startedAt).toLocaleString()}` : undefined,
						id,
						state,
					}
				}),
			)

			// Show quick pick
			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: "Select a workflow to view details",
			})

			if (selected && selected.state) {
				// Show workflow details
				const details = this.formatWorkflowDetails(selected.state)
				const action = await vscode.window.showInformationMessage(
					`Workflow: ${selected.state.name}`,
					{ modal: true, detail: details },
					selected.state.status === "in_progress" ? "Stop" : "Delete",
					"Close",
				)

				if (action === "Stop") {
					await this.stopWorkflow(selected.id)
				} else if (action === "Delete") {
					await this.stateManager.deleteState(selected.id)
					vscode.window.showInformationMessage("Workflow deleted")
				}
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			vscode.window.showErrorMessage(`Failed to list workflows: ${errorMessage}`)
		}
	}

	/**
	 * Stop a running workflow
	 */
	private async stopWorkflow(workflowId?: string): Promise<void> {
		try {
			// If no ID provided, show list of running workflows
			if (!workflowId) {
				const runningIds = this.executor.getRunningWorkflows()

				if (runningIds.length === 0) {
					vscode.window.showInformationMessage("No running workflows")
					return
				}

				const items = runningIds.map((id) => {
					const state = this.executor.getWorkflowState(id)
					return {
						label: state?.name || id,
						description: `Started: ${state ? new Date(state.startedAt).toLocaleString() : "unknown"}`,
						id,
					}
				})

				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: "Select workflow to stop",
				})

				if (!selected) {
					return
				}

				workflowId = selected.id
			}

			// Confirm stop
			const confirm = await vscode.window.showWarningMessage(
				`Stop workflow "${workflowId}"?`,
				{ modal: true },
				"Stop",
				"Cancel",
			)

			if (confirm === "Stop") {
				await this.executor.stopWorkflow(workflowId)
				vscode.window.showInformationMessage("Workflow stopped")
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			vscode.window.showErrorMessage(`Failed to stop workflow: ${errorMessage}`)
		}
	}

	/**
	 * Format workflow details for display
	 */
	private formatWorkflowDetails(state: any): string {
		const lines = [
			`ID: ${state.id}`,
			`Status: ${state.status}`,
			`Started: ${new Date(state.startedAt).toLocaleString()}`,
		]

		if (state.completedAt) {
			lines.push(`Completed: ${new Date(state.completedAt).toLocaleString()}`)
			const duration = (state.completedAt - state.startedAt) / 1000
			lines.push(`Duration: ${Math.round(duration)}s`)
		}

		lines.push("")
		lines.push("Stages:")

		for (const [name, stage] of Object.entries(state.stages as Record<string, any>)) {
			const statusIcon =
				stage.status === "completed"
					? "✅"
					: stage.status === "failed"
						? "❌"
						: stage.status === "in_progress"
							? "🔄"
							: "⏸️"

			lines.push(`  ${statusIcon} ${name} (${stage.agent})`)

			if (stage.error) {
				lines.push(`     Error: ${stage.error}`)
			}
		}

		if (state.completedStages.length > 0) {
			lines.push("")
			lines.push(`Completed: ${state.completedStages.length} stages`)
		}

		if (state.failedStages.length > 0) {
			lines.push(`Failed: ${state.failedStages.length} stages`)
		}

		return lines.join("\n")
	}

	/**
	 * Handle workflow events
	 */
	private handleWorkflowEvent(event: WorkflowEvent): void {
		// Log event
		logger.info("Workflow event", {
			type: event.type,
			workflowId: event.workflowId,
			timestamp: event.timestamp,
			data: event.data,
		})

		// Show notifications for important events
		switch (event.type) {
			case "workflow:started":
				vscode.window.showInformationMessage(`Workflow started: ${event.data.name}`)
				break

			case "workflow:completed":
				vscode.window.showInformationMessage(
					`✅ Workflow completed in ${Math.round((Number(event.data.duration) || 0) / 1000)}s`,
				)
				break

			case "workflow:failed":
				vscode.window.showErrorMessage("❌ Workflow failed")
				break

			case "stage:failed":
				vscode.window.showWarningMessage(`Stage failed: ${event.data.stageName} - ${event.data.error}`)
				break
		}

		// Forward event to webview if needed
		// Note: We'll need to add this message type to the webview message types
		// For now, we'll just log it
		logger.debug("Workflow event for webview", { event })
	}

	/**
	 * Clean up old workflows
	 */
	public async cleanupOldWorkflows(daysToKeep: number = 30): Promise<void> {
		try {
			const count = await this.stateManager.cleanupOldWorkflows(daysToKeep)
			logger.info(`Cleaned up ${count} old workflows`)
		} catch (error) {
			logger.error("Failed to cleanup old workflows", {
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	/**
	 * Dispose of resources
	 */
	public dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose()
		}

		// Stop all running workflows
		const runningIds = this.executor.getRunningWorkflows()
		for (const id of runningIds) {
			this.executor.stopWorkflow(id).catch((error) => {
				logger.error("Failed to stop workflow during disposal", { id, error })
			})
		}
	}
}
