import { MultiTagXmlMatcher } from "../multi-tag-xml-matcher"

describe("MultiTagXmlMatcher", () => {
	it("should match content with <think> tags", () => {
		const matcher = new MultiTagXmlMatcher(["think", "thinking"])
		const input = "Before <think>This is thinking content</think> After"

		const results = matcher.update(input)
		const finalResults = matcher.final()

		const allResults = [...results, ...finalResults]

		// Check that we have thinking content
		const thinkingBlocks = allResults.filter((r) => r.matched)
		const textBlocks = allResults.filter((r) => !r.matched)

		expect(thinkingBlocks).toContainEqual({ matched: true, data: "This is thinking content" })
		expect(textBlocks.some((b) => b.data.includes("Before"))).toBe(true)
		expect(textBlocks.some((b) => b.data.includes("After"))).toBe(true)
	})

	it("should match content with <thinking> tags", () => {
		const matcher = new MultiTagXmlMatcher(["think", "thinking"])
		const input = "Before <thinking>This is thinking content</thinking> After"

		const results = matcher.update(input)
		const finalResults = matcher.final()

		const allResults = [...results, ...finalResults]

		// Check that we have thinking content
		const thinkingBlocks = allResults.filter((r) => r.matched)
		const textBlocks = allResults.filter((r) => !r.matched)

		expect(thinkingBlocks).toContainEqual({ matched: true, data: "This is thinking content" })
		expect(textBlocks.some((b) => b.data.includes("Before"))).toBe(true)
		expect(textBlocks.some((b) => b.data.includes("After"))).toBe(true)
	})

	it("should handle mixed tags in the same content", () => {
		const matcher = new MultiTagXmlMatcher(["think", "thinking"])
		const input = "Start <think>First thought</think> Middle <thinking>Second thought</thinking> End"

		const results = matcher.update(input)
		const finalResults = matcher.final()

		const allResults = [...results, ...finalResults]

		// The important thing is that both thinking blocks are captured
		const thinkingBlocks = allResults.filter((r) => r.matched)
		const textBlocks = allResults.filter((r) => !r.matched)

		expect(thinkingBlocks).toContainEqual({ matched: true, data: "First thought" })
		expect(thinkingBlocks).toContainEqual({ matched: true, data: "Second thought" })
		expect(textBlocks.some((b) => b.data.includes("Start"))).toBe(true)
		expect(textBlocks.some((b) => b.data.includes("Middle"))).toBe(true)
		expect(textBlocks.some((b) => b.data.includes("End"))).toBe(true)
	})

	it("should work with custom transform function", () => {
		const transform = (chunk: any) => ({
			type: chunk.matched ? "reasoning" : "text",
			text: chunk.data,
		})

		const matcher = new MultiTagXmlMatcher(["think", "thinking"], transform)
		const input = "Before <thinking>Reasoning here</thinking> After"

		const results = matcher.update(input)
		const finalResults = matcher.final()

		const allResults = [...results, ...finalResults]

		// Check that transform is applied
		const reasoningBlocks = allResults.filter((r) => r.type === "reasoning")
		const textBlocks = allResults.filter((r) => r.type === "text")

		expect(reasoningBlocks).toContainEqual({ type: "reasoning", text: "Reasoning here" })
		expect(textBlocks.length).toBeGreaterThan(0)
	})

	it("should handle empty tags", () => {
		const matcher = new MultiTagXmlMatcher(["think", "thinking"])
		const input = "Before <think></think> Middle <thinking></thinking> After"

		const results = matcher.update(input)
		const finalResults = matcher.final()

		const allResults = [...results, ...finalResults]

		// Empty tags should still be matched but with empty content
		const emptyBlocks = allResults.filter((r) => r.matched && r.data === "")
		expect(emptyBlocks.length).toBeGreaterThan(0)
	})
})
