import * as vscode from "vscode"
import * as path from "path"
import { getProjectId, generateProjectId, getWorkspaceStorageKey } from "./projectId"
import { getWorkspacePath } from "./path"
import { Package } from "../shared/package"
import { ClineProvider } from "../core/webview/ClineProvider"

/**
 * Detects if a project with an existing project ID has been moved to a new location
 * and handles the user interaction to determine how to proceed
 */
export async function detectAndHandleMovedProject(provider: ClineProvider): Promise<void> {
	const workspacePath = getWorkspacePath()
	if (!workspacePath) {
		return
	}

	// Check if this workspace has a project ID
	const projectId = await getProjectId(workspacePath)
	if (!projectId) {
		return
	}

	// Check if we have any task history for this project ID
	const taskHistory = provider.getValue("taskHistory") ?? []
	const projectTasks = taskHistory.filter((item: any) => item.workspace === projectId)

	if (projectTasks.length === 0) {
		// No existing history for this project ID
		// But we should check if there are tasks with different workspace paths
		// that might indicate this is a copied/moved project

		// Look for any tasks from other workspaces (not the current one)
		const otherWorkspaceTasks = taskHistory.filter(
			(item: any) =>
				item.workspace !== workspacePath && item.workspace !== projectId && !item.workspace.includes(projectId), // Ensure it's not a path containing the project ID
		)

		if (otherWorkspaceTasks.length === 0) {
			// No tasks from other workspaces, this is likely a new project
			return
		}

		// Check if we should ask about this being a moved project
		// Only ask if there are a significant number of tasks from another workspace
		const workspaceCounts = new Map<string, number>()
		otherWorkspaceTasks.forEach((task: any) => {
			const count = workspaceCounts.get(task.workspace) || 0
			workspaceCounts.set(task.workspace, count + 1)
		})

		// Find the workspace with the most tasks
		let maxCount = 0
		let likelyPreviousWorkspace = ""
		workspaceCounts.forEach((count, workspace) => {
			if (count > maxCount) {
				maxCount = count
				likelyPreviousWorkspace = workspace
			}
		})

		// Only prompt if there are at least 3 tasks from another workspace
		if (maxCount < 3) {
			return
		}

		// Show dialog asking if this is the same project moved from another location
		const options = ["Yes, link the history", "No, this is a new project"]

		const result = await vscode.window.showInformationMessage(
			`Found ${maxCount} chat sessions from another location. Is this the same project that was moved here?`,
			{ modal: true },
			...options,
		)

		if (result === options[0]) {
			// Link the history by migrating tasks from the old workspace
			const migratedCount = await provider.migrateTasksToProjectId(likelyPreviousWorkspace, projectId)
			if (migratedCount > 0) {
				vscode.window.showInformationMessage(
					`Successfully linked ${migratedCount} previous chat sessions to this project.`,
				)
			}
		}

		return
	}

	// We have tasks with this project ID already
	// This could mean:
	// 1. The project is in its original location
	// 2. The project was moved and we're opening it again
	// 3. This is a copy/fork of the original project

	// To detect if this is a copy/fork, we need to check if there's a .git directory
	// and if the git remote or path is different from what we might have stored
	// For now, we'll use a simpler heuristic: if the workspace path is different
	// from all the task workspace paths, this might be a copy

	// Get unique workspace paths from tasks (excluding the project ID itself)
	const workspacePaths = new Set<string>()
	taskHistory.forEach((task: any) => {
		if (task.workspace && task.workspace !== projectId && !task.workspace.includes(projectId)) {
			workspacePaths.add(task.workspace)
		}
	})

	// If we have tasks but none of them have workspace paths (all migrated to project ID)
	// then we can't determine if this is a moved project
	if (workspacePaths.size === 0) {
		return
	}

	// Check if the current workspace path matches any of the stored paths
	const isKnownLocation = Array.from(workspacePaths).some(
		(path) => path === workspacePath || workspacePath.includes(path) || path.includes(workspacePath),
	)

	if (!isKnownLocation && workspacePaths.size > 0) {
		// This workspace path has never been seen before for this project ID
		// It might be a copy/fork
		const options = ["This is the same project (moved/renamed)", "This is a new project (copy/fork)"]

		const result = await vscode.window.showInformationMessage(
			`This project has a Roo Code project ID with ${projectTasks.length} existing chat sessions from a different location. Is this the same project that was moved/renamed, or a new copy?`,
			{ modal: true },
			...options,
		)

		if (!result) {
			// User cancelled, do nothing
			return
		}

		if (result === options[0]) {
			// Same project - keep the existing ID and history
			vscode.window.showInformationMessage(
				`Keeping existing project history. Your ${projectTasks.length} previous chat sessions are available.`,
			)
		} else {
			// New project - generate a new ID
			const newProjectId = await generateNewProjectId(workspacePath)
			if (newProjectId) {
				vscode.window.showInformationMessage(
					"Generated new project ID. This project now has its own separate chat history.",
				)
			}
		}
	}

	return
}

/**
 * Generates a new project ID by first removing the existing one
 */
async function generateNewProjectId(workspacePath: string): Promise<string | null> {
	try {
		// Remove the existing .rooprojectid file
		const fs = await import("fs/promises")
		const projectIdPath = path.join(workspacePath, ".rooprojectid")
		await fs.unlink(projectIdPath)

		// Generate a new ID
		const newId = await generateProjectId(workspacePath)
		return newId
	} catch (error) {
		console.error("Failed to generate new project ID:", error)
		vscode.window.showErrorMessage("Failed to generate new project ID")
		return null
	}
}
