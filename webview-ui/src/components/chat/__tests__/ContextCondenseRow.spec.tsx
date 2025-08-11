import { render, fireEvent, screen } from "@/utils/test-utils"
import { ContextCondenseRow, CondensingContextRow, CondenseContextErrorRow } from "../ContextCondenseRow"

// Mock the translation hook
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				"chat:contextCondense.title": "Context Condensed",
				"chat:contextCondense.condensing": "Condensing context...",
				"chat:contextCondense.errorHeader": "Context condensation failed",
				tokens: "tokens",
			}
			return translations[key] || key
		},
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
}))

describe("ContextCondenseRow", () => {
	describe("with valid data", () => {
		const defaultProps = {
			cost: 0.05,
			prevContextTokens: 1000,
			newContextTokens: 500,
			summary: "Context has been condensed successfully",
		}

		it("should render without crashing", () => {
			const { container } = render(<ContextCondenseRow {...defaultProps} />)
			expect(container).toBeInTheDocument()
		})

		it("should display token counts correctly", () => {
			render(<ContextCondenseRow {...defaultProps} />)
			// The component should display "1,000 → 500 tokens"
			expect(screen.getByText(/1,000/)).toBeInTheDocument()
			expect(screen.getByText(/500/)).toBeInTheDocument()
		})

		it("should display cost when greater than 0", () => {
			render(<ContextCondenseRow {...defaultProps} />)
			expect(screen.getByText("$0.05")).toBeInTheDocument()
		})

		it("should hide cost badge when cost is 0", () => {
			const { container } = render(<ContextCondenseRow {...defaultProps} cost={0} />)
			const badge = container.querySelector("vscode-badge")
			expect(badge).toHaveClass("opacity-0")
		})

		it("should expand and show summary when clicked", () => {
			const { container } = render(<ContextCondenseRow {...defaultProps} />)

			// Summary should not be visible initially
			expect(screen.queryByText(defaultProps.summary)).not.toBeInTheDocument()

			// Click to expand - find the clickable div
			const expandButton = container.querySelector(".cursor-pointer")
			fireEvent.click(expandButton!)

			// Summary should now be visible
			expect(screen.getByText(defaultProps.summary)).toBeInTheDocument()
		})

		it("should toggle chevron icon when expanded/collapsed", () => {
			const { container } = render(<ContextCondenseRow {...defaultProps} />)

			// Initially should show chevron-down
			expect(container.querySelector(".codicon-chevron-down")).toBeInTheDocument()
			expect(container.querySelector(".codicon-chevron-up")).not.toBeInTheDocument()

			// Click to expand
			const expandButton = container.querySelector(".cursor-pointer")
			fireEvent.click(expandButton!)

			// Should now show chevron-up
			expect(container.querySelector(".codicon-chevron-up")).toBeInTheDocument()
			expect(container.querySelector(".codicon-chevron-down")).not.toBeInTheDocument()
		})
	})

	describe("with null/undefined values", () => {
		it("should handle null prevContextTokens without crashing", () => {
			const props = {
				cost: 0.05,
				prevContextTokens: null as any,
				newContextTokens: 500,
				summary: "Context condensed",
			}

			const { container } = render(<ContextCondenseRow {...props} />)
			expect(container).toBeInTheDocument()
			// Should display 0 instead of null
			expect(screen.getByText(/0 →/)).toBeInTheDocument()
		})

		it("should handle null newContextTokens without crashing", () => {
			const props = {
				cost: 0.05,
				prevContextTokens: 1000,
				newContextTokens: null as any,
				summary: "Context condensed",
			}

			const { container } = render(<ContextCondenseRow {...props} />)
			expect(container).toBeInTheDocument()
			// Should display 0 instead of null
			expect(screen.getByText(/→ 0/)).toBeInTheDocument()
		})

		it("should handle both tokens being null without crashing", () => {
			const props = {
				cost: 0.05,
				prevContextTokens: null as any,
				newContextTokens: null as any,
				summary: "Context condensed",
			}

			const { container } = render(<ContextCondenseRow {...props} />)
			expect(container).toBeInTheDocument()
			// Should display "0 → 0 tokens"
			expect(screen.getByText(/0 → 0/)).toBeInTheDocument()
		})

		it("should handle undefined prevContextTokens without crashing", () => {
			const props = {
				cost: 0.05,
				prevContextTokens: undefined as any,
				newContextTokens: 500,
				summary: "Context condensed",
			}

			const { container } = render(<ContextCondenseRow {...props} />)
			expect(container).toBeInTheDocument()
			// Should display 0 instead of undefined
			expect(screen.getByText(/0 →/)).toBeInTheDocument()
		})

		it("should handle undefined newContextTokens without crashing", () => {
			const props = {
				cost: 0.05,
				prevContextTokens: 1000,
				newContextTokens: undefined as any,
				summary: "Context condensed",
			}

			const { container } = render(<ContextCondenseRow {...props} />)
			expect(container).toBeInTheDocument()
			// Should display 0 instead of undefined
			expect(screen.getByText(/→ 0/)).toBeInTheDocument()
		})

		it("should handle null cost without crashing", () => {
			const props = {
				cost: null as any,
				prevContextTokens: 1000,
				newContextTokens: 500,
				summary: "Context condensed",
			}

			const { container } = render(<ContextCondenseRow {...props} />)
			expect(container).toBeInTheDocument()
			// Should display $0.00 for null cost
			expect(screen.getByText("$0.00")).toBeInTheDocument()
		})

		it("should handle undefined cost without crashing", () => {
			const props = {
				cost: undefined as any,
				prevContextTokens: 1000,
				newContextTokens: 500,
				summary: "Context condensed",
			}

			const { container } = render(<ContextCondenseRow {...props} />)
			expect(container).toBeInTheDocument()
			// Should display $0.00 for undefined cost
			expect(screen.getByText("$0.00")).toBeInTheDocument()
		})
	})

	describe("edge cases", () => {
		it("should handle very large token numbers", () => {
			const props = {
				cost: 100.99,
				prevContextTokens: 1000000,
				newContextTokens: 500000,
				summary: "Large context condensed",
			}

			render(<ContextCondenseRow {...props} />)
			// Should format large numbers with commas
			expect(screen.getByText(/1,000,000/)).toBeInTheDocument()
			expect(screen.getByText(/500,000/)).toBeInTheDocument()
		})

		it("should handle negative token numbers gracefully", () => {
			const props = {
				cost: 0.05,
				prevContextTokens: -100,
				newContextTokens: -50,
				summary: "Negative tokens",
			}

			render(<ContextCondenseRow {...props} />)
			// Should still render without crashing
			expect(screen.getByText(/-100/)).toBeInTheDocument()
			expect(screen.getByText(/-50/)).toBeInTheDocument()
		})

		it("should handle empty summary", () => {
			const props = {
				cost: 0.05,
				prevContextTokens: 1000,
				newContextTokens: 500,
				summary: "",
			}

			const { container } = render(<ContextCondenseRow {...props} />)

			// Click to expand
			const expandButton = container.querySelector(".cursor-pointer")
			fireEvent.click(expandButton!)

			// Should show the expanded area even with empty summary
			const expandedArea = container.querySelector(".bg-vscode-editor-background")
			expect(expandedArea).toBeInTheDocument()
		})
	})
})

describe("CondensingContextRow", () => {
	it("should render without crashing", () => {
		const { container } = render(<CondensingContextRow />)
		expect(container).toBeInTheDocument()
	})

	it("should display condensing message", () => {
		render(<CondensingContextRow />)
		expect(screen.getByText("Condensing context...")).toBeInTheDocument()
	})

	it("should show progress indicator", () => {
		const { container } = render(<CondensingContextRow />)
		// Check for the compress icon
		expect(container.querySelector(".codicon-compress")).toBeInTheDocument()
	})
})

describe("CondenseContextErrorRow", () => {
	it("should render without crashing", () => {
		const { container } = render(<CondenseContextErrorRow />)
		expect(container).toBeInTheDocument()
	})

	it("should display error header", () => {
		render(<CondenseContextErrorRow />)
		expect(screen.getByText("Context condensation failed")).toBeInTheDocument()
	})

	it("should display custom error text when provided", () => {
		const errorText = "Failed to condense context due to API error"
		render(<CondenseContextErrorRow errorText={errorText} />)
		expect(screen.getByText(errorText)).toBeInTheDocument()
	})

	it("should show warning icon", () => {
		const { container } = render(<CondenseContextErrorRow />)
		expect(container.querySelector(".codicon-warning")).toBeInTheDocument()
	})

	it("should handle undefined error text", () => {
		const { container } = render(<CondenseContextErrorRow errorText={undefined} />)
		expect(container).toBeInTheDocument()
		// Should still show the header
		expect(screen.getByText("Context condensation failed")).toBeInTheDocument()
	})
})
