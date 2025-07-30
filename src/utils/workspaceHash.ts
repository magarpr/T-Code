import * as vscode from "vscode"
import * as crypto from "crypto"

/**
 * Generates a stable workspace hash based on the workspace URI
 * This hash is the same one VS Code uses to manage its own workspace storage
 * @returns The workspace hash or null if no workspace is available
 */
export function getWorkspaceHash(): string | null {
	const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri.toString()
	if (!folderUri) return null
	return crypto.createHash("sha1").update(folderUri).digest("hex")
}

/**
 * Generates a workspace storage path using the stable workspace hash
 * @returns The hash-based storage path or null if no workspace is available
 */
export function getWorkspaceStoragePath(): string | null {
	const hash = getWorkspaceHash()
	if (!hash) return null
	return hash
}

/**
 * Checks if two workspace hashes represent the same workspace
 * @param hash1 First workspace hash
 * @param hash2 Second workspace hash
 * @returns True if the hashes match (both null counts as a match)
 */
export function areWorkspaceHashesEqual(hash1: string | null, hash2: string | null): boolean {
	if (hash1 === null && hash2 === null) return true
	if (hash1 === null || hash2 === null) return false
	return hash1 === hash2
}
