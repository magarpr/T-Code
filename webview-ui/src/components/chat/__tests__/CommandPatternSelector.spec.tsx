import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { CommandPatternSelector } from "../CommandPatternSelector"
import { TooltipProvider } from "../../../components/ui/tooltip"

interface CommandPattern {
	pattern: string
	description?: string
}

// Mock react-i18next
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	Trans: ({ i18nKey, children }: any) => <span>{i18nKey || children}</span>,
}))

// Mock VSCodeLink
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeLink: ({ children, onClick }: any) => (
		<a href="#" onClick={onClick}>
			{children}
		</a>
	),
}))

// Wrapper component with TooltipProvider
const TestWrapper = ({ children }: { children: React.ReactNode }) => <TooltipProvider>{children}</TooltipProvider>

describe("CommandPatternSelector", () => {
	const mockPatterns: CommandPattern[] = [
		{ pattern: "npm", description: "npm commands" },
		{ pattern: "npm install", description: "npm install commands" },
		{ pattern: "git", description: "git commands" },
	]

	const defaultProps = {
		patterns: mockPatterns,
		allowedCommands: ["npm"],
		deniedCommands: ["git"],
		onAllowPatternChange: vi.fn(),
		onDenyPatternChange: vi.fn(),
	}

	it("should render with unique pattern keys", () => {
		const { container } = render(
			<TestWrapper>
				<CommandPatternSelector {...defaultProps} />
			</TestWrapper>,
		)

		// The component should render without errors
		expect(container).toBeTruthy()

		// Click to expand the component
		const expandButton = screen.getByRole("button", { name: /chat:commandExecution.expandManagement/i })
		fireEvent.click(expandButton)

		// Check that patterns are rendered
		expect(screen.getByText("npm")).toBeInTheDocument()
		expect(screen.getByText("npm install")).toBeInTheDocument()
		expect(screen.getByText("git")).toBeInTheDocument()
	})

	it("should handle duplicate patterns gracefully", () => {
		// Test with duplicate patterns to ensure keys are still unique
		const duplicatePatterns: CommandPattern[] = [
			{ pattern: "npm", description: "npm commands" },
			{ pattern: "npm", description: "duplicate npm commands" }, // Duplicate pattern
			{ pattern: "git", description: "git commands" },
		]

		const props = {
			...defaultProps,
			patterns: duplicatePatterns,
		}

		// This should not throw an error even with duplicate patterns
		const { container } = render(
			<TestWrapper>
				<CommandPatternSelector {...props} />
			</TestWrapper>,
		)
		expect(container).toBeTruthy()

		// Click to expand the component
		const expandButton = screen.getByRole("button", { name: /chat:commandExecution.expandManagement/i })
		fireEvent.click(expandButton)

		// Both instances of "npm" should be rendered
		const npmElements = screen.getAllByText("npm")
		expect(npmElements).toHaveLength(2)
	})
})
