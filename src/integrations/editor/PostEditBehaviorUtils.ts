import * as vscode from "vscode"
import { arePathsEqual } from "../../utils/path"
import { DIFF_VIEW_URI_SCHEME, DIFF_VIEW_LABEL_CHANGES } from "./DiffViewProvider"

export class PostEditBehaviorUtils {
	/**
	 * Closes tabs based on the provided settings and tracked tabs
	 * @param autoCloseRooTabs - Close only tabs that were not open prior to the current task
	 * @param autoCloseAllRooTabs - Close all Roo tabs regardless of prior state
	 * @param rooOpenedTabs - Set of file paths that Roo opened during the current task
	 * @param editedFilePath - The path of the file that was just edited (optional)
	 * @returns Promise that resolves when all tabs are closed
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

		const tabsToClose: vscode.Tab[] = []

		// Iterate through all tab groups and their tabs
		for (const tabGroup of vscode.window.tabGroups.all) {
			for (const tab of tabGroup.tabs) {
				if (this.shouldCloseTab(tab, autoCloseRooTabs, autoCloseAllRooTabs, rooOpenedTabs, editedFilePath)) {
					tabsToClose.push(tab)
				}
			}
		}

		// Close all identified tabs
		if (tabsToClose.length > 0) {
			await Promise.all(
				tabsToClose.map(async (tab) => {
					try {
						await vscode.window.tabGroups.close(tab)
					} catch (err) {
						console.error(`Failed to close tab: ${err}`)
					}
				}),
			)
		}
	}

	/**
	 * Determines if a tab should be closed based on the settings and tab properties
	 */
	private static shouldCloseTab(
		tab: vscode.Tab,
		autoCloseRooTabs: boolean,
		autoCloseAllRooTabs: boolean,
		rooOpenedTabs: Set<string>,
		editedFilePath?: string,
	): boolean {
		// Don't close dirty tabs
		if (tab.isDirty) {
			return false
		}

		// Check if this is a diff view tab
		if (tab.input instanceof vscode.TabInputTextDiff) {
			// Check if it's a Roo diff view by URI scheme
			if (tab.input.original.scheme === DIFF_VIEW_URI_SCHEME) {
				return autoCloseAllRooTabs || autoCloseRooTabs
			}
			// Also check by label for compatibility
			if (tab.label.includes(DIFF_VIEW_LABEL_CHANGES)) {
				return autoCloseAllRooTabs || autoCloseRooTabs
			}
		}

		// Check if this is a regular text tab
		if (tab.input instanceof vscode.TabInputText) {
			const tabPath = tab.input.uri.fsPath

			// Skip the currently edited file to avoid closing it immediately
			if (editedFilePath && arePathsEqual(tabPath, editedFilePath)) {
				return false
			}

			// If autoCloseAllRooTabs is enabled, close any tab that was tracked by Roo
			if (autoCloseAllRooTabs) {
				// Check if this tab's path exists in our tracked set
				for (const trackedPath of rooOpenedTabs) {
					if (arePathsEqual(tabPath, trackedPath)) {
						return true
					}
				}
			}

			// If only autoCloseRooTabs is enabled, close tabs that Roo opened (not pre-existing)
			if (autoCloseRooTabs && !autoCloseAllRooTabs) {
				// This requires the tab to be in our tracked set
				for (const trackedPath of rooOpenedTabs) {
					if (arePathsEqual(tabPath, trackedPath)) {
						return true
					}
				}
			}
		}

		return false
	}

	/**
	 * Restores focus to the appropriate editor after closing tabs
	 * @param preEditActiveEditor - The editor that was active before the edit operation
	 * @param editedFilePath - The path of the file that was edited
	 */
	static async restoreFocus(
		preEditActiveEditor: vscode.TextEditor | undefined,
		editedFilePath?: string,
	): Promise<void> {
		// Try to restore focus to the pre-edit active editor if it still exists
		if (preEditActiveEditor) {
			const stillExists = vscode.window.visibleTextEditors.some(
				(editor) => editor.document.uri.toString() === preEditActiveEditor.document.uri.toString(),
			)

			if (stillExists) {
				await vscode.window.showTextDocument(preEditActiveEditor.document, {
					preserveFocus: false,
					preview: false,
				})
				return
			}
		}

		// Otherwise, try to focus on the edited file
		if (editedFilePath) {
			try {
				await vscode.window.showTextDocument(vscode.Uri.file(editedFilePath), {
					preserveFocus: false,
					preview: false,
				})
			} catch (err) {
				// File might not exist or be accessible
				console.debug(`Could not restore focus to edited file: ${err}`)
			}
		}
	}
}
