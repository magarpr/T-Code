import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { ProjectScanner } from "../ProjectScanner"

// Mock the listFiles function
vi.mock("../../../services/glob/list-files", () => ({
	listFiles: vi.fn().mockResolvedValue([["package.json", "src/", "src/index.ts", "README.md", ".gitignore"], false]),
}))

// Mock fs/promises
vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
}))

describe("ProjectScanner", () => {
	const mockRootPath = "/test/project"
	let scanner: ProjectScanner

	beforeEach(() => {
		vi.clearAllMocks()
		scanner = new ProjectScanner(mockRootPath)
	})

	describe("scanProject", () => {
		it("should detect project name from package.json", async () => {
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (filePath === path.join(mockRootPath, "package.json")) {
					return JSON.stringify({
						name: "test-project",
						description: "A test project",
						dependencies: {
							react: "^18.0.0",
							typescript: "^5.0.0",
						},
					})
				}
				throw new Error("File not found")
			})

			const result = await scanner.scanProject()

			expect(result.name).toBe("test-project")
			expect(result.description).toBe("A test project")
			expect(result.rootPath).toBe(mockRootPath)
		})

		it("should detect technologies from package.json", async () => {
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (filePath === path.join(mockRootPath, "package.json")) {
					return JSON.stringify({
						name: "test-project",
						dependencies: {
							react: "^18.0.0",
							express: "^4.18.0",
						},
						devDependencies: {
							typescript: "^5.0.0",
							jest: "^29.0.0",
						},
					})
				}
				throw new Error("File not found")
			})

			const result = await scanner.scanProject()

			const techNames = result.technologies.map((t) => t.name)
			expect(techNames).toContain("Node.js")
			expect(techNames).toContain("React")
			expect(techNames).toContain("Express")
			expect(techNames).toContain("TypeScript")
			expect(techNames).toContain("Jest")
		})

		it("should analyze project structure", async () => {
			vi.mocked(fs.readFile).mockImplementation(async () => {
				throw new Error("File not found")
			})

			const result = await scanner.scanProject()

			expect(result.structure.fileCount).toBe(4) // Excluding directories
			expect(result.structure.fileTypes[".json"]).toBe(1)
			expect(result.structure.fileTypes[".ts"]).toBe(1)
			expect(result.structure.fileTypes[".md"]).toBe(1)
		})
	})
})
