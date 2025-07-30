import * as vscode from "vscode"
import { createHash } from "crypto"

/**
 * Generates a stable workspace hash based on the VS Code workspace URI.
 * This hash remains consistent even if the project folder is moved on the local filesystem.
 *
 * @returns The workspace hash as a hex string, or null if no workspace is open
 */
export function getWorkspaceHash(): string | null {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return null
	}

	// Use the first workspace folder's URI
	const workspaceUri = workspaceFolders[0].uri.toString()

	// Create SHA1 hash of the URI string
	const hash = createHash("sha1").update(workspaceUri).digest("hex")

	return hash
}

/**
 * Generates a workspace hash from a given workspace path.
 * This is useful for migration scenarios where we need to calculate the hash
 * outside of the VS Code extension context.
 *
 * @param workspacePath The absolute path to the workspace
 * @returns The workspace hash as a hex string
 */
export function getWorkspaceHashFromPath(workspacePath: string): string {
	// Convert path to file URI format to match VS Code's workspace URI
	const workspaceUri = vscode.Uri.file(workspacePath).toString()

	// Create SHA1 hash of the URI string
	const hash = createHash("sha1").update(workspaceUri).digest("hex")

	return hash
}

/**
 * Gets a short version of the workspace hash (first 16 characters)
 * for use in directory names and collection names.
 *
 * @param workspaceHash The full workspace hash
 * @returns The shortened hash
 */
export function getShortWorkspaceHash(workspaceHash: string): string {
	return workspaceHash.substring(0, 16)
}
