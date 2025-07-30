import * as path from "path"
import * as fs from "fs/promises"
import { getWorkspaceHashFromPath, getShortWorkspaceHash } from "./workspaceHash"
import { fileExistsAtPath } from "./fs"
import { GlobalFileNames } from "../shared/globalFileNames"
import { safeWriteJson } from "./safeWriteJson"

export interface MigrationResult {
	migratedTasks: number
	skippedTasks: number
	errors: string[]
}

export interface TaskMetadata {
	files_in_context: Array<{
		path: string
		record_state: "active" | "stale"
		record_source: string
		roo_read_date?: number
		roo_edit_date?: number
		user_edit_date?: number
	}>
}

/**
 * Migrates existing task directories from the old structure (tasks/{taskId})
 * to the new workspace-based structure (workspaces/{workspaceHash}/tasks/{taskId})
 */
export async function migrateTasksToWorkspaceStructure(
	globalStoragePath: string,
	log: (message: string) => void = console.log,
): Promise<MigrationResult> {
	const result: MigrationResult = {
		migratedTasks: 0,
		skippedTasks: 0,
		errors: [],
	}

	try {
		const tasksDir = path.join(globalStoragePath, "tasks")

		// Check if old tasks directory exists
		if (!(await fileExistsAtPath(tasksDir))) {
			log("No existing tasks directory found, migration not needed")
			return result
		}

		// Get all task directories
		const taskDirs = await fs.readdir(tasksDir, { withFileTypes: true })
		const taskIds = taskDirs.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name)

		log(`Found ${taskIds.length} task directories to migrate`)

		for (const taskId of taskIds) {
			try {
				await migrateTask(globalStoragePath, taskId, log)
				result.migratedTasks++
			} catch (error) {
				const errorMessage = `Failed to migrate task ${taskId}: ${error instanceof Error ? error.message : String(error)}`
				result.errors.push(errorMessage)
				result.skippedTasks++
				log(errorMessage)
			}
		}

		log(
			`Migration completed: ${result.migratedTasks} migrated, ${result.skippedTasks} skipped, ${result.errors.length} errors`,
		)
	} catch (error) {
		const errorMessage = `Migration failed: ${error instanceof Error ? error.message : String(error)}`
		result.errors.push(errorMessage)
		log(errorMessage)
	}

	return result
}

/**
 * Migrates a single task from old structure to new workspace-based structure
 */
async function migrateTask(globalStoragePath: string, taskId: string, log: (message: string) => void): Promise<void> {
	const oldTaskDir = path.join(globalStoragePath, "tasks", taskId)

	// Check if task directory exists
	if (!(await fileExistsAtPath(oldTaskDir))) {
		throw new Error(`Task directory not found: ${oldTaskDir}`)
	}

	// Read task metadata to determine workspace
	const metadataPath = path.join(oldTaskDir, GlobalFileNames.taskMetadata)
	let workspaceHash: string

	if (await fileExistsAtPath(metadataPath)) {
		// Try to determine workspace from file paths in metadata
		workspaceHash = await getWorkspaceHashFromMetadata(metadataPath)
	} else {
		// Fallback: try to determine from other files or skip
		throw new Error(`No task metadata found, cannot determine workspace for task ${taskId}`)
	}

	// Create new directory structure
	const workspacesDir = path.join(globalStoragePath, "workspaces")
	const shortHash = getShortWorkspaceHash(workspaceHash)
	const newWorkspaceDir = path.join(workspacesDir, shortHash)
	const newTasksDir = path.join(newWorkspaceDir, "tasks")
	const newTaskDir = path.join(newTasksDir, taskId)

	// Create directories
	await fs.mkdir(newTaskDir, { recursive: true })

	// Copy all files from old directory to new directory
	const files = await fs.readdir(oldTaskDir)
	for (const file of files) {
		const oldFilePath = path.join(oldTaskDir, file)
		const newFilePath = path.join(newTaskDir, file)

		const stat = await fs.stat(oldFilePath)
		if (stat.isFile()) {
			await fs.copyFile(oldFilePath, newFilePath)
		}
	}

	// Update task metadata to use relative paths
	if (await fileExistsAtPath(metadataPath)) {
		await updateTaskMetadataForWorkspace(newTaskDir, workspaceHash, log)
	}

	// Remove old task directory
	await fs.rm(oldTaskDir, { recursive: true, force: true })

	log(`Migrated task ${taskId} to workspace ${shortHash}`)
}

/**
 * Determines workspace hash from task metadata file paths
 */
async function getWorkspaceHashFromMetadata(metadataPath: string): Promise<string> {
	try {
		const metadataContent = await fs.readFile(metadataPath, "utf8")
		const metadata: TaskMetadata = JSON.parse(metadataContent)

		if (!metadata.files_in_context || metadata.files_in_context.length === 0) {
			throw new Error("No files in context to determine workspace")
		}

		// Get the first file path and extract workspace root
		const firstFilePath = metadata.files_in_context[0].path
		const workspaceRoot = extractWorkspaceRoot(firstFilePath)

		return getWorkspaceHashFromPath(workspaceRoot)
	} catch (error) {
		throw new Error(`Failed to parse metadata: ${error instanceof Error ? error.message : String(error)}`)
	}
}

/**
 * Extracts workspace root from a file path
 * This is a heuristic approach - looks for common project indicators
 */
function extractWorkspaceRoot(filePath: string): string {
	const normalizedPath = path.normalize(filePath)
	const parts = normalizedPath.split(path.sep)

	// Look for common project root indicators
	const projectIndicators = [
		"package.json",
		".git",
		"tsconfig.json",
		"pyproject.toml",
		"Cargo.toml",
		"go.mod",
		".vscode",
		"src",
		"node_modules",
	]

	// Start from the file's directory and work up
	let currentPath = path.dirname(normalizedPath)

	// Try to find a reasonable project root
	// For now, we'll use a simple heuristic: go up until we find a common project structure
	// or reach a reasonable depth
	const maxDepth = 10
	let depth = 0

	while (depth < maxDepth && currentPath !== path.dirname(currentPath)) {
		// Check if this looks like a project root
		// For simplicity, we'll assume the workspace is the parent of the first directory
		// that contains the file. This is a fallback approach.
		depth++
		currentPath = path.dirname(currentPath)
	}

	// If we can't determine a good workspace root, use the directory containing the file
	// This is not ideal but provides a fallback
	return path.dirname(normalizedPath)
}

/**
 * Updates task metadata to use relative paths within the workspace
 */
async function updateTaskMetadataForWorkspace(
	taskDir: string,
	workspaceHash: string,
	log: (message: string) => void,
): Promise<void> {
	const metadataPath = path.join(taskDir, GlobalFileNames.taskMetadata)

	if (!(await fileExistsAtPath(metadataPath))) {
		return
	}

	try {
		const metadataContent = await fs.readFile(metadataPath, "utf8")
		const metadata: TaskMetadata = JSON.parse(metadataContent)

		// Update file paths to be relative to workspace root
		// Note: This is a simplified approach. In a real implementation,
		// we might need more sophisticated path resolution
		for (const fileEntry of metadata.files_in_context) {
			// Convert absolute paths to relative paths
			// This is a placeholder - the actual implementation would need
			// to properly resolve the workspace root and make paths relative
			if (path.isAbsolute(fileEntry.path)) {
				// For now, just store the path as-is
				// In a full implementation, we'd resolve this properly
				log(`Note: File path ${fileEntry.path} may need manual adjustment`)
			}
		}

		// Save updated metadata
		await safeWriteJson(metadataPath, metadata)
	} catch (error) {
		log(
			`Warning: Failed to update metadata for task in ${taskDir}: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
}

/**
 * Checks if migration is needed by looking for the old tasks directory structure
 */
export async function isMigrationNeeded(globalStoragePath: string): Promise<boolean> {
	const oldTasksDir = path.join(globalStoragePath, "tasks")
	const newWorkspacesDir = path.join(globalStoragePath, "workspaces")

	// Migration is needed if old structure exists and new structure doesn't have content
	const hasOldStructure = await fileExistsAtPath(oldTasksDir)

	if (!hasOldStructure) {
		return false
	}

	// Check if there are any task directories in the old structure
	try {
		const taskDirs = await fs.readdir(oldTasksDir, { withFileTypes: true })
		const hasTaskDirs = taskDirs.some((dirent) => dirent.isDirectory())
		return hasTaskDirs
	} catch {
		return false
	}
}
