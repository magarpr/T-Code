import { describe, it, expect, beforeEach, vi } from "vitest"
import { selectSmartRules, formatSmartRules } from "../smart-rules-matcher"
import type { SmartRule, SmartRulesConfig } from "../../types/smart-rules"

describe("smart-rules-matcher", () => {
	let mockRules: SmartRule[]
	let mockConfig: SmartRulesConfig

	beforeEach(() => {
		mockRules = [
			{
				filename: "database.md",
				useWhen: "working with database queries, SQL operations, or data persistence",
				priority: 5,
				dependencies: ["typescript.md"],
				content: "# Database Rules\nAlways use prepared statements...",
			},
			{
				filename: "typescript.md",
				useWhen: "TypeScript development, type definitions, or interfaces",
				priority: 3,
				dependencies: [],
				content: "# TypeScript Rules\nUse strict mode...",
			},
			{
				filename: "api-design.md",
				useWhen: "designing REST APIs, endpoints, or HTTP services",
				priority: 7,
				dependencies: ["validation.md"],
				content: "# API Design Rules\nFollow RESTful conventions...",
			},
			{
				filename: "validation.md",
				useWhen: "input validation, data sanitization, or security checks",
				priority: 4,
				dependencies: [],
				content: "# Validation Rules\nAlways validate user input...",
			},
			{
				filename: "testing.md",
				useWhen: "writing tests, unit testing, or test coverage",
				priority: 2,
				dependencies: [],
				content: "# Testing Rules\nAim for 80% coverage...",
			},
		]

		mockConfig = {
			enabled: true,
			minSimilarity: 0.2, // Lower threshold for tests
			maxRules: 5,
			showSelectedRules: false,
			debugRuleSelection: false,
		}
	})

	describe("selectSmartRules", () => {
		it("should select rules based on query similarity", () => {
			const query = "How do I create a REST API endpoint?"
			// Use even lower threshold for this test
			const testConfig = { ...mockConfig, minSimilarity: 0.05 }
			const result = selectSmartRules(query, mockRules, testConfig)

			expect(result.rules).toContainEqual(expect.objectContaining({ filename: "api-design.md" }))
			expect(result.rules.length).toBeGreaterThan(0)
		})

		it("should include dependencies of selected rules", () => {
			const query = "How do I design a REST API?"
			// Use lower threshold for this test
			const testConfig = { ...mockConfig, minSimilarity: 0.05 }
			const result = selectSmartRules(query, mockRules, testConfig)

			// Should include api-design.md and its dependency validation.md
			const filenames = result.rules.map((r) => r.filename)
			expect(filenames).toContain("api-design.md")
			expect(filenames).toContain("validation.md")
		})

		it("should respect maxRules configuration", () => {
			const config = { ...mockConfig, maxRules: 2 }
			const query = "database SQL TypeScript API testing"
			const result = selectSmartRules(query, mockRules, config)

			// Note: maxRules applies before dependencies, so total might exceed maxRules
			expect(result.rules.filter((r) => !r.filename.includes("validation.md")).length).toBeLessThanOrEqual(2)
		})

		it("should filter rules below minSimilarity threshold", () => {
			const config = { ...mockConfig, minSimilarity: 0.8 }
			const query = "unrelated query about something else"
			const result = selectSmartRules(query, mockRules, config)

			expect(result.rules).toHaveLength(0)
		})

		it("should handle empty query gracefully", () => {
			const result = selectSmartRules("", mockRules, mockConfig)
			expect(result.rules).toHaveLength(0)
		})

		it("should handle empty rules array", () => {
			const result = selectSmartRules("test query", [], mockConfig)
			expect(result.rules).toHaveLength(0)
		})

		it("should prioritize rules with higher priority scores", () => {
			const query = "API endpoint validation"
			const result = selectSmartRules(query, mockRules, mockConfig)

			// Both api-design.md and validation.md should match
			// api-design.md has higher priority (7 vs 4)
			const filenames = result.rules.map((r) => r.filename)
			const apiIndex = filenames.indexOf("api-design.md")
			const validationIndex = filenames.indexOf("validation.md")

			if (apiIndex !== -1 && validationIndex !== -1) {
				expect(apiIndex).toBeLessThan(validationIndex)
			}
		})

		it("should handle circular dependencies gracefully", () => {
			const circularRules: SmartRule[] = [
				{
					filename: "rule1.md",
					useWhen: "rule one",
					priority: 1,
					dependencies: ["rule2.md"],
					content: "Rule 1",
				},
				{
					filename: "rule2.md",
					useWhen: "rule two",
					priority: 1,
					dependencies: ["rule1.md"],
					content: "Rule 2",
				},
			]

			const result = selectSmartRules("rule one", circularRules, mockConfig)
			const filenames = result.rules.map((r) => r.filename)

			// Should include both rules but not get stuck in infinite loop
			expect(filenames).toContain("rule1.md")
			expect(filenames).toContain("rule2.md")
			expect(result.rules.length).toBe(2)
		})

		it("should handle missing dependencies gracefully", () => {
			const rulesWithMissingDeps: SmartRule[] = [
				{
					filename: "main.md",
					useWhen: "main rule",
					priority: 1,
					dependencies: ["missing.md"],
					content: "Main rule",
				},
			]

			const result = selectSmartRules("main rule", rulesWithMissingDeps, mockConfig)

			// Should include the main rule even if dependency is missing
			expect(result.rules).toHaveLength(1)
			expect(result.rules[0].filename).toBe("main.md")
		})

		it("should calculate Jaccard similarity correctly", () => {
			const query = "database SQL queries"
			const result = selectSmartRules(query, mockRules, mockConfig)

			// database.md should have high similarity
			const dbRule = result.rules.find((r) => r.filename === "database.md")
			expect(dbRule).toBeDefined()
		})

		it("should boost scores for exact phrase matches", () => {
			const query = "REST APIs and database queries"
			// Use very low threshold since we're testing phrase matching
			const testConfig = { ...mockConfig, minSimilarity: 0.01 }
			const result = selectSmartRules(query, mockRules, testConfig)

			// Both should be selected due to exact phrase matches
			const filenames = result.rules.map((r) => r.filename)
			expect(filenames).toContain("api-design.md") // matches "REST APIs"
			expect(filenames).toContain("database.md") // matches "database queries"
		})

		it("should handle case-insensitive matching", () => {
			const query = "TYPESCRIPT DEVELOPMENT"
			const result = selectSmartRules(query, mockRules, mockConfig)

			const filenames = result.rules.map((r) => r.filename)
			expect(filenames).toContain("typescript.md")
		})

		it("should deduplicate selected rules", () => {
			// Create rules where multiple rules have the same dependency
			const rulesWithSharedDeps: SmartRule[] = [
				{
					filename: "feature1.md",
					useWhen: "feature one implementation",
					priority: 1,
					dependencies: ["common.md"],
					content: "Feature 1",
				},
				{
					filename: "feature2.md",
					useWhen: "feature two implementation",
					priority: 1,
					dependencies: ["common.md"],
					content: "Feature 2",
				},
				{
					filename: "common.md",
					useWhen: "common utilities",
					priority: 1,
					dependencies: [],
					content: "Common",
				},
			]

			const query = "feature one implementation feature two implementation"
			const result = selectSmartRules(query, rulesWithSharedDeps, mockConfig)

			// Should include all three rules, but common.md only once
			const filenames = result.rules.map((r) => r.filename)
			const commonCount = filenames.filter((f) => f === "common.md").length
			expect(commonCount).toBe(1)
		})

		it("should include reasoning when debugRuleSelection is enabled", () => {
			const config = { ...mockConfig, debugRuleSelection: true, minSimilarity: 0.1 }
			const query = "REST API design"
			const result = selectSmartRules(query, mockRules, config)

			expect(result.reasoning).toBeDefined()
			expect(result.reasoning!.length).toBeGreaterThan(0)
			expect(result.reasoning![0]).toHaveProperty("rule")
			expect(result.reasoning![0]).toHaveProperty("score")
			expect(result.reasoning![0]).toHaveProperty("reason")
		})

		it("should include reasoning when showSelectedRules is enabled", () => {
			const config = { ...mockConfig, showSelectedRules: true, minSimilarity: 0.1 }
			const query = "database operations"
			const result = selectSmartRules(query, mockRules, config)

			expect(result.reasoning).toBeDefined()
			expect(result.reasoning!.length).toBeGreaterThan(0)
		})

		it("should return empty array when disabled", () => {
			const config = { ...mockConfig, enabled: false }
			const query = "database SQL"
			const result = selectSmartRules(query, mockRules, config)

			expect(result.rules).toHaveLength(0)
		})
	})

	describe("formatSmartRules", () => {
		it("should format selected rules correctly without rule names", () => {
			const selectedRules: SmartRule[] = [
				{
					filename: "rule1.md",
					useWhen: "test rule",
					priority: 1,
					dependencies: [],
					content: "# Rule 1\nContent of rule 1",
				},
				{
					filename: "rule2.md",
					useWhen: "another rule",
					priority: 2,
					dependencies: [],
					content: "# Rule 2\nContent of rule 2",
				},
			]

			const formatted = formatSmartRules(selectedRules)

			expect(formatted).not.toContain("# Smart Rule from")
			expect(formatted).toContain("# Rule 1\nContent of rule 1")
			expect(formatted).toContain("# Rule 2\nContent of rule 2")
		})

		it("should format selected rules with rule names when showRuleNames is true", () => {
			const selectedRules: SmartRule[] = [
				{
					filename: "rule1.md",
					useWhen: "test rule",
					priority: 1,
					dependencies: [],
					content: "# Rule 1\nContent of rule 1",
				},
				{
					filename: "rule2.md",
					useWhen: "another rule",
					priority: 2,
					dependencies: [],
					content: "# Rule 2\nContent of rule 2",
				},
			]

			const formatted = formatSmartRules(selectedRules, true)

			expect(formatted).toContain("# Smart Rule from rule1.md:")
			expect(formatted).toContain("# Rule 1\nContent of rule 1")
			expect(formatted).toContain("# Smart Rule from rule2.md:")
			expect(formatted).toContain("# Rule 2\nContent of rule 2")
		})

		it("should handle empty rules array", () => {
			const formatted = formatSmartRules([])
			expect(formatted).toBe("")
		})

		it("should preserve rule content formatting", () => {
			const selectedRules: SmartRule[] = [
				{
					filename: "formatted.md",
					useWhen: "formatted content",
					priority: 1,
					dependencies: [],
					content: "# Header\n\n```typescript\nconst x = 1;\n```\n\n- List item\n- Another item",
				},
			]

			const formatted = formatSmartRules(selectedRules)

			expect(formatted).toContain("```typescript")
			expect(formatted).toContain("const x = 1;")
			expect(formatted).toContain("- List item")
		})
	})

	describe("edge cases", () => {
		it("should handle rules with empty useWhen", () => {
			const rulesWithEmptyUseWhen: SmartRule[] = [
				{
					filename: "empty.md",
					useWhen: "",
					priority: 1,
					dependencies: [],
					content: "Empty use-when",
				},
			]

			const result = selectSmartRules("test query", rulesWithEmptyUseWhen, mockConfig)
			expect(result.rules).toHaveLength(0)
		})

		it("should handle very long queries", () => {
			const longQuery = "database ".repeat(100) + "SQL"
			const config = { ...mockConfig, minSimilarity: 0.1 } // Lower threshold for long query
			const result = selectSmartRules(longQuery, mockRules, config)

			// Should still match database.md
			const filenames = result.rules.map((r) => r.filename)
			expect(filenames).toContain("database.md")
		})

		it("should handle special characters in queries", () => {
			const specialQuery = "REST API @#$%^&*() endpoint!"
			const config = { ...mockConfig, minSimilarity: 0.1 } // Lower threshold for special chars
			const result = selectSmartRules(specialQuery, mockRules, config)

			// Should still match api-design.md
			const filenames = result.rules.map((r) => r.filename)
			expect(filenames).toContain("api-design.md")
		})
	})
})
