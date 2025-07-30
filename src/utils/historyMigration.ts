import * as vscode from "vscode"
import type { HistoryItem } from "@roo-code/types"
import { getWorkspaceHash, areWorkspaceHashesEqual } from "./workspaceHash"
import { arePathsEqual } from "./path"

/**
 * Migrates existing path-based history items to include workspace hashes
 * @param taskHistory Array of history items to migrate
 * @returns Migrated history items with workspace hashes added
 */
export function migrateHistoryToWorkspaceHash(taskHistory: HistoryItem[]): HistoryItem[] {
	const currentWorkspaceHash = getWorkspaceHash()
	const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

	return taskHistory.map((item) => {
		// Skip items that already have a workspace hash
		if (item.workspaceHash) {
			return item
		}

		// Try to determine the workspace hash for this item
		let workspaceHash: string | undefined

		// If the item's workspace path matches the current workspace path,
		// use the current workspace hash
		if (currentWorkspacePath && item.workspace && arePathsEqual(item.workspace, currentWorkspacePath)) {
			workspaceHash = currentWorkspaceHash || undefined
		}

		// Return the item with the workspace hash added (if determined)
		return {
			...item,
			workspaceHash,
		}
	})
}

/**
 * Checks if migration is needed for the given task history
 * @param taskHistory Array of history items to check
 * @returns True if migration is needed, false otherwise
 */
export function isMigrationNeeded(taskHistory: HistoryItem[]): boolean {
	// Migration is needed if there are items without workspace hashes
	return taskHistory.some((item) => !item.workspaceHash && item.workspace)
}

/**
 * Finds orphaned history items that don't match the current workspace
 * @param taskHistory Array of history items to check
 * @returns Array of orphaned history items
 */
export function findOrphanedHistory(taskHistory: HistoryItem[]): HistoryItem[] {
	const currentWorkspaceHash = getWorkspaceHash()
	const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

	return taskHistory.filter((item) => {
		// If item has a workspace hash, check if it matches current workspace
		if (item.workspaceHash) {
			return !areWorkspaceHashesEqual(item.workspaceHash, currentWorkspaceHash)
		}

		// If item only has workspace path, check if it matches current workspace path
		if (item.workspace && currentWorkspacePath) {
			return !arePathsEqual(item.workspace, currentWorkspacePath)
		}

		// If no workspace info, consider it orphaned
		return true
	})
}

/**
 * Updates a history item's workspace information for re-linking
 * @param item History item to update
 * @param newWorkspacePath New workspace path
 * @param newWorkspaceHash New workspace hash
 * @returns Updated history item
 */
export function relinkHistoryItem(
	item: HistoryItem,
	newWorkspacePath: string,
	newWorkspaceHash: string | null,
): HistoryItem {
	return {
		...item,
		workspace: newWorkspacePath,
		workspaceHash: newWorkspaceHash || undefined,
	}
}
