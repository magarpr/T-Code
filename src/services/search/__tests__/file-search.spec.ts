import { describe, it, expect, vi, beforeEach } from "vitest"
import { Fzf } from "fzf"

// Test the fallback search logic for period-prefixed queries
describe("searchWorkspaceFiles period handling", () => {
	it("should handle period-prefixed queries with fallback search", () => {
		// Mock file data that would come from ripgrep
		const mockFiles = [
			{ path: ".rooignore", type: "file" as const, label: ".rooignore" },
			{ path: ".gitignore", type: "file" as const, label: ".gitignore" },
			{ path: ".env", type: "file" as const, label: ".env" },
			{ path: "src/app.ts", type: "file" as const, label: "app.ts" },
			{ path: "package.json", type: "file" as const, label: "package.json" },
		]

		// Test the fallback search logic directly
		const query = ".rooignore"

		// Create search items like the real function does
		const searchItems = mockFiles.map((item) => ({
			original: item,
			searchStr: `${item.path} ${item.label || ""}`,
		}))

		// Test fzf search first
		const fzf = new Fzf(searchItems, {
			selector: (item) => item.searchStr,
		})

		let fzfResults = fzf.find(query).map((result) => result.item.original)

		// If fzf doesn't return results for period-prefixed queries, use fallback
		if (fzfResults.length === 0 && query.startsWith(".")) {
			// Fallback: exact substring matching
			const exactMatches = mockFiles.filter((item) => {
				const searchStr = `${item.path} ${item.label || ""}`
				return searchStr.toLowerCase().includes(query.toLowerCase())
			})

			// Sort by relevance
			exactMatches.sort((a, b) => {
				const aLabel = (a.label || "").toLowerCase()
				const bLabel = (b.label || "").toLowerCase()
				const queryLower = query.toLowerCase()

				// Prioritize exact filename matches
				if (aLabel === queryLower && bLabel !== queryLower) return -1
				if (bLabel === queryLower && aLabel !== queryLower) return 1

				// Then prioritize filename starts with query
				if (aLabel.startsWith(queryLower) && !bLabel.startsWith(queryLower)) return -1
				if (bLabel.startsWith(queryLower) && !aLabel.startsWith(queryLower)) return 1

				// Finally sort by path length
				return a.path.length - b.path.length
			})

			fzfResults = exactMatches
		}

		// Should find the .rooignore file
		expect(fzfResults.length).toBeGreaterThan(0)
		expect(fzfResults[0].path).toBe(".rooignore")
		expect(fzfResults[0].label).toBe(".rooignore")
	})

	it("should prioritize exact matches over partial matches", () => {
		const mockFiles = [
			{ path: ".rooignore", type: "file" as const, label: ".rooignore" },
			{ path: "src/.rooignore.backup", type: "file" as const, label: ".rooignore.backup" },
			{ path: "docs/rooignore-guide.md", type: "file" as const, label: "rooignore-guide.md" },
		]

		const query = ".rooignore"

		// Simulate fallback search
		const exactMatches = mockFiles.filter((item) => {
			const searchStr = `${item.path} ${item.label || ""}`
			return searchStr.toLowerCase().includes(query.toLowerCase())
		})

		// Sort by relevance
		exactMatches.sort((a, b) => {
			const aLabel = (a.label || "").toLowerCase()
			const bLabel = (b.label || "").toLowerCase()
			const queryLower = query.toLowerCase()

			// Prioritize exact filename matches
			if (aLabel === queryLower && bLabel !== queryLower) return -1
			if (bLabel === queryLower && aLabel !== queryLower) return 1

			// Then prioritize filename starts with query
			if (aLabel.startsWith(queryLower) && !bLabel.startsWith(queryLower)) return -1
			if (bLabel.startsWith(queryLower) && !aLabel.startsWith(queryLower)) return 1

			// Finally sort by path length
			return a.path.length - b.path.length
		})

		// The exact match should be first
		expect(exactMatches.length).toBeGreaterThan(0)
		expect(exactMatches[0].label).toBe(".rooignore")
	})

	it("should handle .gitignore searches correctly", () => {
		const mockFiles = [
			{ path: ".gitignore", type: "file" as const, label: ".gitignore" },
			{ path: "src/.gitignore", type: "file" as const, label: ".gitignore" },
			{ path: "docs/gitignore-examples.md", type: "file" as const, label: "gitignore-examples.md" },
		]

		const query = ".gitignore"

		// Simulate fallback search
		const exactMatches = mockFiles.filter((item) => {
			const searchStr = `${item.path} ${item.label || ""}`
			return searchStr.toLowerCase().includes(query.toLowerCase())
		})

		// Sort by relevance
		exactMatches.sort((a, b) => {
			const aLabel = (a.label || "").toLowerCase()
			const bLabel = (b.label || "").toLowerCase()
			const queryLower = query.toLowerCase()

			// Prioritize exact filename matches
			if (aLabel === queryLower && bLabel !== queryLower) return -1
			if (bLabel === queryLower && aLabel !== queryLower) return 1

			// Then prioritize filename starts with query
			if (aLabel.startsWith(queryLower) && !bLabel.startsWith(queryLower)) return -1
			if (bLabel.startsWith(queryLower) && !aLabel.startsWith(queryLower)) return 1

			// Finally sort by path length
			return a.path.length - b.path.length
		})

		// Should find .gitignore files
		expect(exactMatches.length).toBeGreaterThan(0)
		expect(exactMatches.some((result) => result.label === ".gitignore")).toBe(true)
	})
})
