// npx vitest run src/components/chat/__tests__/ChatView.image-only-messages.spec.tsx

import React from "react"
import { render, waitFor, act } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"

import ChatView, { ChatViewProps } from "../ChatView"

// Define minimal types needed for testing
interface ClineMessage {
	type: "say" | "ask"
	say?: string
	ask?: string
	ts: number
	text?: string
	partial?: boolean
}

interface ExtensionState {
	version: string
	clineMessages: ClineMessage[]
	taskHistory: any[]
	shouldShowAnnouncement: boolean
	allowedCommands: string[]
	alwaysAllowExecute: boolean
	[key: string]: any
}

// Mock vscode API
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock use-sound hook
const mockPlayFunction = vi.fn()
vi.mock("use-sound", () => ({
	default: vi.fn().mockImplementation(() => {
		return [mockPlayFunction]
	}),
}))

// Mock components that use ESM dependencies
vi.mock("../BrowserSessionRow", () => ({
	default: function MockBrowserSessionRow({ messages }: { messages: ClineMessage[] }) {
		return <div data-testid="browser-session">{JSON.stringify(messages)}</div>
	},
}))

vi.mock("../ChatRow", () => ({
	default: function MockChatRow({ message }: { message: ClineMessage }) {
		return <div data-testid="chat-row">{JSON.stringify(message)}</div>
	},
}))

vi.mock("../AutoApproveMenu", () => ({
	default: () => null,
}))

// Mock VersionIndicator
vi.mock("../../common/VersionIndicator", () => ({
	default: vi.fn(() => null),
}))

vi.mock("../Announcement", () => ({
	default: function MockAnnouncement({ hideAnnouncement }: { hideAnnouncement: () => void }) {
		const React = require("react")
		return React.createElement(
			"div",
			{ "data-testid": "announcement-modal" },
			React.createElement("div", null, "What's New"),
			React.createElement("button", { onClick: hideAnnouncement }, "Close"),
		)
	},
}))

// Mock RooCloudCTA component
vi.mock("@src/components/welcome/RooCloudCTA", () => ({
	default: function MockRooCloudCTA() {
		return (
			<div data-testid="roo-cloud-cta">
				<div>rooCloudCTA.title</div>
			</div>
		)
	},
}))

// Mock QueuedMessages component to test image-only messages
vi.mock("../QueuedMessages", () => ({
	default: function MockQueuedMessages({
		queue = [],
		onRemove,
		onUpdate,
	}: {
		queue?: Array<{ id: string; text: string; images: string[] }>
		onRemove?: (index: number) => void
		onUpdate?: (index: number, newText: string) => void
	}) {
		if (!queue || queue.length === 0) {
			return null
		}
		return (
			<div data-testid="queued-messages">
				{queue.map((msg, index) => (
					<div key={msg.id} data-testid={`queued-message-${index}`}>
						<span data-testid={`message-text-${index}`}>{msg.text}</span>
						<span data-testid={`message-images-${index}`}>{msg.images.length} images</span>
						<button
							aria-label="Remove message"
							onClick={() => onRemove?.(index)}
							data-testid={`remove-button-${index}`}>
							Remove
						</button>
						<button
							aria-label="Edit message"
							onClick={() => onUpdate?.(index, "edited text")}
							data-testid={`edit-button-${index}`}>
							Edit
						</button>
					</div>
				))}
			</div>
		)
	},
}))

// Mock RooTips component
vi.mock("@src/components/welcome/RooTips", () => ({
	default: function MockRooTips() {
		return <div data-testid="roo-tips">Tips content</div>
	},
}))

// Mock RooHero component
vi.mock("@src/components/welcome/RooHero", () => ({
	default: function MockRooHero() {
		return <div data-testid="roo-hero">Hero content</div>
	},
}))

// Mock TelemetryBanner component
vi.mock("../common/TelemetryBanner", () => ({
	default: function MockTelemetryBanner() {
		return null
	},
}))

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: any) => {
			if (key === "chat:versionIndicator.ariaLabel" && options?.version) {
				return `Version ${options.version}`
			}
			return key
		},
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
	Trans: ({ i18nKey, children }: { i18nKey: string; children?: React.ReactNode }) => {
		return <>{children || i18nKey}</>
	},
}))

interface ChatTextAreaProps {
	onSend: (value: string) => void
	inputValue?: string
	sendingDisabled?: boolean
	placeholderText?: string
	selectedImages?: string[]
	shouldDisableImages?: boolean
	onSelectImages?: () => void
	setSelectedImages?: (images: string[]) => void
}

const mockInputRef = React.createRef<HTMLInputElement>()
const mockFocus = vi.fn()

// Create a more sophisticated mock that can simulate image-only messages
vi.mock("../ChatTextArea", () => {
	const mockReact = require("react")

	return {
		default: mockReact.forwardRef(function MockChatTextArea(
			props: ChatTextAreaProps,
			ref: React.ForwardedRef<{ focus: () => void }>,
		) {
			const [localInputValue, setLocalInputValue] = mockReact.useState(props.inputValue || "")
			const [localSelectedImages, setLocalSelectedImages] = mockReact.useState(props.selectedImages || [])

			// Use useImperativeHandle to expose the mock focus method
			mockReact.useImperativeHandle(ref, () => ({
				focus: mockFocus,
			}))

			// Sync with parent props
			mockReact.useEffect(() => {
				setLocalInputValue(props.inputValue || "")
			}, [props.inputValue])

			mockReact.useEffect(() => {
				setLocalSelectedImages(props.selectedImages || [])
			}, [props.selectedImages])

			return (
				<div data-testid="chat-textarea">
					<input
						ref={mockInputRef}
						type="text"
						value={localInputValue}
						onChange={(e) => {
							setLocalInputValue(e.target.value)
						}}
						data-sending-disabled={props.sendingDisabled}
						data-testid="chat-input"
					/>
					<button
						onClick={() => {
							// Simulate sending message with current text and images
							props.onSend(localInputValue)
						}}
						data-testid="send-button"
						disabled={props.sendingDisabled}>
						Send
					</button>
					<button
						onClick={() => {
							// Simulate adding images
							const newImages = ["data:image/png;base64,test1", "data:image/png;base64,test2"]
							setLocalSelectedImages(newImages)
							props.setSelectedImages?.(newImages)
						}}
						data-testid="add-images-button"
						disabled={props.shouldDisableImages}>
						Add Images
					</button>
					<button
						onClick={() => {
							// Simulate sending image-only message (empty text + images)
							props.onSend("")
						}}
						data-testid="send-image-only-button"
						disabled={props.sendingDisabled || localSelectedImages.length === 0}>
						Send Images Only
					</button>
					<div data-testid="selected-images-count">{localSelectedImages.length}</div>
				</div>
			)
		}),
	}
})

// Mock VSCode components
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeButton: function MockVSCodeButton({
		children,
		onClick,
		appearance,
	}: {
		children: React.ReactNode
		onClick?: () => void
		appearance?: string
	}) {
		return (
			<button onClick={onClick} data-appearance={appearance}>
				{children}
			</button>
		)
	},
	VSCodeLink: function MockVSCodeLink({ children, href }: { children: React.ReactNode; href?: string }) {
		return <a href={href}>{children}</a>
	},
}))

// Mock window.postMessage to trigger state hydration
const mockPostMessage = (state: Partial<ExtensionState>) => {
	window.postMessage(
		{
			type: "state",
			state: {
				version: "1.0.0",
				clineMessages: [],
				taskHistory: [],
				shouldShowAnnouncement: false,
				allowedCommands: [],
				alwaysAllowExecute: false,
				cloudIsAuthenticated: false,
				telemetrySetting: "enabled",
				...state,
			},
		},
		"*",
	)
}

const defaultProps: ChatViewProps = {
	isHidden: false,
	showAnnouncement: false,
	hideAnnouncement: () => {},
}

const queryClient = new QueryClient()

const renderChatView = (props: Partial<ChatViewProps> = {}) => {
	return render(
		<ExtensionStateContextProvider>
			<QueryClientProvider client={queryClient}>
				<ChatView {...defaultProps} {...props} />
			</QueryClientProvider>
		</ExtensionStateContextProvider>,
	)
}

describe("ChatView - Image-Only Message Tests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(vscode.postMessage).mockClear()
	})

	it("handles image-only messages correctly when AI is busy", async () => {
		const { getByTestId } = renderChatView()

		// First hydrate state with initial task that makes AI busy
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "readFile", path: "test.txt" }),
					partial: true, // This makes sendingDisabled = true
				},
			],
		})

		// Wait for component to render with AI busy state
		await waitFor(() => {
			const chatInput = getByTestId("chat-input")
			expect(chatInput.getAttribute("data-sending-disabled")).toBe("true")
		})

		// Clear any initial vscode calls
		vi.mocked(vscode.postMessage).mockClear()

		// Simulate adding images
		const addImagesButton = getByTestId("add-images-button")
		act(() => {
			addImagesButton.click()
		})

		// Wait for images to be added
		await waitFor(() => {
			expect(getByTestId("selected-images-count")).toHaveTextContent("2")
		})

		// Simulate sending image-only message (empty text + images)
		const sendImageOnlyButton = getByTestId("send-image-only-button")
		act(() => {
			sendImageOnlyButton.click()
		})

		// Wait for the message to be queued (not sent immediately since AI is busy)
		await waitFor(() => {
			expect(getByTestId("queued-messages")).toBeInTheDocument()
		})

		// Verify the queued message has empty text but images
		expect(getByTestId("message-text-0")).toHaveTextContent("") // Empty text
		expect(getByTestId("message-images-0")).toHaveTextContent("2 images") // Has images

		// Verify no immediate vscode message was sent (because AI is busy)
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "newTask",
			}),
		)
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "askResponse",
			}),
		)
	})

	it("processes image-only messages from queue when AI becomes available", async () => {
		const { getByTestId } = renderChatView()

		// Start with AI busy state and queue an image-only message
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "readFile", path: "test.txt" }),
					partial: true, // AI is busy
				},
			],
		})

		// Wait for busy state
		await waitFor(() => {
			const chatInput = getByTestId("chat-input")
			expect(chatInput.getAttribute("data-sending-disabled")).toBe("true")
		})

		// Add images and send image-only message
		act(() => {
			getByTestId("add-images-button").click()
		})

		await waitFor(() => {
			expect(getByTestId("selected-images-count")).toHaveTextContent("2")
		})

		act(() => {
			getByTestId("send-image-only-button").click()
		})

		// Verify message is queued
		await waitFor(() => {
			expect(getByTestId("queued-messages")).toBeInTheDocument()
			expect(getByTestId("message-text-0")).toHaveTextContent("")
			expect(getByTestId("message-images-0")).toHaveTextContent("2 images")
		})

		// Clear vscode calls
		vi.mocked(vscode.postMessage).mockClear()

		// Now simulate AI becoming available (task completes)
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "completion_result",
					ts: Date.now(),
					text: "Task completed",
					partial: false, // AI is no longer busy
				},
			],
		})

		// Wait for AI to become available and queue to process
		await waitFor(() => {
			const chatInput = getByTestId("chat-input")
			expect(chatInput.getAttribute("data-sending-disabled")).toBe("false")
		})

		// Wait for the queued message to be processed
		await waitFor(
			() => {
				expect(vscode.postMessage).toHaveBeenCalledWith(
					expect.objectContaining({
						type: "askResponse",
						askResponse: "messageResponse",
						text: "", // Empty text
						images: ["data:image/png;base64,test1", "data:image/png;base64,test2"], // But has images
					}),
				)
			},
			{ timeout: 2000 },
		)
	})

	it("allows editing image-only messages in the queue", async () => {
		const { getByTestId } = renderChatView()

		// Set up AI busy state
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "readFile", path: "test.txt" }),
					partial: true,
				},
			],
		})

		// Add images and send image-only message
		act(() => {
			getByTestId("add-images-button").click()
		})

		act(() => {
			getByTestId("send-image-only-button").click()
		})

		// Wait for message to be queued
		await waitFor(() => {
			expect(getByTestId("queued-messages")).toBeInTheDocument()
			expect(getByTestId("message-text-0")).toHaveTextContent("")
		})

		// Edit the queued message to add text
		const editButton = getByTestId("edit-button-0")
		act(() => {
			editButton.click()
		})

		// Verify the message text was updated
		await waitFor(() => {
			expect(getByTestId("message-text-0")).toHaveTextContent("edited text")
		})
	})

	it("allows removing image-only messages from the queue", async () => {
		const { getByTestId, queryByTestId } = renderChatView()

		// Set up AI busy state
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "readFile", path: "test.txt" }),
					partial: true,
				},
			],
		})

		// Add images and send image-only message
		act(() => {
			getByTestId("add-images-button").click()
		})

		act(() => {
			getByTestId("send-image-only-button").click()
		})

		// Wait for message to be queued
		await waitFor(() => {
			expect(getByTestId("queued-messages")).toBeInTheDocument()
		})

		// Remove the queued message
		const removeButton = getByTestId("remove-button-0")
		act(() => {
			removeButton.click()
		})

		// Verify the queue is now empty
		await waitFor(() => {
			expect(queryByTestId("queued-messages")).not.toBeInTheDocument()
		})
	})

	it("handles multiple image-only messages in queue correctly", async () => {
		const { getByTestId } = renderChatView()

		// Set up AI busy state
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "readFile", path: "test.txt" }),
					partial: true,
				},
			],
		})

		// Add and send first image-only message
		act(() => {
			getByTestId("add-images-button").click()
		})

		act(() => {
			getByTestId("send-image-only-button").click()
		})

		// Add and send second image-only message
		act(() => {
			getByTestId("add-images-button").click()
		})

		act(() => {
			getByTestId("send-image-only-button").click()
		})

		// Wait for both messages to be queued
		await waitFor(() => {
			expect(getByTestId("queued-messages")).toBeInTheDocument()
			expect(getByTestId("queued-message-0")).toBeInTheDocument()
			expect(getByTestId("queued-message-1")).toBeInTheDocument()
		})

		// Verify both messages have empty text but images
		expect(getByTestId("message-text-0")).toHaveTextContent("")
		expect(getByTestId("message-images-0")).toHaveTextContent("2 images")
		expect(getByTestId("message-text-1")).toHaveTextContent("")
		expect(getByTestId("message-images-1")).toHaveTextContent("2 images")
	})

	it("sends image-only messages immediately when AI is not busy", async () => {
		const { getByTestId, queryByTestId } = renderChatView()

		// Set up state with no active task (AI not busy)
		mockPostMessage({
			clineMessages: [], // No active task
		})

		// Wait for component to render
		await waitFor(() => {
			const chatInput = getByTestId("chat-input")
			expect(chatInput.getAttribute("data-sending-disabled")).toBe("false")
		})

		// Clear any initial vscode calls
		vi.mocked(vscode.postMessage).mockClear()

		// Add images and send image-only message
		act(() => {
			getByTestId("add-images-button").click()
		})

		await waitFor(() => {
			expect(getByTestId("selected-images-count")).toHaveTextContent("2")
		})

		act(() => {
			getByTestId("send-image-only-button").click()
		})

		// Verify message is sent immediately (not queued) since AI is not busy
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "newTask",
					text: "", // Empty text
					images: ["data:image/png;base64,test1", "data:image/png;base64,test2"], // But has images
				}),
			)
		})

		// Verify no queue is shown
		expect(queryByTestId("queued-messages")).not.toBeInTheDocument()
	})
})
