import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { vi } from "vitest"
import QueuedMessages from "../QueuedMessages"
import { QueuedMessage } from "@roo-code/types"

// Mock react-i18next
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

// Mock the Mention component
vi.mock("../Mention", () => ({
	Mention: ({ text }: { text: string }) => <span data-testid="mention">{text}</span>,
}))

// Mock the Thumbnails component
vi.mock("../common/Thumbnails", () => ({
	default: ({ images }: { images: string[] }) => <div data-testid="thumbnails">{images.length} images</div>,
}))

// Mock the Button component
vi.mock("@src/components/ui", () => ({
	Button: ({ children, onClick, ...props }: any) => (
		<button onClick={onClick} {...props}>
			{children}
		</button>
	),
}))

describe("QueuedMessages", () => {
	const mockOnRemove = vi.fn()
	const mockOnUpdate = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders nothing when queue is empty", () => {
		const { container } = render(<QueuedMessages queue={[]} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)
		expect(container.firstChild).toBeNull()
	})

	it("renders queued messages", () => {
		const queue: QueuedMessage[] = [
			{
				id: "1",
				text: "Test message 1",
				images: [],
			},
			{
				id: "2",
				text: "Test message 2",
				images: ["image1.png"],
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		expect(screen.getByTestId("queued-messages")).toBeInTheDocument()
		expect(screen.getByText("queuedMessages.title")).toBeInTheDocument()
		expect(screen.getAllByTestId("mention")).toHaveLength(2)
	})

	it("calls onRemove when delete button is clicked", () => {
		const queue: QueuedMessage[] = [
			{
				id: "1",
				text: "Test message",
				images: [],
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		const deleteButton = screen.getByRole("button")
		fireEvent.click(deleteButton)

		expect(mockOnRemove).toHaveBeenCalledWith(0)
	})

	it("enters edit mode when message is clicked", () => {
		const queue: QueuedMessage[] = [
			{
				id: "1",
				text: "Test message",
				images: [],
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		const messageElement = screen.getByTestId("mention").parentElement
		fireEvent.click(messageElement!)

		expect(screen.getByRole("textbox")).toBeInTheDocument()
	})

	it("calls onUpdate when edit is saved", () => {
		const queue: QueuedMessage[] = [
			{
				id: "1",
				text: "Test message",
				images: [],
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		// Enter edit mode
		const messageElement = screen.getByTestId("mention").parentElement
		fireEvent.click(messageElement!)

		// Edit the text
		const textarea = screen.getByRole("textbox")
		fireEvent.change(textarea, { target: { value: "Updated message" } })

		// Save by pressing Enter
		fireEvent.keyDown(textarea, { key: "Enter" })

		expect(mockOnUpdate).toHaveBeenCalledWith(0, "Updated message")
	})

	it("cancels edit when Escape is pressed", () => {
		const queue: QueuedMessage[] = [
			{
				id: "1",
				text: "Test message",
				images: [],
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		// Enter edit mode
		const messageElement = screen.getByTestId("mention").parentElement
		fireEvent.click(messageElement!)

		// Edit the text
		const textarea = screen.getByRole("textbox")
		fireEvent.change(textarea, { target: { value: "Updated message" } })

		// Cancel by pressing Escape
		fireEvent.keyDown(textarea, { key: "Escape" })

		// Should not call onUpdate and should exit edit mode
		expect(mockOnUpdate).not.toHaveBeenCalled()
		expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
	})

	it("renders thumbnails for messages with images", () => {
		const queue: QueuedMessage[] = [
			{
				id: "1",
				text: "Message with images",
				images: ["image1.png", "image2.png"],
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		// Check that images are rendered (the actual Thumbnails component renders img elements)
		const images = screen.getAllByRole("img")
		expect(images).toHaveLength(2)
		expect(images[0]).toHaveAttribute("src", "image1.png")
		expect(images[1]).toHaveAttribute("src", "image2.png")
	})
})
