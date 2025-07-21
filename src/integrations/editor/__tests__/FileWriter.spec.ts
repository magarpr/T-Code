import { FileWriter } from "../FileWriter"
import * as fs from "fs/promises"
import * as path from "path"
import { createDirectoriesForFile } from "../../../utils/fs"
import { Task } from "../../../core/task/Task"

// Mock fs/promises
vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	access: vi.fn(),
	unlink: vi.fn(),
	rmdir: vi.fn(),
}))

// Mock utils
vi.mock("../../../utils/fs", () => ({
	createDirectoriesForFile: vi.fn().mockResolvedValue([]),
}))

// Mock path
vi.mock("path", () => ({
	resolve: vi.fn((cwd, relPath) => `${cwd}/${relPath}`),
	dirname: vi.fn((filePath) => {
		const parts = filePath.split("/")
		parts.pop()
		return parts.join("/")
	}),
}))

// Mock getReadablePath
vi.mock("../../../utils/path", () => ({
	getReadablePath: vi.fn((cwd, relPath) => relPath),
}))

describe("FileWriter", () => {
	let fileWriter: FileWriter
	const mockCwd = "/mock/cwd"

	beforeEach(() => {
		vi.clearAllMocks()
		fileWriter = new FileWriter(mockCwd)
	})

	describe("open method", () => {
		it("should set relPath and editType for existing file", async () => {
			vi.mocked(fs.access).mockResolvedValue(undefined)
			vi.mocked(fs.readFile).mockResolvedValue("existing content")

			await fileWriter.open("test.txt")

			expect(fileWriter["relPath"]).toBe("test.txt")
			expect(fileWriter["editType"]).toBe("modify")
			expect(fileWriter.isEditing).toBe(true)
		})

		it("should set editType to create for new file", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("File not found"))

			await fileWriter.open("newfile.txt")

			expect(fileWriter["relPath"]).toBe("newfile.txt")
			expect(fileWriter["editType"]).toBe("create")
			expect(fileWriter.isEditing).toBe(true)
		})

		it("should read file content for existing file", async () => {
			const mockContent = "existing content"
			vi.mocked(fs.access).mockResolvedValue(undefined)
			vi.mocked(fs.readFile).mockResolvedValue(mockContent)

			await fileWriter.open("test.txt")

			expect(fs.readFile).toHaveBeenCalledWith(`${mockCwd}/test.txt`, "utf-8")
			expect(fileWriter["originalContent"]).toBe(mockContent)
		})

		it("should set empty content for new file", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("File not found"))

			await fileWriter.open("newfile.txt")

			expect(fileWriter["originalContent"]).toBe("")
			expect(fs.readFile).not.toHaveBeenCalled()
		})

		it("should create directories for new file", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("File not found"))
			vi.mocked(createDirectoriesForFile).mockResolvedValue(["/mock/cwd/new", "/mock/cwd/new/dir"])

			await fileWriter.open("new/dir/file.txt")

			expect(createDirectoriesForFile).toHaveBeenCalledWith(`${mockCwd}/new/dir/file.txt`)
			expect(fileWriter["createdDirs"]).toEqual(["/mock/cwd/new", "/mock/cwd/new/dir"])
		})
	})

	describe("update method", () => {
		beforeEach(async () => {
			// Setup file writer with a file
			vi.mocked(fs.access).mockResolvedValue(undefined)
			vi.mocked(fs.readFile).mockResolvedValue("original content")
			await fileWriter.open("test.txt")
		})

		it("should update newContent", async () => {
			await fileWriter.update("new content", false)

			expect(fileWriter["newContent"]).toBe("new content")
		})

		it("should handle multiple updates", async () => {
			await fileWriter.update("first content", false)
			await fileWriter.update("second content", false)
			await fileWriter.update("final content", true)

			expect(fileWriter["newContent"]).toBe("final content")
		})
	})

	describe("saveChanges method", () => {
		beforeEach(async () => {
			// Setup file writer with a file
			vi.mocked(fs.access).mockResolvedValue(undefined)
			vi.mocked(fs.readFile).mockResolvedValue("original content")
			await fileWriter.open("test.txt")
			await fileWriter.update("new content", false)
		})

		it("should write content to file", async () => {
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)

			const result = await fileWriter.saveChanges()

			expect(fs.writeFile).toHaveBeenCalledWith(`${mockCwd}/test.txt`, "new content", "utf-8")
			expect(result.newProblemsMessage).toBeUndefined()
			expect(result.userEdits).toBeUndefined()
			expect(result.finalContent).toBe("new content")
		})

		it("should handle write errors", async () => {
			const error = new Error("Write failed")
			vi.mocked(fs.writeFile).mockRejectedValue(error)

			await expect(fileWriter.saveChanges()).rejects.toThrow("Write failed")
		})

		it("should handle saveChanges with parameters", async () => {
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)

			const result = await fileWriter.saveChanges(false, 1000)

			expect(fs.writeFile).toHaveBeenCalledWith(`${mockCwd}/test.txt`, "new content", "utf-8")
			expect(result.finalContent).toBe("new content")
		})

		it("should return empty result when no content to save", async () => {
			const emptyWriter = new FileWriter(mockCwd)

			const result = await emptyWriter.saveChanges()

			expect(result.newProblemsMessage).toBeUndefined()
			expect(result.userEdits).toBeUndefined()
			expect(result.finalContent).toBeUndefined()
			expect(fs.writeFile).not.toHaveBeenCalled()
		})
	})

	describe("revertChanges method", () => {
		beforeEach(async () => {
			// Setup file writer with a file
			vi.mocked(fs.access).mockResolvedValue(undefined)
			vi.mocked(fs.readFile).mockResolvedValue("original content")
			await fileWriter.open("test.txt")
			await fileWriter.update("new content", false)
		})

		it("should revert to original content for existing file", async () => {
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)

			await fileWriter.revertChanges()

			expect(fs.writeFile).toHaveBeenCalledWith(`${mockCwd}/test.txt`, "original content", "utf-8")
		})

		it("should delete file if it was newly created", async () => {
			fileWriter["editType"] = "create"
			fileWriter["createdDirs"] = ["/mock/cwd/new", "/mock/cwd/new/dir"]
			vi.mocked(fs.unlink).mockResolvedValue(undefined)
			vi.mocked(fs.rmdir).mockResolvedValue(undefined)

			await fileWriter.revertChanges()

			expect(fs.unlink).toHaveBeenCalledWith(`${mockCwd}/test.txt`)
			expect(fs.rmdir).toHaveBeenCalledWith("/mock/cwd/new/dir")
			expect(fs.rmdir).toHaveBeenCalledWith("/mock/cwd/new")
			expect(fs.writeFile).not.toHaveBeenCalled()
		})

		it("should handle revert errors", async () => {
			const error = new Error("Revert failed")
			vi.mocked(fs.writeFile).mockRejectedValue(error)

			await expect(fileWriter.revertChanges()).rejects.toThrow("Revert failed")
		})
	})

	describe("pushToolWriteResult method", () => {
		let mockTask: Task

		beforeEach(() => {
			mockTask = {
				say: vi.fn().mockResolvedValue(undefined),
			} as any
		})

		it("should send user feedback and return XML for new file", async () => {
			fileWriter["relPath"] = "test.txt"
			fileWriter["editType"] = "create"

			const result = await fileWriter.pushToolWriteResult(mockTask, mockCwd, true)

			expect(mockTask.say).toHaveBeenCalledWith("user_feedback_diff", expect.stringContaining("newFileCreated"))
			expect(result).toContain("<file_write_result>")
			expect(result).toContain("<path>test.txt</path>")
			expect(result).toContain("<operation>created</operation>")
		})

		it("should send user feedback and return XML for modified file", async () => {
			fileWriter["relPath"] = "test.txt"
			fileWriter["editType"] = "modify"

			const result = await fileWriter.pushToolWriteResult(mockTask, mockCwd, false)

			expect(mockTask.say).toHaveBeenCalledWith(
				"user_feedback_diff",
				expect.stringContaining("editedExistingFile"),
			)
			expect(result).toContain("<file_write_result>")
			expect(result).toContain("<path>test.txt</path>")
			expect(result).toContain("<operation>modified</operation>")
		})

		it("should throw error when no relPath is set", async () => {
			await expect(fileWriter.pushToolWriteResult(mockTask, mockCwd, true)).rejects.toThrow(
				"No file path available in FileWriter",
			)
		})
	})

	describe("reset method", () => {
		it("should reset all state", async () => {
			// Setup some state
			vi.mocked(fs.access).mockResolvedValue(undefined)
			vi.mocked(fs.readFile).mockResolvedValue("original content")
			await fileWriter.open("test.txt")
			await fileWriter.update("new content", false)

			// Reset
			await fileWriter.reset()

			// Verify all state is cleared
			expect(fileWriter.isEditing).toBe(false)
			expect(fileWriter["relPath"]).toBeUndefined()
			expect(fileWriter["editType"]).toBeUndefined()
			expect(fileWriter["originalContent"]).toBeUndefined()
			expect(fileWriter["newContent"]).toBeUndefined()
			expect(fileWriter["createdDirs"]).toEqual([])
		})
	})

	describe("scrollToFirstDiff method", () => {
		it("should be a no-op for file-based editing", () => {
			// This method should do nothing for FileWriter
			expect(() => fileWriter.scrollToFirstDiff()).not.toThrow()
		})
	})
})
