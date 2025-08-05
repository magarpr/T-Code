import * as path from "path"
import { getProjectRooDirectoryForCwd as getProjectRooDirectoryBase } from "./index"

// This will be set by the extension during activation
let vscodeUtils: { findWorkspaceWithRoo: () => any } | undefined

/**
 * Sets the vscode utilities for use in the wrapper
 * This should be called during extension activation
 */
export function setVscodeUtils(utils: { findWorkspaceWithRoo: () => any }) {
	vscodeUtils = utils
}

/**
 * Gets the project-local .roo directory path for a given cwd
 * This wrapper checks for vscode-specific functionality when available
 */
export function getProjectRooDirectoryForCwd(cwd: string): string {
	// Check if .roo is one of the workspace folders in a multi-root workspace
	if (vscodeUtils?.findWorkspaceWithRoo) {
		const workspaceWithRoo = vscodeUtils.findWorkspaceWithRoo()
		if (workspaceWithRoo) {
			return workspaceWithRoo.uri.fsPath
		}
	}

	// Fall back to base implementation
	return getProjectRooDirectoryBase(cwd)
}
