import * as fs from "fs/promises"
import * as path from "path"
import { v4 as uuidv4 } from "uuid"
import { fileExistsAtPath } from "./fs"

const PROJECT_ID_FILENAME = ".rooprojectid"

/**
 * Gets the project ID from the .rooprojectid file in the workspace root.
 * Returns null if the file doesn't exist or can't be read.
 *
 * @param workspaceRoot The root directory of the workspace
 * @returns The project ID string or null
 */
export async function getProjectId(workspaceRoot: string): Promise<string | null> {
	try {
		const projectIdPath = path.join(workspaceRoot, PROJECT_ID_FILENAME)

		if (!(await fileExistsAtPath(projectIdPath))) {
			return null
		}

		const content = await fs.readFile(projectIdPath, "utf8")
		const projectId = content.trim()

		// Validate that it's a non-empty string
		if (!projectId) {
			return null
		}

		return projectId
	} catch (error) {
		// Silently handle errors and return null
		console.error(`Failed to read project ID: ${error}`)
		return null
	}
}

/**
 * Generates a new project ID and writes it to the .rooprojectid file.
 *
 * @param workspaceRoot The root directory of the workspace
 * @returns The generated project ID
 */
export async function generateProjectId(workspaceRoot: string): Promise<string> {
	const projectId = uuidv4()
	const projectIdPath = path.join(workspaceRoot, PROJECT_ID_FILENAME)

	await fs.writeFile(projectIdPath, projectId, "utf8")

	return projectId
}

/**
 * Gets the storage key for a workspace, using the project ID if available,
 * otherwise falling back to the workspace path.
 *
 * @param workspaceRoot The root directory of the workspace
 * @returns The storage key to use for this workspace
 */
export async function getWorkspaceStorageKey(workspaceRoot: string): Promise<string> {
	const projectId = await getProjectId(workspaceRoot)
	return projectId ?? workspaceRoot
}
