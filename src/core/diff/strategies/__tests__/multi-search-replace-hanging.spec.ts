import { MultiSearchReplaceDiffStrategy } from "../multi-search-replace"
import { MultiFileSearchReplaceDiffStrategy } from "../multi-file-search-replace"
import { DiffResult } from "../../../../shared/tools"

describe("MultiSearchReplaceDiffStrategy Hanging Issue #4852", () => {
	describe("reproduce exact issue scenario", () => {
		let strategy: MultiSearchReplaceDiffStrategy
		let multiFileStrategy: MultiFileSearchReplaceDiffStrategy

		beforeEach(() => {
			// Use exact settings that might cause the issue
			strategy = new MultiSearchReplaceDiffStrategy(1.0, 40) // Exact match, 40 line buffer
			multiFileStrategy = new MultiFileSearchReplaceDiffStrategy(1.0, 40)
		})

		it("should handle the exact XML from issue #4852 without hanging", async () => {
			// This is the exact XML content from the issue
			const issueXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
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

			// Test multiple concurrent edits as described in the issue
			const diffItems = [
				{
					content: `<<<<<<< SEARCH
                                                <repeatingPattern>Pattern A</repeatingPattern>
=======
                                                <repeatingPattern>Pattern X</repeatingPattern>
>>>>>>> REPLACE`,
					startLine: undefined,
				},
				{
					content: `<<<<<<< SEARCH
                                                <repeatingPattern>Pattern B</repeatingPattern>
=======
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

			console.log("Starting multi-file diff application...")
			const startTime = Date.now()

			// Apply all diffs using the multi-file strategy
			const result = await multiFileStrategy.applyDiff(issueXmlContent, diffItems)

			const endTime = Date.now()
			const duration = endTime - startTime
			console.log(`Multi-file diff completed in ${duration}ms`)

			// Check that it completed in reasonable time
			expect(duration).toBeLessThan(2000) // 2 seconds max

			// Verify the result
			expect(result.success).toBe(true)
			if (result.success && result.content) {
				// Count occurrences
				const patternACount = (result.content.match(/Pattern A/g) || []).length
				const patternBCount = (result.content.match(/Pattern B/g) || []).length
				const patternXCount = (result.content.match(/Pattern X/g) || []).length
				const patternYCount = (result.content.match(/Pattern Y/g) || []).length

				// Should have replaced all occurrences
				expect(patternACount).toBe(0)
				expect(patternBCount).toBe(0)
				expect(patternXCount).toBe(3)
				expect(patternYCount).toBe(3)
				expect(result.content).toContain("Updated nested structure")
			}
		}, 10000) // 10 second timeout

		it("should handle worst-case scenario with ambiguous patterns", async () => {
			// Create a pathological case with many ambiguous patterns
			const lines = []

			// Add many similar lines that could match
			for (let i = 0; i < 200; i++) {
				lines.push(`                    <pattern>Similar content with slight variation ${i % 5}</pattern>`)
			}

			// Add the target in the middle
			lines.splice(100, 0, `                    <pattern>Target pattern to replace</pattern>`)

			// Add more similar lines
			for (let i = 0; i < 200; i++) {
				lines.push(`                    <pattern>More similar content ${i % 5}</pattern>`)
			}

			const pathologicalContent = lines.join("\n")

			// Try to replace without line number hint (worst case)
			const diffContent = `<<<<<<< SEARCH
                    <pattern>Target pattern to replace</pattern>
=======
                    <pattern>Successfully replaced target</pattern>
>>>>>>> REPLACE`

			console.log("Starting pathological case test...")
			const startTime = Date.now()

			const result = await strategy.applyDiff(pathologicalContent, diffContent)

			const endTime = Date.now()
			const duration = endTime - startTime
			console.log(`Pathological case completed in ${duration}ms`)

			// Should complete even in worst case
			expect(duration).toBeLessThan(5000) // 5 seconds max
			expect(result.success).toBe(true)
			if (result.success && result.content) {
				expect(result.content).toContain("Successfully replaced target")
				expect(result.content).not.toContain("Target pattern to replace")
			}
		}, 10000)

		it("should handle extremely deep nesting efficiently", async () => {
			// Create extremely deep nesting that could cause stack issues
			const depth = 100
			let content = '<?xml version="1.0" encoding="UTF-8"?>\n'

			// Open tags
			for (let i = 0; i < depth; i++) {
				content += `${"  ".repeat(i)}<level${i}>\n`
			}

			// Add content at deepest level
			content += `${"  ".repeat(depth)}<data>Deep content to replace</data>\n`

			// Close tags
			for (let i = depth - 1; i >= 0; i--) {
				content += `${"  ".repeat(i)}</level${i}>\n`
			}

			const diffContent = `<<<<<<< SEARCH
${"  ".repeat(depth)}<data>Deep content to replace</data>
=======
${"  ".repeat(depth)}<data>Replaced deep content</data>
>>>>>>> REPLACE`

			console.log("Starting deep nesting test...")
			const startTime = Date.now()

			const result = await strategy.applyDiff(content, diffContent)

			const endTime = Date.now()
			const duration = endTime - startTime
			console.log(`Deep nesting test completed in ${duration}ms`)

			expect(duration).toBeLessThan(1000) // Should be fast
			expect(result.success).toBe(true)
			if (result.success && result.content) {
				expect(result.content).toContain("Replaced deep content")
			}
		}, 10000)

		it("should handle the ambiguous content markers that look like diff markers", async () => {
			const contentWithFakeMarkers = `<root>
    <data>
        <item>Normal content</item>
        <ambiguous>
            This has fake markers
            =======
            Not a real separator
            >>>>>>>
            Also not real
            <<<<<<<
            Just content
        </ambiguous>
        <target>Replace this content</target>
    </data>
</root>`

			const diffContent = `<<<<<<< SEARCH
        <target>Replace this content</target>
=======
        <target>Successfully replaced</target>
>>>>>>> REPLACE`

			const result = await strategy.applyDiff(contentWithFakeMarkers, diffContent)

			expect(result.success).toBe(true)
			if (result.success && result.content) {
				expect(result.content).toContain("Successfully replaced")
				// Should not have affected the fake markers
				expect(result.content).toContain("=======")
				expect(result.content).toContain(">>>>>>>")
				expect(result.content).toContain("<<<<<<<")
			}
		})
	})
})
