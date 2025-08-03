// npx vitest utils/__tests__/projectId.spec.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { getProjectId, generateProjectId, getWorkspaceStorageKey } from "../projectId"
import { fileExistsAtPath } from "../fs"

// Mock dependencies
vi.mock("fs/promises")
vi.mock("../fs")
vi.mock("uuid", () => ({
	v4: vi.fn(() => "test-uuid-1234"),
}))

describe("projectId utilities", () => {
	const mockWorkspaceRoot = "/test/workspace"
	const projectIdPath = path.join(mockWorkspaceRoot, ".rooprojectid")

	beforeEach(() => {
		vi.clearAllMocks()
		// Reset console.error mock
		vi.spyOn(console, "error").mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("getProjectId", () => {
		it("should return project ID when file exists", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue("existing-project-id\n")

			const result = await getProjectId(mockWorkspaceRoot)

			expect(result).toBe("existing-project-id")
			expect(fileExistsAtPath).toHaveBeenCalledWith(projectIdPath)
			expect(fs.readFile).toHaveBeenCalledWith(projectIdPath, "utf8")
		})

		it("should return null when file does not exist", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)

			const result = await getProjectId(mockWorkspaceRoot)

			expect(result).toBeNull()
			expect(fileExistsAtPath).toHaveBeenCalledWith(projectIdPath)
			expect(fs.readFile).not.toHaveBeenCalled()
		})

		it("should return null when file is empty", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue("  \n  ")

			const result = await getProjectId(mockWorkspaceRoot)

			expect(result).toBeNull()
		})

		it("should handle read errors gracefully", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockRejectedValue(new Error("Read error"))

			const result = await getProjectId(mockWorkspaceRoot)

			expect(result).toBeNull()
			expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Failed to read project ID"))
		})
	})

	describe("generateProjectId", () => {
		it("should generate new ID when none exists", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)
			vi.mocked(fs.writeFile).mockResolvedValue()

			const result = await generateProjectId(mockWorkspaceRoot)

			expect(result).toBe("test-uuid-1234")
			expect(fs.writeFile).toHaveBeenCalledWith(projectIdPath, "test-uuid-1234", "utf8")
		})

		it("should return existing ID if already present", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue("existing-id")

			const result = await generateProjectId(mockWorkspaceRoot)

			expect(result).toBe("existing-id")
			expect(fs.writeFile).not.toHaveBeenCalled()
		})

		it("should handle write errors", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)
			vi.mocked(fs.writeFile).mockRejectedValue(new Error("Write error"))

			await expect(generateProjectId(mockWorkspaceRoot)).rejects.toThrow("Write error")
		})
	})

	describe("getWorkspaceStorageKey", () => {
		it("should return project ID when available", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue("project-id-123")

			const result = await getWorkspaceStorageKey(mockWorkspaceRoot)

			expect(result).toBe("project-id-123")
		})

		it("should return workspace path when no project ID exists", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)

			const result = await getWorkspaceStorageKey(mockWorkspaceRoot)

			expect(result).toBe(mockWorkspaceRoot)
		})
	})
})
