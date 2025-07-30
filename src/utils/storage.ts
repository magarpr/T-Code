import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"

import { Package } from "../shared/package"
import { t } from "../i18n"
import { getWorkspaceHash, getShortWorkspaceHash } from "./workspaceHash"
import { isMigrationNeeded, migrateTasksToWorkspaceStructure } from "./historyMigration"

/**
 * Gets the base storage path for conversations
 * If a custom path is configured, uses that path
 * Otherwise uses the default VSCode extension global storage path
 */
export async function getStorageBasePath(defaultPath: string): Promise<string> {
	// Get user-configured custom storage path
	let customStoragePath = ""

	try {
		// This is the line causing the error in tests
		const config = vscode.workspace.getConfiguration(Package.name)
		customStoragePath = config.get<string>("customStoragePath", "")
	} catch (error) {
		console.warn("Could not access VSCode configuration - using default path")
		return defaultPath
	}

	// If no custom path is set, use default path
	if (!customStoragePath) {
		return defaultPath
	}

	try {
		// Ensure custom path exists
		await fs.mkdir(customStoragePath, { recursive: true })

		// Test if path is writable
		const testFile = path.join(customStoragePath, ".write_test")
		await fs.writeFile(testFile, "test")
		await fs.rm(testFile)

		return customStoragePath
	} catch (error) {
		// If path is unusable, report error and fall back to default path
		console.error(`Custom storage path is unusable: ${error instanceof Error ? error.message : String(error)}`)
		if (vscode.window) {
			vscode.window.showErrorMessage(t("common:errors.custom_storage_path_unusable", { path: customStoragePath }))
		}
		return defaultPath
	}
}

/**
 * Gets the storage directory path for a task using the new workspace-based structure
 */
export async function getTaskDirectoryPath(globalStoragePath: string, taskId: string): Promise<string> {
	const basePath = await getStorageBasePath(globalStoragePath)

	// Check if migration is needed and perform it
	if (await isMigrationNeeded(basePath)) {
		console.log("Migrating tasks to workspace-based structure...")
		try {
			await migrateTasksToWorkspaceStructure(basePath, console.log)
		} catch (error) {
			console.error("Migration failed, falling back to old structure:", error)
			// Fall back to old structure if migration fails
			const taskDir = path.join(basePath, "tasks", taskId)
			await fs.mkdir(taskDir, { recursive: true })
			return taskDir
		}
	}

	// Use workspace-based structure
	const workspaceHash = getWorkspaceHash()
	if (workspaceHash) {
		const shortHash = getShortWorkspaceHash(workspaceHash)
		const taskDir = path.join(basePath, "workspaces", shortHash, "tasks", taskId)
		await fs.mkdir(taskDir, { recursive: true })
		return taskDir
	} else {
		// Fallback to old structure if no workspace is available
		console.warn("No workspace available, using legacy task storage structure")
		const taskDir = path.join(basePath, "tasks", taskId)
		await fs.mkdir(taskDir, { recursive: true })
		return taskDir
	}
}

/**
 * Gets the storage directory path for a task using the legacy structure
 * This is kept for backward compatibility and testing
 */
export async function getLegacyTaskDirectoryPath(globalStoragePath: string, taskId: string): Promise<string> {
	const basePath = await getStorageBasePath(globalStoragePath)
	const taskDir = path.join(basePath, "tasks", taskId)
	await fs.mkdir(taskDir, { recursive: true })
	return taskDir
}

/**
 * Gets the settings directory path
 */
export async function getSettingsDirectoryPath(globalStoragePath: string): Promise<string> {
	const basePath = await getStorageBasePath(globalStoragePath)
	const settingsDir = path.join(basePath, "settings")
	await fs.mkdir(settingsDir, { recursive: true })
	return settingsDir
}

/**
 * Gets the cache directory path
 */
export async function getCacheDirectoryPath(globalStoragePath: string): Promise<string> {
	const basePath = await getStorageBasePath(globalStoragePath)
	const cacheDir = path.join(basePath, "cache")
	await fs.mkdir(cacheDir, { recursive: true })
	return cacheDir
}

/**
 * Prompts the user to set a custom storage path
 * Displays an input box allowing the user to enter a custom path
 */
export async function promptForCustomStoragePath(): Promise<void> {
	if (!vscode.window || !vscode.workspace) {
		console.error("VS Code API not available")
		return
	}

	let currentPath = ""
	try {
		const currentConfig = vscode.workspace.getConfiguration(Package.name)
		currentPath = currentConfig.get<string>("customStoragePath", "")
	} catch (error) {
		console.error("Could not access configuration")
		return
	}

	const result = await vscode.window.showInputBox({
		value: currentPath,
		placeHolder: t("common:storage.path_placeholder"),
		prompt: t("common:storage.prompt_custom_path"),
		validateInput: (input) => {
			if (!input) {
				return null // Allow empty value (use default path)
			}

			try {
				// Validate path format
				path.parse(input)

				// Check if path is absolute
				if (!path.isAbsolute(input)) {
					return t("common:storage.enter_absolute_path")
				}

				return null // Path format is valid
			} catch (e) {
				return t("common:storage.enter_valid_path")
			}
		},
	})

	// If user canceled the operation, result will be undefined
	if (result !== undefined) {
		try {
			const currentConfig = vscode.workspace.getConfiguration(Package.name)
			await currentConfig.update("customStoragePath", result, vscode.ConfigurationTarget.Global)

			if (result) {
				try {
					// Test if path is accessible
					await fs.mkdir(result, { recursive: true })
					vscode.window.showInformationMessage(t("common:info.custom_storage_path_set", { path: result }))
				} catch (error) {
					vscode.window.showErrorMessage(
						t("common:errors.cannot_access_path", {
							path: result,
							error: error instanceof Error ? error.message : String(error),
						}),
					)
				}
			} else {
				vscode.window.showInformationMessage(t("common:info.default_storage_path"))
			}
		} catch (error) {
			console.error("Failed to update configuration", error)
		}
	}
}
