import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { FavoriteButton } from "../FavoriteButton"
import { TooltipProvider } from "@/components/ui/tooltip"

const renderWithTooltipProvider = (component: React.ReactElement) => {
	return render(<TooltipProvider>{component}</TooltipProvider>)
}

describe("FavoriteButton", () => {
	it("renders unfavorited state by default", () => {
		const mockOnToggle = vi.fn()
		renderWithTooltipProvider(<FavoriteButton isFavorite={false} onToggleFavorite={mockOnToggle} />)

		const button = screen.getByTestId("favorite-button")
		expect(button).toBeInTheDocument()

		const icon = button.querySelector("span")
		expect(icon).toHaveClass("text-vscode-descriptionForeground")
		expect(icon).not.toHaveClass("text-yellow-400")
	})

	it("renders favorited state correctly", () => {
		const mockOnToggle = vi.fn()
		renderWithTooltipProvider(<FavoriteButton isFavorite={true} onToggleFavorite={mockOnToggle} />)

		const button = screen.getByTestId("favorite-button")
		expect(button).toBeInTheDocument()

		const icon = button.querySelector("span")
		expect(icon).toHaveClass("text-yellow-400")
		expect(icon).not.toHaveClass("text-vscode-descriptionForeground")
	})

	it("calls onToggleFavorite when clicked", () => {
		const mockOnToggle = vi.fn()
		renderWithTooltipProvider(<FavoriteButton isFavorite={false} onToggleFavorite={mockOnToggle} />)

		const button = screen.getByTestId("favorite-button")
		fireEvent.click(button)

		expect(mockOnToggle).toHaveBeenCalledTimes(1)
	})

	it("uses correct icon for unfavorited state", () => {
		const mockOnToggle = vi.fn()
		renderWithTooltipProvider(<FavoriteButton isFavorite={false} onToggleFavorite={mockOnToggle} />)

		const icon = screen.getByTestId("favorite-button").querySelector("span")
		expect(icon).toHaveClass("codicon-star-empty")
		expect(icon).not.toHaveClass("codicon-star-full")
	})

	it("uses correct icon for favorited state", () => {
		const mockOnToggle = vi.fn()
		renderWithTooltipProvider(<FavoriteButton isFavorite={true} onToggleFavorite={mockOnToggle} />)

		const icon = screen.getByTestId("favorite-button").querySelector("span")
		expect(icon).toHaveClass("codicon-star-full")
		expect(icon).not.toHaveClass("codicon-star-empty")
	})

	it("stops event propagation when clicked", () => {
		const mockOnToggle = vi.fn()
		const mockParentClick = vi.fn()

		render(
			<TooltipProvider>
				<div onClick={mockParentClick}>
					<FavoriteButton isFavorite={false} onToggleFavorite={mockOnToggle} />
				</div>
			</TooltipProvider>,
		)

		const button = screen.getByTestId("favorite-button")
		fireEvent.click(button)

		expect(mockOnToggle).toHaveBeenCalledTimes(1)
		expect(mockParentClick).not.toHaveBeenCalled()
	})
})
