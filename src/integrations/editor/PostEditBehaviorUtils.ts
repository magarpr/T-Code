import * as vscode from "vscode"
import { arePathsEqual } from "../../utils/path"
import { DIFF_VIEW_URI_SCHEME } from "./DiffViewProvider"

export class PostEditBehaviorUtils {
	/**
	 * Closes Roo-related tabs based on the provided settings and tracked tabs
	 * @param autoCloseRooTabs - Close only tabs opened during the current task
	 * @param autoCloseAllRooTabs - Close all Roo tabs regardless of when they were opened
	 * @param rooOpenedTabs - Set of file paths that were opened by Roo during the current task
	 * @param editedFilePath - The path of the file that was just edited (to restore focus)
	 * @returns Promise<void>
	 */
	static async closeRooTabs(
		autoCloseRooTabs: boolean,
		autoCloseAllRooTabs: boolean,
		rooOpenedTabs: Set<string>,
		editedFilePath?: string,
	): Promise<void> {
		if (!autoCloseRooTabs && !autoCloseAllRooTabs) {
			return
		}

		// Get all tabs across all tab groups
		const allTabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs)

		// Filter tabs to close based on settings
		const tabsToClose = allTabs.filter((tab) => {
			// Check if it's a diff view tab
			if (tab.input instanceof vscode.TabInputTextDiff && tab.input.original.scheme === DIFF_VIEW_URI_SCHEME) {
				return true
			}

			// Check if it's a regular text tab
			if (tab.input instanceof vscode.TabInputText) {
				const tabPath = tab.input.uri.fsPath

				// Don't close the file that was just edited
				if (editedFilePath && arePathsEqual(tabPath, editedFilePath)) {
					return false
				}

				if (autoCloseAllRooTabs) {
					// Close all Roo tabs - for now, we consider all tabs that were tracked
					// In a more sophisticated implementation, we might check for Roo-specific markers
					return rooOpenedTabs.has(tabPath)
				} else if (autoCloseRooTabs) {
					// Close only tabs opened during the current task
					return rooOpenedTabs.has(tabPath)
				}
			}

			return false
		})

		// Close the tabs
		const closePromises = tabsToClose.map((tab) => {
			if (!tab.isDirty) {
				return vscode.window.tabGroups.close(tab).then(
					() => undefined,
					(err: any) => {
						console.error(`Failed to close tab ${tab.label}:`, err)
					},
				)
			}
			return Promise.resolve()
		})

		await Promise.all(closePromises)

		// Restore focus to the edited file if provided
		if (editedFilePath) {
			try {
				await vscode.window.showTextDocument(vscode.Uri.file(editedFilePath), {
					preview: false,
					preserveFocus: false,
				})
			} catch (err) {
				console.error(`Failed to restore focus to ${editedFilePath}:`, err)
			}
		}
	}

	/**
	 * Determines which tabs should be closed based on the filter criteria
	 * @param tabs - Array of tabs to filter
	 * @param filter - Filter criteria (all Roo tabs or only current task tabs)
	 * @param rooOpenedTabs - Set of file paths opened by Roo
	 * @returns Array of tabs that match the filter criteria
	 */
	static filterTabsToClose(
		tabs: readonly vscode.Tab[],
		filter: "all" | "current",
		rooOpenedTabs: Set<string>,
	): vscode.Tab[] {
		return tabs.filter((tab) => {
			// Always close diff view tabs
			if (tab.input instanceof vscode.TabInputTextDiff && tab.input.original.scheme === DIFF_VIEW_URI_SCHEME) {
				return true
			}

			// For text tabs, apply the filter
			if (tab.input instanceof vscode.TabInputText) {
				const tabPath = tab.input.uri.fsPath

				if (filter === "all") {
					// In a real implementation, we might have additional checks
					// to identify Roo-specific tabs beyond just the tracked set
					return true
				} else if (filter === "current") {
					return rooOpenedTabs.has(tabPath)
				}
			}

			return false
		})
	}

	/**
	 * Checks if a tab is a Roo-related tab
	 * @param tab - The tab to check
	 * @returns true if the tab is Roo-related
	 */
	static isRooTab(tab: vscode.Tab): boolean {
		// Check if it's a diff view tab
		if (tab.input instanceof vscode.TabInputTextDiff && tab.input.original.scheme === DIFF_VIEW_URI_SCHEME) {
			return true
		}

		// Additional checks could be added here to identify other Roo-specific tabs
		// For example, checking for specific URI schemes, file patterns, etc.

		return false
	}
}
