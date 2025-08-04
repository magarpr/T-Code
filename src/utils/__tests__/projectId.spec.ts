import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import { v4 as uuidv4 } from "uuid"
import { getProjectId, generateProjectId, hasProjectId } from "../projectId"
import { fileExistsAtPath } from "../fs"

// Mock dependencies
vi.mock("fs/promises")
vi.mock("../fs")
vi.mock("uuid")

describe("projectId", () => {
	const mockWorkspaceRoot = "/test/workspace"
	const mockProjectId = "12345678-1234-1234-1234-123456789012"
	const projectIdPath = path.join(mockWorkspaceRoot, ".rooprojectid")

	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("getProjectId", () => {
		it("should return project ID when file exists and contains valid ID", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(mockProjectId)

			const result = await getProjectId(mockWorkspaceRoot)

			expect(result).toBe(mockProjectId)
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
			vi.mocked(fs.readFile).mockResolvedValue("")

			const result = await getProjectId(mockWorkspaceRoot)

			expect(result).toBeNull()
		})

		it("should trim whitespace from project ID", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(`  ${mockProjectId}  \n`)

			const result = await getProjectId(mockWorkspaceRoot)

			expect(result).toBe(mockProjectId)
		})

		it("should handle read errors gracefully", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockRejectedValue(new Error("Read error"))

			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const result = await getProjectId(mockWorkspaceRoot)

			expect(result).toBeNull()
			expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to read project ID: Error: Read error")
		})
	})

	describe("generateProjectId", () => {
		it("should generate and write a new project ID", async () => {
			vi.mocked(uuidv4).mockReturnValue(mockProjectId as any)
			vi.mocked(fs.writeFile).mockResolvedValue()

			const result = await generateProjectId(mockWorkspaceRoot)

			expect(result).toBe(mockProjectId)
			expect(uuidv4).toHaveBeenCalled()
			expect(fs.writeFile).toHaveBeenCalledWith(projectIdPath, mockProjectId, "utf8")
		})

		it("should handle write errors", async () => {
			vi.mocked(uuidv4).mockReturnValue(mockProjectId as any)
			vi.mocked(fs.writeFile).mockRejectedValue(new Error("Write error"))

			await expect(generateProjectId(mockWorkspaceRoot)).rejects.toThrow("Write error")
		})
	})

	describe("hasProjectId", () => {
		it("should return true when project ID file exists", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)

			const result = await hasProjectId(mockWorkspaceRoot)

			expect(result).toBe(true)
			expect(fileExistsAtPath).toHaveBeenCalledWith(projectIdPath)
		})

		it("should return false when project ID file does not exist", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)

			const result = await hasProjectId(mockWorkspaceRoot)

			expect(result).toBe(false)
			expect(fileExistsAtPath).toHaveBeenCalledWith(projectIdPath)
		})
	})
})
