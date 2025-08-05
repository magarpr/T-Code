import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import { loadSmartRules, hasSmartRules } from "../smart-rules-loader"
import * as rooConfig from "../../../../services/roo-config"

// Mock the modules
vi.mock("fs/promises", () => ({
	default: {
		stat: vi.fn(),
		readdir: vi.fn(),
		readFile: vi.fn(),
	},
	stat: vi.fn(),
	readdir: vi.fn(),
	readFile: vi.fn(),
}))
vi.mock("../../../../services/roo-config")
vi.mock("../../../../utils/logging", () => ({
	logger: {
		error: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	},
}))

describe("smart-rules-loader", () => {
	const mockCwd = "/test/project"
	const mockGlobalDir = "/home/user/.roo"
	const mockProjectDir = "/test/project/.roo"

	beforeEach(() => {
		vi.clearAllMocks()

		// Mock getRooDirectoriesForCwd to return both global and project directories by default
		vi.mocked(rooConfig.getRooDirectoriesForCwd).mockReturnValue([mockGlobalDir, mockProjectDir])
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("loadSmartRules", () => {
		it("should load smart rules from .roo/smart-rules directory", async () => {
			// Mock directory existence
			vi.mocked(fs.stat).mockImplementation(async (path) => {
				if (path === `${mockProjectDir}/smart-rules`) {
					return { isDirectory: () => true } as any
				}
				throw new Error("Not found")
			})

			// Mock directory reading
			vi.mocked(fs.readdir).mockResolvedValue([
				{ name: "rule1.md", isFile: () => true, isDirectory: () => false } as any,
				{ name: "rule2.md", isFile: () => true, isDirectory: () => false } as any,
				{ name: "not-markdown.txt", isFile: () => true, isDirectory: () => false } as any,
			])

			// Mock file reading
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (filePath.toString().includes("rule1.md")) {
					return `---
use-when: working with databases
priority: 2
---
# Database Rules
Always use prepared statements`
				}
				if (filePath.toString().includes("rule2.md")) {
					return `---
use-when: writing tests
---
# Testing Rules
Write tests first`
				}
				return ""
			})

			const rules = await loadSmartRules(mockCwd)

			expect(rules).toHaveLength(2)
			expect(rules[0].filename).toBe("rule1.md")
			expect(rules[0].useWhen).toBe("working with databases")
			expect(rules[0].priority).toBe(2)
			expect(rules[0].content).toContain("Always use prepared statements")

			expect(rules[1].filename).toBe("rule2.md")
			expect(rules[1].useWhen).toBe("writing tests")
			expect(rules[1].content).toContain("Write tests first")
		})

		it("should load mode-specific smart rules", async () => {
			// Mock directory existence
			vi.mocked(fs.stat).mockImplementation(async (path) => {
				if (path === `${mockProjectDir}/smart-rules-code`) {
					return { isDirectory: () => true } as any
				}
				throw new Error("Not found")
			})

			// Mock directory reading
			vi.mocked(fs.readdir).mockResolvedValue([
				{ name: "code-rule.md", isFile: () => true, isDirectory: () => false } as any,
			])

			// Mock file reading
			vi.mocked(fs.readFile).mockResolvedValue(`---
use-when: writing code
---
# Code Mode Rules
Follow coding standards`)

			const rules = await loadSmartRules(mockCwd, "code")

			expect(rules).toHaveLength(1)
			expect(rules[0].filename).toBe("code-rule.md")
			expect(rules[0].useWhen).toBe("writing code")
		})

		it("should merge global and project smart rules", async () => {
			// Mock directory existence
			vi.mocked(fs.stat).mockImplementation(async (path) => {
				if (path === `${mockGlobalDir}/smart-rules` || path === `${mockProjectDir}/smart-rules`) {
					return { isDirectory: () => true } as any
				}
				throw new Error("Not found")
			})

			// Mock directory reading
			vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
				if (dirPath === `${mockGlobalDir}/smart-rules`) {
					return [{ name: "global-rule.md", isFile: () => true, isDirectory: () => false } as any]
				}
				if (dirPath === `${mockProjectDir}/smart-rules`) {
					return [{ name: "project-rule.md", isFile: () => true, isDirectory: () => false } as any]
				}
				return []
			})

			// Mock file reading
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (filePath.toString().includes("global-rule.md")) {
					return `---
use-when: global rule
priority: 1
---
Global content`
				}
				if (filePath.toString().includes("project-rule.md")) {
					return `---
use-when: project rule
priority: 2
---
Project content`
				}
				return ""
			})

			const rules = await loadSmartRules(mockCwd)

			expect(rules).toHaveLength(2)
			// Project rule should come first due to higher priority
			expect(rules[0].filename).toBe("project-rule.md")
			expect(rules[1].filename).toBe("global-rule.md")
		})

		it("should skip files without use-when frontmatter", async () => {
			// For this test, only return project directory
			vi.mocked(rooConfig.getRooDirectoriesForCwd).mockReturnValue([mockProjectDir])

			// Mock directory existence - only project dir has smart-rules
			vi.mocked(fs.stat).mockImplementation(async (path) => {
				if (path === `${mockProjectDir}/smart-rules`) {
					return { isDirectory: () => true } as any
				}
				throw new Error("Not found")
			})

			// Mock directory reading - only return files when reading project dir
			vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
				if (dirPath === `${mockProjectDir}/smart-rules`) {
					return [
						{ name: "valid.md", isFile: () => true, isDirectory: () => false } as any,
						{ name: "invalid.md", isFile: () => true, isDirectory: () => false } as any,
					]
				}
				return []
			})

			// Mock file reading - make sure we return different content for each file
			vi.mocked(fs.readFile).mockImplementation(async (filePath, encoding) => {
				const pathStr = filePath.toString()

				// Valid file with use-when
				if (pathStr === path.join(mockProjectDir, "smart-rules", "valid.md")) {
					return `---
use-when: valid rule
---
Valid content`
				}

				// Invalid file without use-when
				if (pathStr === path.join(mockProjectDir, "smart-rules", "invalid.md")) {
					return `---
priority: 1
---
No use-when field`
				}

				throw new Error(`Unexpected file read: ${filePath}`)
			})

			const rules = await loadSmartRules(mockCwd)

			// The test should check that only the valid rule is loaded
			// The invalid.md file should be skipped because it doesn't have use-when
			expect(rules).toHaveLength(1)
			expect(rules[0].filename).toBe("valid.md")
			expect(rules[0].useWhen).toBe("valid rule")
			expect(rules[0].content).toBe("Valid content")
		})

		it("should handle nested directories", async () => {
			// Mock directory existence
			vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any)

			// Mock directory reading
			vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
				if (dirPath === `${mockProjectDir}/smart-rules`) {
					return [
						{ name: "subdir", isFile: () => false, isDirectory: () => true } as any,
						{ name: "root.md", isFile: () => true, isDirectory: () => false } as any,
					]
				}
				if (dirPath === path.join(`${mockProjectDir}/smart-rules`, "subdir")) {
					return [{ name: "nested.md", isFile: () => true, isDirectory: () => false } as any]
				}
				return []
			})

			// Mock file reading
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (filePath.toString().includes("root.md")) {
					return `---
use-when: root rule
---
Root content`
				}
				if (filePath.toString().includes("nested.md")) {
					return `---
use-when: nested rule
---
Nested content`
				}
				return ""
			})

			const rules = await loadSmartRules(mockCwd)

			expect(rules).toHaveLength(2)
			const filenames = rules.map((r) => r.filename)
			expect(filenames).toContain("root.md")
			expect(filenames).toContain("nested.md")
		})
	})

	describe("hasSmartRules", () => {
		it("should return true if smart rules exist", async () => {
			// Mock directory existence
			vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any)

			// Mock directory reading
			vi.mocked(fs.readdir).mockResolvedValue([
				{ name: "rule.md", isFile: () => true, isDirectory: () => false } as any,
			])

			const result = await hasSmartRules(mockCwd)

			expect(result).toBe(true)
		})

		it("should return false if no smart rules exist", async () => {
			// Mock directory doesn't exist
			vi.mocked(fs.stat).mockRejectedValue(new Error("Not found"))

			const result = await hasSmartRules(mockCwd)

			expect(result).toBe(false)
		})

		it("should check mode-specific directories when mode is provided", async () => {
			// Mock directory existence
			vi.mocked(fs.stat).mockImplementation(async (path) => {
				if (path === `${mockProjectDir}/smart-rules-code`) {
					return { isDirectory: () => true } as any
				}
				throw new Error("Not found")
			})

			// Mock directory reading
			vi.mocked(fs.readdir).mockResolvedValue([
				{ name: "code-rule.md", isFile: () => true, isDirectory: () => false } as any,
			])

			const result = await hasSmartRules(mockCwd, "code")

			expect(result).toBe(true)
			expect(fs.stat).toHaveBeenCalledWith(`${mockProjectDir}/smart-rules-code`)
		})
	})
})
