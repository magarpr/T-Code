// npx vitest run src/components/chat/__tests__/QueuedMessages.spec.tsx

import React from "react"
import { render, screen, fireEvent } from "@/utils/test-utils"
import QueuedMessages from "../QueuedMessages"
import { QueuedMessage } from "@roo-code/types"

// Mock the Thumbnails component
vi.mock("../../common/Thumbnails", () => ({
	default: function MockThumbnails({ images, style }: { images: string[]; style?: React.CSSProperties }) {
		return (
			<div data-testid="thumbnails" style={style}>
				{images.map((img, idx) => (
					<img key={idx} src={img} alt={`Thumbnail ${idx + 1}`} data-testid={`thumbnail-${idx}`} />
				))}
			</div>
		)
	},
}))

// Mock the Mention component
vi.mock("../Mention", () => ({
	Mention: function MockMention({ text }: { text: string }) {
		return <span data-testid="mention">{text}</span>
	},
}))

describe("QueuedMessages", () => {
	const mockOnRemove = vi.fn()
	const mockOnUpdate = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should not render when queue is empty", () => {
		const { container } = render(<QueuedMessages queue={[]} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)
		expect(container.firstChild).toBeNull()
	})

	it("should render queued messages without images", () => {
		const queue: QueuedMessage[] = [
			{
				id: "msg-1",
				text: "Test message 1",
				images: [],
			},
			{
				id: "msg-2",
				text: "Test message 2",
				images: [],
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		expect(screen.getByText("queuedMessages.title")).toBeInTheDocument()
		expect(screen.getByText("Test message 1")).toBeInTheDocument()
		expect(screen.getByText("Test message 2")).toBeInTheDocument()
		expect(screen.queryByTestId("thumbnails")).not.toBeInTheDocument()
	})

	it("should render queued messages with images", () => {
		const queue: QueuedMessage[] = [
			{
				id: "msg-1",
				text: "Message with images",
				images: ["data:image/png;base64,image1", "data:image/png;base64,image2"],
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		expect(screen.getByText("Message with images")).toBeInTheDocument()
		expect(screen.getByTestId("thumbnails")).toBeInTheDocument()
		expect(screen.getByTestId("thumbnail-0")).toHaveAttribute("src", "data:image/png;base64,image1")
		expect(screen.getByTestId("thumbnail-1")).toHaveAttribute("src", "data:image/png;base64,image2")
	})

	it("should render multiple messages with mixed content (some with images, some without)", () => {
		const queue: QueuedMessage[] = [
			{
				id: "msg-1",
				text: "Text only message",
				images: [],
			},
			{
				id: "msg-2",
				text: "Message with one image",
				images: ["data:image/png;base64,singleimage"],
			},
			{
				id: "msg-3",
				text: "Message with multiple images",
				images: ["data:image/png;base64,img1", "data:image/png;base64,img2", "data:image/png;base64,img3"],
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		// Check all messages are rendered
		expect(screen.getByText("Text only message")).toBeInTheDocument()
		expect(screen.getByText("Message with one image")).toBeInTheDocument()
		expect(screen.getByText("Message with multiple images")).toBeInTheDocument()

		// Check thumbnails are rendered for messages with images
		const thumbnailContainers = screen.getAllByTestId("thumbnails")
		expect(thumbnailContainers).toHaveLength(2) // Only msg-2 and msg-3 have images

		// Verify the correct number of images in each container
		const allThumbnails = screen.getAllByTestId(/^thumbnail-/)
		expect(allThumbnails).toHaveLength(4) // 1 + 3 images total
	})

	it("should handle remove action", () => {
		const queue: QueuedMessage[] = [
			{
				id: "msg-1",
				text: "Test message",
				images: ["data:image/png;base64,testimage"],
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		const removeButton = screen.getByRole("button")
		fireEvent.click(removeButton)

		expect(mockOnRemove).toHaveBeenCalledWith(0)
	})

	it("should handle edit action", () => {
		const queue: QueuedMessage[] = [
			{
				id: "msg-1",
				text: "Original text",
				images: [],
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		// Click on the message to edit
		const messageText = screen.getByText("Original text")
		fireEvent.click(messageText)

		// Find the textarea and change its value
		const textarea = screen.getByPlaceholderText("chat:editMessage.placeholder")
		fireEvent.change(textarea, { target: { value: "Updated text" } })
		fireEvent.blur(textarea)

		expect(mockOnUpdate).toHaveBeenCalledWith(0, "Updated text")
	})

	it("should preserve images when editing message text", () => {
		const queue: QueuedMessage[] = [
			{
				id: "msg-1",
				text: "Message with image",
				images: ["data:image/png;base64,preservedimage"],
			},
		]

		const { rerender } = render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		// Verify image is initially rendered
		expect(screen.getByTestId("thumbnails")).toBeInTheDocument()
		expect(screen.getByTestId("thumbnail-0")).toHaveAttribute("src", "data:image/png;base64,preservedimage")

		// Click to edit
		const messageText = screen.getByText("Message with image")
		fireEvent.click(messageText)

		// Update text
		const textarea = screen.getByPlaceholderText("chat:editMessage.placeholder")
		fireEvent.change(textarea, { target: { value: "Updated message with image" } })
		fireEvent.blur(textarea)

		// Simulate the parent component updating the queue
		const updatedQueue: QueuedMessage[] = [
			{
				id: "msg-1",
				text: "Updated message with image",
				images: ["data:image/png;base64,preservedimage"],
			},
		]

		rerender(<QueuedMessages queue={updatedQueue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		// Verify image is still rendered after edit
		expect(screen.getByTestId("thumbnails")).toBeInTheDocument()
		expect(screen.getByTestId("thumbnail-0")).toHaveAttribute("src", "data:image/png;base64,preservedimage")
	})

	it("should handle messages with undefined or null images gracefully", () => {
		const queue: QueuedMessage[] = [
			{
				id: "msg-1",
				text: "Message without images property",
				images: undefined as any, // Testing edge case
			},
			{
				id: "msg-2",
				text: "Message with null images",
				images: null as any, // Testing edge case
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		expect(screen.getByText("Message without images property")).toBeInTheDocument()
		expect(screen.getByText("Message with null images")).toBeInTheDocument()
		expect(screen.queryByTestId("thumbnails")).not.toBeInTheDocument()
	})

	it("should apply correct styling to thumbnails", () => {
		const queue: QueuedMessage[] = [
			{
				id: "msg-1",
				text: "Message with styled images",
				images: ["data:image/png;base64,styledimage"],
			},
		]

		render(<QueuedMessages queue={queue} onRemove={mockOnRemove} onUpdate={mockOnUpdate} />)

		const thumbnails = screen.getByTestId("thumbnails")
		expect(thumbnails).toHaveStyle({ marginTop: "8px" })
	})
})
