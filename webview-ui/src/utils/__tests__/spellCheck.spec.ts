import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { checkSpelling, debounce, isSpellCheckSupported } from "../spellCheck"

describe("spellCheck", () => {
	describe("isSpellCheckSupported", () => {
		it("should return true when spellcheck property exists", () => {
			// Mock document.createElement
			const mockElement = { spellcheck: true }
			vi.spyOn(document, "createElement").mockReturnValue(mockElement as any)

			expect(isSpellCheckSupported()).toBe(true)
		})

		it("should return false when spellcheck property does not exist", () => {
			// Mock document.createElement
			const mockElement = {}
			vi.spyOn(document, "createElement").mockReturnValue(mockElement as any)

			expect(isSpellCheckSupported()).toBe(false)
		})
	})

	describe("checkSpelling", () => {
		it("should return empty array for empty text", async () => {
			const results = await checkSpelling("")
			expect(results).toEqual([])
		})

		it("should return empty array for text with only common words", async () => {
			const results = await checkSpelling("the quick brown fox jumps over the lazy dog")
			expect(results).toEqual([])
		})

		it("should detect misspelled words", async () => {
			const results = await checkSpelling("This is a tset of speling")
			expect(results).toHaveLength(2)
			expect(results[0]).toEqual({
				word: "tset",
				startIndex: 10,
				endIndex: 14,
			})
			expect(results[1]).toEqual({
				word: "speling",
				startIndex: 18,
				endIndex: 25,
			})
		})

		it("should ignore words with numbers", async () => {
			const results = await checkSpelling("test123 abc456")
			expect(results).toEqual([])
		})

		it("should ignore words that are all uppercase", async () => {
			const results = await checkSpelling("API URL HTTP")
			expect(results).toEqual([])
		})

		it("should ignore words starting with @ or /", async () => {
			const results = await checkSpelling("@mention /command")
			expect(results).toEqual([])
		})

		it("should ignore very short words", async () => {
			const results = await checkSpelling("a I to")
			expect(results).toEqual([])
		})

		it("should handle contractions correctly", async () => {
			const results = await checkSpelling("don't can't won't")
			expect(results).toEqual([])
		})

		it("should detect misspelled words in a longer text", async () => {
			const text = "The quick brown fox jumps over the lazy dog. This sentense has a mispelling."
			const results = await checkSpelling(text)
			expect(results).toHaveLength(2)
			expect(results[0].word).toBe("sentense")
			expect(results[1].word).toBe("mispelling")
		})

		it("should handle technical terms correctly", async () => {
			const results = await checkSpelling("function variable const class method async await promise")
			expect(results).toEqual([])
		})

		it("should handle Roo-specific terms correctly", async () => {
			const results = await checkSpelling("roo chat message task workspace api token context prompt")
			expect(results).toEqual([])
		})
	})

	describe("debounce", () => {
		beforeEach(() => {
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.restoreAllMocks()
		})

		it("should debounce function calls", () => {
			const mockFn = vi.fn()
			const debouncedFn = debounce(mockFn, 100)

			// Call multiple times quickly
			debouncedFn("arg1")
			debouncedFn("arg2")
			debouncedFn("arg3")

			// Function should not have been called yet
			expect(mockFn).not.toHaveBeenCalled()

			// Fast forward time
			vi.advanceTimersByTime(100)

			// Function should have been called once with the last arguments
			expect(mockFn).toHaveBeenCalledTimes(1)
			expect(mockFn).toHaveBeenCalledWith("arg3")
		})

		it("should reset timer on each call", () => {
			const mockFn = vi.fn()
			const debouncedFn = debounce(mockFn, 100)

			debouncedFn("arg1")
			vi.advanceTimersByTime(50)

			debouncedFn("arg2")
			vi.advanceTimersByTime(50)

			// Function should not have been called yet
			expect(mockFn).not.toHaveBeenCalled()

			vi.advanceTimersByTime(50)

			// Function should have been called once with the last arguments
			expect(mockFn).toHaveBeenCalledTimes(1)
			expect(mockFn).toHaveBeenCalledWith("arg2")
		})
	})
})
