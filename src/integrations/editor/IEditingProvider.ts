import { ClineSayTool } from "../../shared/ExtensionMessage"
import { Task } from "../../core/task/Task"

/**
 * Interface for file editing providers.
 * This abstraction allows switching between different editing strategies:
 * - DiffViewProvider: Shows visual diff in editor before applying changes
 * - FileWriter: Writes directly to file system without visual feedback
 */
export interface IEditingProvider {
	/**
	 * Whether the provider is currently editing a file
	 */
	isEditing: boolean

	/**
	 * The type of edit operation (create or modify)
	 */
	editType?: "create" | "modify"

	/**
	 * The original content of the file being edited
	 */
	originalContent?: string

	/**
	 * Open a file for editing
	 * @param relPath Relative path to the file
	 */
	open(relPath: string): Promise<void>

	/**
	 * Update the file content
	 * @param content The new content
	 * @param isFinal Whether this is the final update
	 */
	update(content: string, isFinal: boolean): Promise<void>

	/**
	 * Save the changes to the file
	 * @param diagnosticsEnabled Whether to check for diagnostics after saving
	 * @param writeDelayMs Delay in milliseconds before writing
	 * @returns Object containing diagnostic messages, user edits, and final content
	 */
	saveChanges(
		diagnosticsEnabled?: boolean,
		writeDelayMs?: number,
	): Promise<{
		newProblemsMessage: string | undefined
		userEdits: string | undefined
		finalContent: string | undefined
	}>

	/**
	 * Push the result of a write operation to the task
	 * @param task The current task
	 * @param cwd Current working directory
	 * @param isNewFile Whether this is a new file
	 * @returns Formatted XML response message
	 */
	pushToolWriteResult(task: Task, cwd: string, isNewFile: boolean): Promise<string>

	/**
	 * Revert any pending changes
	 */
	revertChanges(): Promise<void>

	/**
	 * Reset the provider state
	 */
	reset(): Promise<void>

	/**
	 * Scroll to the first difference (only applicable for diff-based providers)
	 */
	scrollToFirstDiff?(): void
}
