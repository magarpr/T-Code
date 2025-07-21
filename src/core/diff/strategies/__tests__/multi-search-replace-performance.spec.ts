import { MultiSearchReplaceDiffStrategy } from "../multi-search-replace"
import { MultiFileSearchReplaceDiffStrategy } from "../multi-file-search-replace"
import { DiffResult } from "../../../../shared/tools"

describe("MultiSearchReplaceDiffStrategy Performance", () => {
	describe("large XML file handling", () => {
		let strategy: MultiSearchReplaceDiffStrategy
		let multiFileStrategy: MultiFileSearchReplaceDiffStrategy

		beforeEach(() => {
			strategy = new MultiSearchReplaceDiffStrategy(1.0, 40) // Default settings
			multiFileStrategy = new MultiFileSearchReplaceDiffStrategy(1.0, 40)
		})

		it("should handle large complex XML files without hanging", async () => {
			// Generate the large XML content from the issue
			const largeXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<root>
    <level1>
        <level2>
            <level3>
                <level4>
                    <level5>
                        <level6>
                            <level7>
                                <level8>
                                    <level9>
                                        <level10>
                                            <data>
                                                <item>Value 1</item>
                                                <item>Value 2</item>
                                                <item>Value 3</item>
                                                <nested>
                                                    <subnested>
                                                        <subsubnested>
                                                            <deep>This is deeply nested content</deep>
                                                            <deep>More content here</deep>
                                                            <deep>Even more content</deep>
                                                        </subsubnested>
                                                        <subsubnested>
                                                            <deep>Another deep element</deep>
                                                            <deep>And another one</deep>
                                                        </subsubnested>
                                                    </subnested>
                                                    <subnested>
                                                        <subsubnested>
                                                            <deep>More deeply nested</deep>
                                                            <deep>Content continues</deep>
                                                        </subsubnested>
                                                    </subnested>
                                                </nested>
                                                <item>Value 4</item>
                                                <item>Value 5</item>
                                                <complexPattern>
                                                    <!-- This pattern is designed to cause backtracking -->
                                                    <a><b><c><d><e><f><g><h><i><j>
                                                        <content>Complex nested structure</content>
                                                    </j></i></h></g></f></e></d></c></b></a>
                                                    <a><b><c><d><e><f><g><h><i><j>
                                                        <content>Another complex structure</content>
                                                    </j></i></h></g></f></e></d></c></b></a>
                                                </complexPattern>
                                            </data>
                                            <moreData>
                                                <repeatingPattern>Pattern A</repeatingPattern>
                                                <repeatingPattern>Pattern A</repeatingPattern>
                                                <repeatingPattern>Pattern A</repeatingPattern>
                                                <repeatingPattern>Pattern B</repeatingPattern>
                                                <repeatingPattern>Pattern B</repeatingPattern>
                                                <repeatingPattern>Pattern B</repeatingPattern>
                                                <ambiguousContent>
                                                    This content has multiple possible matches
                                                    and can cause the regex to try many combinations
                                                    especially when looking for specific patterns
                                                    =======
                                                    This looks like a separator but it's not
                                                    >>>>>>>
                                                    These patterns can confuse the regex
                                                    <<<<<<<
                                                    Causing it to backtrack extensively
                                                </ambiguousContent>
                                            </moreData>
                                        </level10>
                                    </level9>
                                </level8>
                            </level7>
                        </level6>
                    </level5>
                </level4>
            </level3>
        </level2>
    </level1>
</root>`

			// Create diff content to change Pattern A to Pattern X and Pattern B to Pattern Y
			const diffContent = `
<<<<<<< SEARCH
                                                <repeatingPattern>Pattern A</repeatingPattern>
                                                <repeatingPattern>Pattern A</repeatingPattern>
                                                <repeatingPattern>Pattern A</repeatingPattern>
                                                <repeatingPattern>Pattern B</repeatingPattern>
                                                <repeatingPattern>Pattern B</repeatingPattern>
                                                <repeatingPattern>Pattern B</repeatingPattern>
=======
                                                <repeatingPattern>Pattern X</repeatingPattern>
                                                <repeatingPattern>Pattern X</repeatingPattern>
                                                <repeatingPattern>Pattern X</repeatingPattern>
                                                <repeatingPattern>Pattern Y</repeatingPattern>
                                                <repeatingPattern>Pattern Y</repeatingPattern>
                                                <repeatingPattern>Pattern Y</repeatingPattern>
>>>>>>> REPLACE

<<<<<<< SEARCH
                                                        <content>Complex nested structure</content>
=======
                                                        <content>Updated nested structure</content>
>>>>>>> REPLACE`

			// Set a timeout to ensure the test doesn't hang indefinitely
			const startTime = Date.now()
			const timeout = 5000 // 5 seconds timeout

			const resultPromise = strategy.applyDiff(largeXmlContent, diffContent)

			// Use Promise.race to implement timeout
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error("Operation timed out")), timeout)
			})

			try {
				const result = await Promise.race([resultPromise, timeoutPromise])
				const endTime = Date.now()
				const duration = endTime - startTime

				// Ensure the operation completed within reasonable time
				expect(duration).toBeLessThan(timeout)

				// Verify the result
				const diffResult = result as DiffResult
				expect(diffResult).toBeDefined()
				expect(diffResult.success).toBe(true)
				if (diffResult.success && diffResult.content) {
					expect(diffResult.content).toContain("Pattern X")
					expect(diffResult.content).toContain("Pattern Y")
					expect(diffResult.content).toContain("Updated nested structure")
					expect(diffResult.content).not.toContain("Pattern A")
					expect(diffResult.content).not.toContain("Pattern B")
					expect(diffResult.content).not.toContain("Complex nested structure")
				}
			} catch (error) {
				if (error instanceof Error && error.message === "Operation timed out") {
					throw new Error("applyDiff operation timed out - this indicates the hanging issue")
				} else {
					throw error
				}
			}
		}, 10000) // Jest timeout of 10 seconds

		it("should handle multiple simultaneous edits on large XML files", async () => {
			// Test the multi-file strategy with the same large XML content
			const largeXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<root>
    <level1>
        <level2>
            <level3>
                <level4>
                    <level5>
                        <level6>
                            <level7>
                                <level8>
                                    <level9>
                                        <level10>
                                            <data>
                                                <item>Value 1</item>
                                                <item>Value 2</item>
                                                <item>Value 3</item>
                                                <nested>
                                                    <subnested>
                                                        <subsubnested>
                                                            <deep>This is deeply nested content</deep>
                                                            <deep>More content here</deep>
                                                            <deep>Even more content</deep>
                                                        </subsubnested>
                                                    </subnested>
                                                </nested>
                                                <item>Value 4</item>
                                                <item>Value 5</item>
                                                <complexPattern>
                                                    <a><b><c><d><e><f><g><h><i><j>
                                                        <content>Complex nested structure</content>
                                                    </j></i></h></g></f></e></d></c></b></a>
                                                </complexPattern>
                                            </data>
                                            <moreData>
                                                <repeatingPattern>Pattern A</repeatingPattern>
                                                <repeatingPattern>Pattern A</repeatingPattern>
                                                <repeatingPattern>Pattern A</repeatingPattern>
                                                <repeatingPattern>Pattern B</repeatingPattern>
                                                <repeatingPattern>Pattern B</repeatingPattern>
                                                <repeatingPattern>Pattern B</repeatingPattern>
                                            </moreData>
                                        </level10>
                                    </level9>
                                </level8>
                            </level7>
                        </level6>
                    </level5>
                </level4>
            </level3>
        </level2>
    </level1>
</root>`

			// Create multiple diff items
			const diffItems = [
				{
					content: `<<<<<<< SEARCH
                                                <repeatingPattern>Pattern A</repeatingPattern>
                                                <repeatingPattern>Pattern A</repeatingPattern>
                                                <repeatingPattern>Pattern A</repeatingPattern>
=======
                                                <repeatingPattern>Pattern X</repeatingPattern>
                                                <repeatingPattern>Pattern X</repeatingPattern>
                                                <repeatingPattern>Pattern X</repeatingPattern>
>>>>>>> REPLACE`,
					startLine: undefined,
				},
				{
					content: `<<<<<<< SEARCH
                                                <repeatingPattern>Pattern B</repeatingPattern>
                                                <repeatingPattern>Pattern B</repeatingPattern>
                                                <repeatingPattern>Pattern B</repeatingPattern>
=======
                                                <repeatingPattern>Pattern Y</repeatingPattern>
                                                <repeatingPattern>Pattern Y</repeatingPattern>
                                                <repeatingPattern>Pattern Y</repeatingPattern>
>>>>>>> REPLACE`,
					startLine: undefined,
				},
				{
					content: `<<<<<<< SEARCH
                                                        <content>Complex nested structure</content>
=======
                                                        <content>Updated nested structure</content>
>>>>>>> REPLACE`,
					startLine: undefined,
				},
			]

			const startTime = Date.now()
			const timeout = 5000 // 5 seconds timeout

			const resultPromise = multiFileStrategy.applyDiff(largeXmlContent, diffItems)

			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error("Operation timed out")), timeout)
			})

			try {
				const result = await Promise.race([resultPromise, timeoutPromise])
				const endTime = Date.now()
				const duration = endTime - startTime

				expect(duration).toBeLessThan(timeout)
				const diffResult = result as DiffResult
				expect(diffResult).toBeDefined()
				expect(diffResult.success).toBe(true)
				if (diffResult.success && diffResult.content) {
					expect(diffResult.content).toContain("Pattern X")
					expect(diffResult.content).toContain("Pattern Y")
					expect(diffResult.content).toContain("Updated nested structure")
				}
			} catch (error) {
				if (error instanceof Error && error.message === "Operation timed out") {
					throw new Error("Multi-file applyDiff operation timed out - this indicates the hanging issue")
				} else {
					throw error
				}
			}
		}, 10000)

		it("should handle pathological cases with many similar patterns", async () => {
			// Create content with many similar patterns that could cause excessive backtracking
			const lines = []
			for (let i = 0; i < 100; i++) {
				lines.push(`                    <pattern>Similar content ${i % 10}</pattern>`)
			}
			const pathologicalContent = lines.join("\n")

			// Try to replace a pattern in the middle
			const diffContent = `
<<<<<<< SEARCH
                    <pattern>Similar content 5</pattern>
=======
                    <pattern>Updated content 5</pattern>
>>>>>>> REPLACE`

			const startTime = Date.now()
			const result = await strategy.applyDiff(pathologicalContent, diffContent)
			const endTime = Date.now()
			const duration = endTime - startTime

			// Should complete quickly even with many similar patterns
			expect(duration).toBeLessThan(1000) // 1 second max
			expect(result.success).toBe(true)
			if (result.success && result.content) {
				// Should update exactly one occurrence
				const updatedCount = (result.content.match(/Updated content 5/g) || []).length
				expect(updatedCount).toBe(1)
			}
		})

		it("should handle deeply nested content with line number hints efficiently", async () => {
			const deeplyNestedXml = `<?xml version="1.0" encoding="UTF-8"?>
<root>
${Array(50)
	.fill(0)
	.map((_, i) => `    ${"    ".repeat(i)}<level${i}>`)
	.join("\n")}
${Array(50)
	.fill(0)
	.map((_, i) => `    ${"    ".repeat(49 - i)}<data>Content at level ${49 - i}</data>`)
	.join("\n")}
${Array(50)
	.fill(0)
	.map((_, i) => `    ${"    ".repeat(49 - i)}</level${49 - i}>`)
	.join("\n")}
</root>`

			// Try to replace content at a specific level with line number hint
			const diffContent = `
<<<<<<< SEARCH
:start_line:30
-------
                                                <data>Content at level 20</data>
=======
                                                <data>Updated content at level 20</data>
>>>>>>> REPLACE`

			const startTime = Date.now()
			const result = await strategy.applyDiff(deeplyNestedXml, diffContent)
			const endTime = Date.now()
			const duration = endTime - startTime

			// Should be fast with line number hint
			expect(duration).toBeLessThan(500) // 500ms max
			expect(result.success).toBe(true)
			if (result.success && result.content) {
				expect(result.content).toContain("Updated content at level 20")
				expect(result.content).not.toContain("<data>Content at level 20</data>")
			}
		})
	})
})
