// npx vitest run src/components/chat/__tests__/ContextCondenseRow.spec.tsx

import React from "react"
import { render, fireEvent } from "@/utils/test-utils"
import { ContextCondenseRow, CondensingContextRow, CondenseContextErrorRow } from "../ContextCondenseRow"

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

// Mock VSCode components
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeBadge: function MockVSCodeBadge({ children, className }: { children: React.ReactNode; className?: string }) {
		return <span className={className}>{children}</span>
	},
}))

// Mock Markdown component
vi.mock("../Markdown", () => ({
	Markdown: function MockMarkdown({ markdown }: { markdown: string }) {
		return <div data-testid="markdown">{markdown}</div>
	},
}))

// Mock ProgressIndicator component
vi.mock("../ProgressIndicator", () => ({
	ProgressIndicator: function MockProgressIndicator() {
		return <div data-testid="progress-indicator">Loading...</div>
	},
}))

describe("ContextCondenseRow", () => {
	it("renders with valid token values", () => {
		const { getByText } = render(
			<ContextCondenseRow
				cost={1.5}
				prevContextTokens={1000}
				newContextTokens={500}
				summary="Context condensed successfully"
			/>,
		)

		expect(getByText("chat:contextCondense.title")).toBeInTheDocument()
		expect(getByText(/1,000 → 500 tokens/)).toBeInTheDocument()
		expect(getByText("$1.50")).toBeInTheDocument()
	})

	it("handles null token values gracefully", () => {
		const { getByText } = render(
			<ContextCondenseRow
				cost={0}
				prevContextTokens={null as any}
				newContextTokens={null as any}
				summary="Context condensed"
			/>,
		)

		expect(getByText("chat:contextCondense.title")).toBeInTheDocument()
		// Should display "0" for null values
		expect(getByText(/0 → 0 tokens/)).toBeInTheDocument()
	})

	it("handles undefined token values gracefully", () => {
		const { getByText } = render(
			<ContextCondenseRow
				cost={undefined as any}
				prevContextTokens={undefined as any}
				newContextTokens={undefined as any}
				summary="Context condensed"
			/>,
		)

		expect(getByText("chat:contextCondense.title")).toBeInTheDocument()
		// Should display "0" for undefined values
		expect(getByText(/0 → 0 tokens/)).toBeInTheDocument()
		expect(getByText("$0.00")).toBeInTheDocument()
	})

	it("handles mixed null and valid token values", () => {
		const { getByText } = render(
			<ContextCondenseRow
				cost={2.5}
				prevContextTokens={2000}
				newContextTokens={null as any}
				summary="Context condensed"
			/>,
		)

		expect(getByText("chat:contextCondense.title")).toBeInTheDocument()
		// Should display "2,000 → 0 tokens" for mixed values
		expect(getByText(/2,000 → 0 tokens/)).toBeInTheDocument()
		expect(getByText("$2.50")).toBeInTheDocument()
	})

	it("expands and collapses when clicked", () => {
		const { getByText, queryByTestId } = render(
			<ContextCondenseRow
				cost={1.5}
				prevContextTokens={1000}
				newContextTokens={500}
				summary="Context condensed successfully"
			/>,
		)

		// Initially collapsed
		expect(queryByTestId("markdown")).not.toBeInTheDocument()

		// Click to expand
		const header = getByText("chat:contextCondense.title").parentElement?.parentElement
		fireEvent.click(header!)

		// Should show summary
		expect(queryByTestId("markdown")).toBeInTheDocument()
		expect(getByText("Context condensed successfully")).toBeInTheDocument()

		// Click to collapse
		fireEvent.click(header!)

		// Should hide summary
		expect(queryByTestId("markdown")).not.toBeInTheDocument()
	})

	it("hides badge when cost is 0", () => {
		const { container } = render(
			<ContextCondenseRow cost={0} prevContextTokens={1000} newContextTokens={500} summary="Context condensed" />,
		)

		const badge = container.querySelector(".opacity-0")
		expect(badge).toBeInTheDocument()
	})

	it("shows badge when cost is greater than 0", () => {
		const { container } = render(
			<ContextCondenseRow
				cost={1.5}
				prevContextTokens={1000}
				newContextTokens={500}
				summary="Context condensed"
			/>,
		)

		const badge = container.querySelector(".opacity-100")
		expect(badge).toBeInTheDocument()
	})
})

describe("CondensingContextRow", () => {
	it("renders with progress indicator", () => {
		const { getByText, getByTestId } = render(<CondensingContextRow />)

		expect(getByTestId("progress-indicator")).toBeInTheDocument()
		expect(getByText("chat:contextCondense.condensing")).toBeInTheDocument()
	})
})

describe("CondenseContextErrorRow", () => {
	it("renders with error text", () => {
		const errorText = "Failed to condense context: API error"
		const { getByText } = render(<CondenseContextErrorRow errorText={errorText} />)

		expect(getByText("chat:contextCondense.errorHeader")).toBeInTheDocument()
		expect(getByText(errorText)).toBeInTheDocument()
	})

	it("renders without error text", () => {
		const { getByText, queryByText } = render(<CondenseContextErrorRow />)

		expect(getByText("chat:contextCondense.errorHeader")).toBeInTheDocument()
		// Should not show any error text when not provided
		expect(queryByText(/Failed/)).not.toBeInTheDocument()
	})
})
