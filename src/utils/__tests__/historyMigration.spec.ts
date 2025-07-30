import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import path from "path"
import { migrateTasksToWorkspaceStructure, isMigrationNeeded } from "../historyMigration"

// Mock dependencies
vi.mock("../fs", () => ({
	fileExistsAtPath: vi.fn(),
}))

vi.mock("../workspaceHash", () => ({
	getWorkspaceHashFromPath: vi.fn().mockReturnValue("mockhash123"),
	getShortWorkspaceHash: vi.fn().mockReturnValue("mockhash123"),
}))

vi.mock("../safeWriteJson", () => ({
	safeWriteJson: vi.fn(),
}))

vi.mock("fs/promises", () => ({
	readdir: vi.fn(),
	mkdir: vi.fn(),
	copyFile: vi.fn(),
	rm: vi.fn(),
	readFile: vi.fn(),
	stat: vi.fn(),
}))

const { fileExistsAtPath } = await import("../fs")
const fs = await import("fs/promises")

const mockFileExistsAtPath = vi.mocked(fileExistsAtPath)
const mockFs = vi.mocked(fs)

describe("historyMigration", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("isMigrationNeeded", () => {
		it("should return false when old tasks directory does not exist", async () => {
			mockFileExistsAtPath.mockResolvedValue(false)

			const result = await isMigrationNeeded("/test/storage")

			expect(result).toBe(false)
			expect(mockFileExistsAtPath).toHaveBeenCalledWith(path.join("/test/storage", "tasks"))
		})

		it("should return false when old tasks directory exists but is empty", async () => {
			mockFileExistsAtPath.mockResolvedValue(true)
			mockFs.readdir.mockResolvedValue([])

			const result = await isMigrationNeeded("/test/storage")

			expect(result).toBe(false)
		})

		it("should return true when old tasks directory has task directories", async () => {
			mockFileExistsAtPath.mockResolvedValue(true)
			mockFs.readdir.mockResolvedValue([
				{ name: "task-1", isDirectory: () => true },
				{ name: "task-2", isDirectory: () => true },
				{ name: "file.txt", isDirectory: () => false },
			] as any)

			const result = await isMigrationNeeded("/test/storage")

			expect(result).toBe(true)
		})

		it("should return false when readdir fails", async () => {
			mockFileExistsAtPath.mockResolvedValue(true)
			mockFs.readdir.mockRejectedValue(new Error("Permission denied"))

			const result = await isMigrationNeeded("/test/storage")

			expect(result).toBe(false)
		})
	})

	describe("migrateTasksToWorkspaceStructure", () => {
		const mockLog = vi.fn()

		beforeEach(() => {
			mockLog.mockClear()
		})

		it("should return early when no tasks directory exists", async () => {
			mockFileExistsAtPath.mockResolvedValue(false)

			const result = await migrateTasksToWorkspaceStructure("/test/storage", mockLog)

			expect(result).toEqual({
				migratedTasks: 0,
				skippedTasks: 0,
				errors: [],
			})
			expect(mockLog).toHaveBeenCalledWith("No existing tasks directory found, migration not needed")
		})

		it("should handle empty tasks directory", async () => {
			mockFileExistsAtPath.mockResolvedValue(true)
			mockFs.readdir.mockResolvedValue([])

			const result = await migrateTasksToWorkspaceStructure("/test/storage", mockLog)

			expect(result).toEqual({
				migratedTasks: 0,
				skippedTasks: 0,
				errors: [],
			})
			expect(mockLog).toHaveBeenCalledWith("Found 0 task directories to migrate")
		})

		it("should handle migration errors gracefully", async () => {
			mockFileExistsAtPath
				.mockResolvedValueOnce(true) // tasks directory exists
				.mockResolvedValueOnce(false) // task directory doesn't exist (causes error)

			mockFs.readdir.mockResolvedValue([{ name: "task-1", isDirectory: () => true }] as any)

			const result = await migrateTasksToWorkspaceStructure("/test/storage", mockLog)

			expect(result.migratedTasks).toBe(0)
			expect(result.skippedTasks).toBe(1)
			expect(result.errors).toHaveLength(1)
			expect(result.errors[0]).toContain("Failed to migrate task task-1")
		})

		it("should handle top-level migration errors", async () => {
			mockFileExistsAtPath.mockRejectedValue(new Error("File system error"))

			const result = await migrateTasksToWorkspaceStructure("/test/storage", mockLog)

			expect(result.migratedTasks).toBe(0)
			expect(result.skippedTasks).toBe(0)
			expect(result.errors).toHaveLength(1)
			expect(result.errors[0]).toContain("Migration failed")
		})

		it("should log migration progress", async () => {
			mockFileExistsAtPath.mockResolvedValue(true)
			mockFs.readdir.mockResolvedValue([
				{ name: "task-1", isDirectory: () => true },
				{ name: "task-2", isDirectory: () => true },
			] as any)

			// Mock the migration to fail for both tasks to test error handling
			mockFileExistsAtPath
				.mockResolvedValueOnce(true) // tasks directory exists
				.mockResolvedValueOnce(false) // task-1 directory doesn't exist
				.mockResolvedValueOnce(false) // task-2 directory doesn't exist

			const result = await migrateTasksToWorkspaceStructure("/test/storage", mockLog)

			expect(mockLog).toHaveBeenCalledWith("Found 2 task directories to migrate")
			expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Migration completed"))
		})
	})
})
