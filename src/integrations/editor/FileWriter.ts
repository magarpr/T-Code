import * as path from "path"
import * as fs from "fs/promises"
import { XMLBuilder } from "fast-xml-parser"

import { IEditingProvider } from "./IEditingProvider"
import { Task } from "../../core/task/Task"
import { ClineSayTool } from "../../shared/ExtensionMessage"
import { createDirectoriesForFile } from "../../utils/fs"
import { getReadablePath } from "../../utils/path"
import { formatResponse } from "../../core/prompts/responses"

/**
 * FileWriter implements direct file system writes without visual feedback.
 * This provider bypasses the diff view and writes changes directly to disk.
 */
export class FileWriter implements IEditingProvider {
	isEditing = false
	editType?: "create" | "modify"
	originalContent?: string

	private relPath?: string
	private newContent?: string
	private createdDirs: string[] = []

	constructor(private cwd: string) {}

	async open(relPath: string): Promise<void> {
		this.relPath = relPath
		const absolutePath = path.resolve(this.cwd, relPath)

		try {
			// Check if file exists
			await fs.access(absolutePath)
			this.editType = "modify"
			this.originalContent = await fs.readFile(absolutePath, "utf-8")
		} catch {
			// File doesn't exist
			this.editType = "create"
			this.originalContent = ""

			// Create necessary directories
			this.createdDirs = await createDirectoriesForFile(absolutePath)
		}

		this.isEditing = true
	}

	async update(content: string, isFinal: boolean): Promise<void> {
		if (!this.relPath) {
			throw new Error("No file path set for FileWriter")
		}

		this.newContent = content

		// For file-based editing, we don't do anything until saveChanges is called
		// This maintains compatibility with the streaming interface
	}

	async saveChanges(
		diagnosticsEnabled: boolean = true,
		writeDelayMs: number = 0,
	): Promise<{
		newProblemsMessage: string | undefined
		userEdits: string | undefined
		finalContent: string | undefined
	}> {
		if (!this.relPath || !this.newContent) {
			return {
				newProblemsMessage: undefined,
				userEdits: undefined,
				finalContent: undefined,
			}
		}

		const absolutePath = path.resolve(this.cwd, this.relPath)

		// Write the file directly
		await fs.writeFile(absolutePath, this.newContent, "utf-8")

		// For file-based editing, we don't check diagnostics or track user edits
		// since there's no opportunity for the user to modify the content
		return {
			newProblemsMessage: undefined,
			userEdits: undefined,
			finalContent: this.newContent,
		}
	}

	async pushToolWriteResult(task: Task, cwd: string, isNewFile: boolean): Promise<string> {
		if (!this.relPath) {
			throw new Error("No file path available in FileWriter")
		}

		// Create say object for UI feedback (without diff since we're not showing it)
		const say: ClineSayTool = {
			tool: isNewFile ? "newFileCreated" : "editedExistingFile",
			path: getReadablePath(cwd, this.relPath),
		}

		// Send the feedback
		await task.say("user_feedback_diff", JSON.stringify(say))

		// Build XML response
		const xmlObj = {
			file_write_result: {
				path: this.relPath,
				operation: isNewFile ? "created" : "modified",
				notice: {
					i: [
						"File has been written directly to disk without visual diff",
						"Proceed with the task using these changes as the new baseline.",
					],
				},
			},
		}

		const builder = new XMLBuilder({
			format: true,
			indentBy: "",
			suppressEmptyNode: true,
			processEntities: false,
			tagValueProcessor: (name, value) => {
				if (typeof value === "string") {
					return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
				}
				return value
			},
			attributeValueProcessor: (name, value) => {
				if (typeof value === "string") {
					return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
				}
				return value
			},
		})

		return builder.build(xmlObj)
	}

	async revertChanges(): Promise<void> {
		if (!this.relPath) {
			return
		}

		const absolutePath = path.resolve(this.cwd, this.relPath)

		if (this.editType === "create") {
			// Delete the file if it was newly created
			try {
				await fs.unlink(absolutePath)
			} catch {
				// File might not exist
			}

			// Remove created directories in reverse order
			for (let i = this.createdDirs.length - 1; i >= 0; i--) {
				try {
					await fs.rmdir(this.createdDirs[i])
				} catch {
					// Directory might not be empty or already deleted
				}
			}
		} else if (this.editType === "modify" && this.originalContent !== undefined) {
			// Restore original content
			await fs.writeFile(absolutePath, this.originalContent, "utf-8")
		}

		await this.reset()
	}

	async reset(): Promise<void> {
		this.isEditing = false
		this.editType = undefined
		this.originalContent = undefined
		this.relPath = undefined
		this.newContent = undefined
		this.createdDirs = []
	}

	// Optional method - not applicable for file-based editing
	scrollToFirstDiff(): void {
		// No-op for file-based editing
	}
}
