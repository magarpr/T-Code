import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { getProjectId, generateProjectId, getWorkspaceStorageKey } from "../projectId"
import { fileExistsAtPath } from "../fs"

vi.mock("fs/promises")
vi.mock("path")
vi.mock("../fs")

describe("projectId", () => {
	const mockWorkspaceRoot = "/test/workspace"
	const mockProjectIdPath = "/test/workspace/.rooprojectid"
	const mockProjectId = "123e4567-e89b-12d3-a456-426614174000"

	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(path.join).mockImplementation((...args) => args.join("/"))
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("getProjectId", () => {
		it("should return existing project ID from file", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(mockProjectId)

			const result = await getProjectId(mockWorkspaceRoot)

			expect(result).toBe(mockProjectId)
			expect(fileExistsAtPath).toHaveBeenCalledWith(mockProjectIdPath)
			expect(fs.readFile).toHaveBeenCalledWith(mockProjectIdPath, "utf8")
		})

		it("should return null if file does not exist", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)

			const result = await getProjectId(mockWorkspaceRoot)

			expect(result).toBeNull()
			expect(fs.readFile).not.toHaveBeenCalled()
		})

		it("should return null if file is empty", async () => {
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

		it("should return null on read error", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockRejectedValue(new Error("Read error"))
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const result = await getProjectId(mockWorkspaceRoot)

			expect(result).toBeNull()
			expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to read project ID: Error: Read error")
			consoleErrorSpy.mockRestore()
		})
	})

	describe("generateProjectId", () => {
		it("should generate and save a new project ID", async () => {
			vi.mocked(fs.writeFile).mockResolvedValue()

			const result = await generateProjectId(mockWorkspaceRoot)

			expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
			expect(fs.writeFile).toHaveBeenCalledWith(mockProjectIdPath, result, "utf8")
		})

		it("should throw error if write fails", async () => {
			vi.mocked(fs.writeFile).mockRejectedValue(new Error("Write failed"))

			await expect(generateProjectId(mockWorkspaceRoot)).rejects.toThrow("Write failed")
		})
	})

	describe("getWorkspaceStorageKey", () => {
		it("should return project ID if it exists", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(mockProjectId)

			const result = await getWorkspaceStorageKey(mockWorkspaceRoot)

			expect(result).toBe(mockProjectId)
		})

		it("should return workspace root if project ID does not exist", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)

			const result = await getWorkspaceStorageKey(mockWorkspaceRoot)

			expect(result).toBe(mockWorkspaceRoot)
		})
	})
})
