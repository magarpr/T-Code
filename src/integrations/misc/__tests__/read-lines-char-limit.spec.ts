import { promises as fs } from "fs"
import path from "path"
import { readLinesWithCharLimit } from "../read-lines-char-limit"

describe("readLinesWithCharLimit", () => {
	const testDir = path.join(__dirname, "test-files")
	const testFile = path.join(testDir, "char-limit-test.txt")
	const longLineFile = path.join(testDir, "long-lines.txt")
	const mixedFile = path.join(testDir, "mixed-content.txt")

	beforeAll(async () => {
		// Create test directory
		await fs.mkdir(testDir, { recursive: true })

		// Create test file with predictable content
		// Each line is "Line X" (6 chars) + newline (1 char) = 7 chars per line
		const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join("\n")
		await fs.writeFile(testFile, lines)

		// Create file with very long lines
		const longLine = "A".repeat(1000) // 1000 chars
		const longLines = Array.from({ length: 5 }, () => longLine).join("\n")
		await fs.writeFile(longLineFile, longLines)

		// Create file with mixed line lengths
		const mixedContent = [
			"Short", // 5 chars
			"Medium length line", // 18 chars
			"A".repeat(100), // 100 chars
			"Another short", // 13 chars
			"B".repeat(200), // 200 chars
		].join("\n")
		await fs.writeFile(mixedFile, mixedContent)
	})

	afterAll(async () => {
		// Clean up test files
		await fs.rm(testDir, { recursive: true, force: true })
	})

	describe("basic functionality", () => {
		it("should read complete file when char limit is not exceeded", async () => {
			const result = await readLinesWithCharLimit(testFile, 1000)

			expect(result.wasTruncated).toBe(false)
			expect(result.linesRead).toBe(20)
			// Lines 1-9: "Line X\n" (7 chars each) = 9 * 7 = 63
			// Lines 10-19: "Line XX\n" (8 chars each) = 10 * 8 = 80
			// Line 20: "Line 20" (7 chars, no newline)
			// Total: 63 + 80 + 7 = 150
			expect(result.charactersRead).toBe(150)
			expect(result.content).toContain("Line 1")
			expect(result.content).toContain("Line 20")
		})

		it("should truncate at line boundary when char limit is exceeded", async () => {
			// Set limit to 50 chars, which should include ~7 complete lines
			const result = await readLinesWithCharLimit(testFile, 50)

			expect(result.wasTruncated).toBe(true)
			expect(result.linesRead).toBe(7) // 7 * 7 = 49 chars
			expect(result.charactersRead).toBe(49)
			expect(result.content).toContain("Line 1")
			expect(result.content).toContain("Line 7")
			expect(result.content).not.toContain("Line 8")
		})

		it("should handle startLine parameter correctly", async () => {
			// Start from line 5 (0-based index 4)
			const result = await readLinesWithCharLimit(testFile, 50, 4)

			expect(result.wasTruncated).toBe(true)
			// Lines 5-9: "Line X\n" (7 chars each) = 5 * 7 = 35
			// Line 10: "Line 10\n" (8 chars) = 8
			// Total so far: 43 chars, can fit one more line
			// Line 11: "Line 11\n" (8 chars) would make 51, exceeds limit
			// So we get lines 5-10 = 6 lines
			expect(result.linesRead).toBe(6)
			expect(result.content).toContain("Line 5")
			expect(result.content).toContain("Line 10")
			expect(result.content).not.toContain("Line 4")
			expect(result.content).not.toContain("Line 11")
		})
	})

	describe("edge cases", () => {
		it("should handle empty files", async () => {
			const emptyFile = path.join(testDir, "empty.txt")
			await fs.writeFile(emptyFile, "")

			const result = await readLinesWithCharLimit(emptyFile, 100)

			expect(result.wasTruncated).toBe(false)
			expect(result.linesRead).toBe(0)
			expect(result.charactersRead).toBe(0)
			expect(result.content).toBe("")
		})

		it("should handle single character limit", async () => {
			const result = await readLinesWithCharLimit(testFile, 1)

			expect(result.wasTruncated).toBe(true)
			expect(result.linesRead).toBe(0) // Can't fit even one line
			expect(result.charactersRead).toBe(0)
			expect(result.content).toBe("")
		})

		it("should handle file with no newline at end", async () => {
			const noNewlineFile = path.join(testDir, "no-newline.txt")
			await fs.writeFile(noNewlineFile, "Line without newline")

			const result = await readLinesWithCharLimit(noNewlineFile, 100)

			expect(result.wasTruncated).toBe(false)
			expect(result.linesRead).toBe(1)
			expect(result.charactersRead).toBe(20)
			expect(result.content).toBe("Line without newline")
		})

		it("should reject negative maxChars", async () => {
			await expect(readLinesWithCharLimit(testFile, -1)).rejects.toThrow("maxChars must be positive")
		})

		it("should reject negative startLine", async () => {
			await expect(readLinesWithCharLimit(testFile, 100, -1)).rejects.toThrow("startLine must be non-negative")
		})
	})

	describe("long lines handling", () => {
		it("should not include partial lines when they exceed char limit", async () => {
			// Each line is 1001 chars (1000 'A's + newline)
			// With 1500 char limit, should only include 1 complete line
			const result = await readLinesWithCharLimit(longLineFile, 1500)

			expect(result.wasTruncated).toBe(true)
			expect(result.linesRead).toBe(1)
			expect(result.charactersRead).toBe(1001)
			expect(result.content).toMatch(/^A{1000}\n$/)
		})

		it("should handle case where first line exceeds limit", async () => {
			// Limit is less than first line length
			const result = await readLinesWithCharLimit(longLineFile, 500)

			expect(result.wasTruncated).toBe(true)
			expect(result.linesRead).toBe(0)
			expect(result.charactersRead).toBe(0)
			expect(result.content).toBe("")
		})
	})

	describe("mixed content handling", () => {
		it("should correctly count characters with mixed line lengths", async () => {
			// First 3 lines: "Short\n" (6) + "Medium length line\n" (19) + 100 A's + \n (101) = 126 chars
			const result = await readLinesWithCharLimit(mixedFile, 130)

			expect(result.wasTruncated).toBe(true)
			expect(result.linesRead).toBe(3)
			expect(result.charactersRead).toBe(126)
			expect(result.content).toContain("Short")
			expect(result.content).toContain("Medium length line")
			expect(result.content).toContain("A".repeat(100))
			expect(result.content).not.toContain("Another short")
		})

		it("should handle exact character boundary", async () => {
			// Exactly enough for first two lines
			const result = await readLinesWithCharLimit(mixedFile, 25)

			expect(result.wasTruncated).toBe(true)
			expect(result.linesRead).toBe(2)
			expect(result.charactersRead).toBe(25)
			expect(result.content).toBe("Short\nMedium length line\n")
		})
	})

	describe("unicode handling", () => {
		it("should handle unicode characters correctly", async () => {
			const unicodeFile = path.join(testDir, "unicode.txt")
			const unicodeContent = [
				"Hello 👋", // 8 chars (emoji counts as 2)
				"世界", // 2 chars
				"🌍🌎🌏", // 6 chars (3 emojis)
			].join("\n")
			await fs.writeFile(unicodeFile, unicodeContent)

			const result = await readLinesWithCharLimit(unicodeFile, 20)

			expect(result.wasTruncated).toBe(false)
			expect(result.linesRead).toBe(3)
			// Note: character count is based on JavaScript string length
			expect(result.content).toContain("Hello 👋")
			expect(result.content).toContain("世界")
			expect(result.content).toContain("🌍🌎🌏")
		})
	})

	describe("performance considerations", () => {
		it("should handle large files efficiently", async () => {
			const largeFile = path.join(testDir, "large.txt")
			// Create a 10MB file
			const chunk = "A".repeat(1000) + "\n"
			const chunks = Array(10000).fill(chunk).join("")
			await fs.writeFile(largeFile, chunks)

			const startTime = Date.now()
			const result = await readLinesWithCharLimit(largeFile, 10000)
			const duration = Date.now() - startTime

			expect(result.wasTruncated).toBe(true)
			expect(result.linesRead).toBe(9) // 9 complete lines
			expect(result.charactersRead).toBe(9009) // 9 * 1001
			expect(duration).toBeLessThan(100) // Should complete quickly
		})
	})

	describe("file not found handling", () => {
		it("should reject when file does not exist", async () => {
			const nonExistentFile = path.join(testDir, "does-not-exist.txt")

			await expect(readLinesWithCharLimit(nonExistentFile, 100)).rejects.toThrow()
		})
	})
})
