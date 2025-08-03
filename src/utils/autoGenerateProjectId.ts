import * as vscode from "vscode"
import { getProjectId, generateProjectId } from "./projectId"
import { getWorkspacePath } from "./path"
import { Package } from "../shared/package"

/**
 * Automatically generates a project ID for the workspace if enabled and not already present
 * Shows a status bar notification when a project ID is generated
 */
export async function autoGenerateProjectIdIfNeeded(): Promise<void> {
	// Check if automatic generation is enabled
	const config = vscode.workspace.getConfiguration(Package.name)
	const autoGenerateEnabled = config.get<boolean>("autoGenerateProjectId", false)

	if (!autoGenerateEnabled) {
		return
	}

	// Get the workspace path
	const workspacePath = getWorkspacePath()
	if (!workspacePath) {
		return
	}

	// Check if workspace already has a project ID
	const existingId = await getProjectId(workspacePath)
	if (existingId) {
		return
	}

	// Generate a new project ID
	const newId = await generateProjectId(workspacePath)
	if (!newId) {
		return
	}

	// Show status bar notification for 15 seconds
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
	statusBarItem.text = "$(check) Project ID generated for Roo Code history"
	statusBarItem.tooltip =
		"A unique project ID has been generated to preserve your chat history when this project is moved or renamed"
	statusBarItem.show()

	// Hide the status bar item after 15 seconds
	setTimeout(() => {
		statusBarItem.dispose()
	}, 15000)
}
