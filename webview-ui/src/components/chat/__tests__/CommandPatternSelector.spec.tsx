import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { CommandPatternSelector } from "../CommandPatternSelector"
import { TooltipProvider } from "../../../components/ui/tooltip"

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
	const defaultProps = {
		command: "npm install express",
		allowedCommands: ["npm install"],
		deniedCommands: ["git push"],
		onAllowCommandChange: vi.fn(),
		onDenyCommandChange: vi.fn(),
	}

	it("should render with command input", () => {
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

		// Check that the input is rendered with the command
		const input = screen.getByDisplayValue("npm install express")
		expect(input).toBeInTheDocument()
	})

	it("should allow editing the command", () => {
		render(
			<TestWrapper>
				<CommandPatternSelector {...defaultProps} />
			</TestWrapper>,
		)

		// Click to expand the component
		const expandButton = screen.getByRole("button", { name: /chat:commandExecution.expandManagement/i })
		fireEvent.click(expandButton)

		// Get the input and change its value
		const input = screen.getByDisplayValue("npm install express") as HTMLInputElement
		fireEvent.change(input, { target: { value: "npm install react" } })

		// Check that the input value has changed
		expect(input.value).toBe("npm install react")
	})

	it("should show allowed status for commands in allowed list", () => {
		const props = {
			...defaultProps,
			command: "npm install",
		}

		render(
			<TestWrapper>
				<CommandPatternSelector {...props} />
			</TestWrapper>,
		)

		// Click to expand the component
		const expandButton = screen.getByRole("button", { name: /chat:commandExecution.expandManagement/i })
		fireEvent.click(expandButton)

		// The allow button should have the active styling (we can check by aria-label)
		const allowButton = screen.getByRole("button", { name: /chat:commandExecution.removeFromAllowed/i })
		expect(allowButton).toBeInTheDocument()
	})

	it("should show denied status for commands in denied list", () => {
		const props = {
			...defaultProps,
			command: "git push",
		}

		render(
			<TestWrapper>
				<CommandPatternSelector {...props} />
			</TestWrapper>,
		)

		// Click to expand the component
		const expandButton = screen.getByRole("button", { name: /chat:commandExecution.expandManagement/i })
		fireEvent.click(expandButton)

		// The deny button should have the active styling (we can check by aria-label)
		const denyButton = screen.getByRole("button", { name: /chat:commandExecution.removeFromDenied/i })
		expect(denyButton).toBeInTheDocument()
	})

	it("should call onAllowCommandChange when allow button is clicked", () => {
		const mockOnAllowCommandChange = vi.fn()
		const props = {
			...defaultProps,
			onAllowCommandChange: mockOnAllowCommandChange,
		}

		render(
			<TestWrapper>
				<CommandPatternSelector {...props} />
			</TestWrapper>,
		)

		// Click to expand the component
		const expandButton = screen.getByRole("button", { name: /chat:commandExecution.expandManagement/i })
		fireEvent.click(expandButton)

		// Click the allow button
		const allowButton = screen.getByRole("button", { name: /chat:commandExecution.addToAllowed/i })
		fireEvent.click(allowButton)

		// Check that the callback was called with the command
		expect(mockOnAllowCommandChange).toHaveBeenCalledWith("npm install express")
	})

	it("should call onDenyCommandChange when deny button is clicked", () => {
		const mockOnDenyCommandChange = vi.fn()
		const props = {
			...defaultProps,
			onDenyCommandChange: mockOnDenyCommandChange,
		}

		render(
			<TestWrapper>
				<CommandPatternSelector {...props} />
			</TestWrapper>,
		)

		// Click to expand the component
		const expandButton = screen.getByRole("button", { name: /chat:commandExecution.expandManagement/i })
		fireEvent.click(expandButton)

		// Click the deny button
		const denyButton = screen.getByRole("button", { name: /chat:commandExecution.addToDenied/i })
		fireEvent.click(denyButton)

		// Check that the callback was called with the command
		expect(mockOnDenyCommandChange).toHaveBeenCalledWith("npm install express")
	})

	it("should use edited command value when buttons are clicked", () => {
		const mockOnAllowCommandChange = vi.fn()
		const props = {
			...defaultProps,
			onAllowCommandChange: mockOnAllowCommandChange,
		}

		render(
			<TestWrapper>
				<CommandPatternSelector {...props} />
			</TestWrapper>,
		)

		// Click to expand the component
		const expandButton = screen.getByRole("button", { name: /chat:commandExecution.expandManagement/i })
		fireEvent.click(expandButton)

		// Edit the command
		const input = screen.getByDisplayValue("npm install express") as HTMLInputElement
		fireEvent.change(input, { target: { value: "npm install react" } })

		// Click the allow button
		const allowButton = screen.getByRole("button", { name: /chat:commandExecution.addToAllowed/i })
		fireEvent.click(allowButton)

		// Check that the callback was called with the edited command
		expect(mockOnAllowCommandChange).toHaveBeenCalledWith("npm install react")
	})
})
