import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { RenameButton } from "../RenameButton"
import { TooltipProvider } from "@/components/ui/tooltip"

const renderWithTooltipProvider = (component: React.ReactElement) => {
	return render(<TooltipProvider>{component}</TooltipProvider>)
}

describe("RenameButton", () => {
	it("renders rename button by default", () => {
		const mockOnRename = vi.fn()
		renderWithTooltipProvider(<RenameButton currentName="Test Task" onRename={mockOnRename} />)

		const button = screen.getByTestId("rename-button")
		expect(button).toBeInTheDocument()
	})

	it("shows input field when edit mode is activated", () => {
		const mockOnRename = vi.fn()
		renderWithTooltipProvider(<RenameButton currentName="Test Task" onRename={mockOnRename} />)

		const button = screen.getByTestId("rename-button")
		fireEvent.click(button)

		const input = screen.getByTestId("rename-input")
		expect(input).toBeInTheDocument()
		expect(input).toHaveValue("Test Task")
	})

	it("shows save and cancel buttons in edit mode", () => {
		const mockOnRename = vi.fn()
		renderWithTooltipProvider(<RenameButton currentName="Test Task" onRename={mockOnRename} />)

		const button = screen.getByTestId("rename-button")
		fireEvent.click(button)

		const saveButton = screen.getByTestId("rename-save")
		const cancelButton = screen.getByTestId("rename-cancel")

		expect(saveButton).toBeInTheDocument()
		expect(cancelButton).toBeInTheDocument()
	})

	it("cancels edit mode when cancel button is clicked", () => {
		const mockOnRename = vi.fn()
		renderWithTooltipProvider(<RenameButton currentName="Test Task" onRename={mockOnRename} />)

		const button = screen.getByTestId("rename-button")
		fireEvent.click(button)

		const cancelButton = screen.getByTestId("rename-cancel")
		fireEvent.click(cancelButton)

		expect(mockOnRename).not.toHaveBeenCalled()
		expect(screen.getByTestId("rename-button")).toBeInTheDocument()
	})

	it("does not call onRename when value is unchanged", () => {
		const mockOnRename = vi.fn()
		renderWithTooltipProvider(<RenameButton currentName="Test Task" onRename={mockOnRename} />)

		const button = screen.getByTestId("rename-button")
		fireEvent.click(button)

		const input = screen.getByTestId("rename-input")
		fireEvent.keyDown(input, { key: "Enter" })

		expect(mockOnRename).not.toHaveBeenCalled()
	})

	it("stops event propagation when editing", () => {
		const mockOnRename = vi.fn()
		const mockParentClick = vi.fn()

		render(
			<TooltipProvider>
				<div onClick={mockParentClick}>
					<RenameButton currentName="Test Task" onRename={mockOnRename} />
				</div>
			</TooltipProvider>,
		)

		const button = screen.getByTestId("rename-button")
		fireEvent.click(button)

		const editContainer = screen.getByTestId("rename-input").parentElement
		fireEvent.click(editContainer!)

		expect(mockParentClick).not.toHaveBeenCalled()
	})

	it("cancels edit mode when Escape key is pressed", () => {
		const mockOnRename = vi.fn()
		renderWithTooltipProvider(<RenameButton currentName="Test Task" onRename={mockOnRename} />)

		const button = screen.getByTestId("rename-button")
		fireEvent.click(button)

		const input = screen.getByTestId("rename-input")
		fireEvent.keyDown(input, { key: "Escape" })

		expect(mockOnRename).not.toHaveBeenCalled()
		expect(screen.getByTestId("rename-button")).toBeInTheDocument()
	})
})
