// npx vitest run integrations/misc/__tests__/extract-text-token-based.spec.ts

import { describe, it, expect, vi, beforeEach, Mock } from "vitest"
import * as fs from "fs/promises"
import { Anthropic } from "@anthropic-ai/sdk"
import { extractTextFromFile } from "../extract-text"
import { countFileLines } from "../line-counter"
import { readLines } from "../read-lines"
import { isBinaryFile } from "isbinaryfile"
import { countTokens } from "../../../utils/countTokens"

// Mock all dependencies
vi.mock("fs/promises")
vi.mock("../line-counter")
vi.mock("../read-lines")
vi.mock("isbinaryfile")
vi.mock("../../../utils/countTokens")

describe("extractTextFromFile - Token-based Truncation", () => {
	// Type the mocks
	const mockedFs = vi.mocked(fs)
	const mockedCountFileLines = vi.mocked(countFileLines)
	const mockedReadLines = vi.mocked(readLines)
	const mockedIsBinaryFile = vi.mocked(isBinaryFile)
	const mockedCountTokens = vi.mocked(countTokens)

	beforeEach(() => {
		vi.clearAllMocks()
		// Set default mock behavior
		mockedFs.access.mockResolvedValue(undefined)
		mockedIsBinaryFile.mockResolvedValue(false)

		// Mock countTokens to return a predictable token count
		mockedCountTokens.mockImplementation(async (content: Anthropic.Messages.ContentBlockParam[]) => {
			// Simulate token counting based on text content
			const text = content
				.filter((block) => block.type === "text")
				.map((block) => (block as Anthropic.Messages.TextBlockParam).text)
				.join("")
			const words = text.split(/\s+/).length
			return Math.floor(words * 1.5)
		})
	})

	it("should truncate files based on token count when maxReadFileTokens is provided", async () => {
		const fileContent = Array(100)
			.fill(null)
			.map((_, i) => `Line ${i + 1}: This is a test line with some content that has multiple words`)
			.join("\n")

		mockedFs.readFile.mockResolvedValue(fileContent as any)

		// Mock token counting to exceed limit after 50 lines
		let tokenCount = 0
		mockedCountTokens.mockImplementation(async (content: Anthropic.Messages.ContentBlockParam[]) => {
			const text = content
				.filter((block) => block.type === "text")
				.map((block) => (block as Anthropic.Messages.TextBlockParam).text)
				.join("")
			const lines = text.split("\n").length
			// Each line has ~15 tokens, so 50 lines = 750 tokens
			tokenCount = lines * 15
			return tokenCount
		})

		const result = await extractTextFromFile("/test/large-file.ts", -1, 750)

		// Should truncate based on tokens, not lines
		expect(result).toContain("1 | Line 1:")
		expect(result).toContain("[File truncated")
		expect(result).toMatch(/\d+ of ~?\d+ tokens/)
	})

	it("should not truncate when token count is within limit", async () => {
		const fileContent = Array(10)
			.fill(null)
			.map((_, i) => `Line ${i + 1}: Short content`)
			.join("\n")

		mockedFs.readFile.mockResolvedValue(fileContent as any)

		// Mock token counting to stay under limit
		mockedCountTokens.mockResolvedValue(100) // Well under 10000 default

		const result = await extractTextFromFile("/test/small-file.ts", -1, 10000)

		// Should include all content
		expect(result).toContain(" 1 | Line 1: Short content")
		expect(result).toContain("10 | Line 10: Short content")
		expect(result).not.toContain("[File truncated")
	})

	it("should prioritize token-based truncation over line-based when both limits are set", async () => {
		const fileContent = Array(200)
			.fill(null)
			.map((_, i) => `Line ${i + 1}: This line has many words to increase token count significantly`)
			.join("\n")

		mockedCountFileLines.mockResolvedValue(200)
		mockedFs.readFile.mockResolvedValue(fileContent as any)

		// Mock to exceed token limit before line limit
		let callCount = 0
		mockedCountTokens.mockImplementation(async (content: Anthropic.Messages.ContentBlockParam[]) => {
			callCount++
			const text = content
				.filter((block) => block.type === "text")
				.map((block) => (block as Anthropic.Messages.TextBlockParam).text)
				.join("")
			const lines = text.split("\n").length
			// Make it exceed token limit at ~30 lines (30 * 20 = 600 tokens)
			return lines * 20
		})

		// maxReadFileLine=100, maxReadFileTokens=500
		const result = await extractTextFromFile("/test/file.ts", 100, 500)

		// Should truncate based on tokens (500), not lines (100)
		expect(result).toContain("[File truncated")
		expect(result).toMatch(/\d+ of ~?\d+ tokens/)

		// Should have stopped before reaching line limit
		const resultLines = result.split("\n").filter((line) => line.match(/^\s*\d+\s*\|/))
		expect(resultLines.length).toBeLessThan(100)
	})

	it("should handle maxReadFileTokens of 0 by throwing an error", async () => {
		await expect(extractTextFromFile("/test/file.ts", -1, 0)).rejects.toThrow(
			"Invalid maxReadFileTokens: 0. Must be a positive integer or -1 for unlimited.",
		)
	})

	it("should handle negative maxReadFileTokens by throwing an error", async () => {
		await expect(extractTextFromFile("/test/file.ts", -1, -100)).rejects.toThrow(
			"Invalid maxReadFileTokens: -100. Must be a positive integer or -1 for unlimited.",
		)
	})

	it("should work with both line and token limits disabled", async () => {
		const fileContent = "Line 1\nLine 2\nLine 3"
		mockedFs.readFile.mockResolvedValue(fileContent as any)

		const result = await extractTextFromFile("/test/file.ts", -1, undefined)

		// Should include all content
		expect(result).toContain("1 | Line 1")
		expect(result).toContain("2 | Line 2")
		expect(result).toContain("3 | Line 3")
		expect(result).not.toContain("[File truncated")
	})

	it("should handle empty files with token-based truncation", async () => {
		mockedFs.readFile.mockResolvedValue("" as any)
		mockedCountTokens.mockResolvedValue(0)

		const result = await extractTextFromFile("/test/empty.ts", -1, 1000)

		expect(result).toBe("")
	})

	it("should efficiently handle very large token counts", async () => {
		// Simulate a file that would have millions of tokens
		const hugeContent = Array(10000)
			.fill(null)
			.map((_, i) => `Line ${i + 1}: ${Array(100).fill("word").join(" ")}`)
			.join("\n")

		mockedFs.readFile.mockResolvedValue(hugeContent as any)

		// Mock progressive token counting
		mockedCountTokens.mockImplementation(async (content: Anthropic.Messages.ContentBlockParam[]) => {
			const text = content
				.filter((block) => block.type === "text")
				.map((block) => (block as Anthropic.Messages.TextBlockParam).text)
				.join("")
			const lines = text.split("\n").length
			return lines * 150 // Each line has ~150 tokens
		})

		const result = await extractTextFromFile("/test/huge.ts", -1, 5000)

		// Should truncate early based on tokens
		expect(result).toContain("[File truncated")
		expect(result).toMatch(/\d+ of ~?\d+ tokens/)

		// Should have stopped processing early
		const resultLines = result.split("\n").filter((line) => line.match(/^\s*\d+\s*\|/))
		expect(resultLines.length).toBeLessThan(50) // Should stop around 33 lines (5000/150)
	})
})
