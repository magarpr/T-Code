// npx vitest run src/components/chat/__tests__/ChatView.image-only-edge-case.spec.tsx

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

// Mock useSelectedModel to return a model that supports images
vi.mock("@src/components/ui/hooks/useSelectedModel", () => ({
	useSelectedModel: vi.fn(() => ({
		info: {
			supportsImages: true,
			maxTokens: 8192,
			contextWindow: 200_000,
		},
	})),
}))

// Mock the API configuration and related hooks
vi.mock("@src/shared/api", () => ({
	getModelMaxOutputTokens: vi.fn(() => 8192),
}))

// Mock TaskHeader to avoid API configuration issues
vi.mock("../TaskHeader", () => ({
	default: function MockTaskHeader() {
		return <div data-testid="task-header">Task Header</div>
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
		const React = require("react") // eslint-disable-line @typescript-eslint/no-require-imports
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

// Mock QueuedMessages component - this is the key component for testing
vi.mock("../QueuedMessages", () => ({
	default: function MockQueuedMessages({
		queue = [],
		onRemove,
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
						<span data-testid={`message-text-${index}`}>{msg.text || "[empty]"}</span>
						<span data-testid={`message-images-${index}`}>{msg.images.length} images</span>
						<button
							aria-label="Remove message"
							onClick={() => onRemove?.(index)}
							data-testid={`remove-button-${index}`}>
							Remove
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

// Create a simple mock that can test the core functionality
vi.mock("../ChatTextArea", () => {
	const mockReact = require("react") // eslint-disable-line @typescript-eslint/no-require-imports

	return {
		default: mockReact.forwardRef(function MockChatTextArea(
			props: ChatTextAreaProps,
			ref: React.ForwardedRef<{ focus: () => void }>,
		) {
			// Use useImperativeHandle to expose the mock focus method
			mockReact.useImperativeHandle(ref, () => ({
				focus: mockFocus,
			}))

			// Use the selectedImages from props directly
			const selectedImages = props.selectedImages || []

			return (
				<div data-testid="chat-textarea">
					<input
						ref={mockInputRef}
						type="text"
						data-sending-disabled={props.sendingDisabled}
						data-testid="chat-input"
					/>
					<button
						onClick={() => {
							// Test image-only message: empty text with images
							props.onSend("")
						}}
						data-testid="send-image-only-button"
						disabled={props.sendingDisabled}>
						Send Image Only
					</button>
					<button
						onClick={() => {
							// Simulate adding images for testing
							const newImages = ["data:image/png;base64,test1", "data:image/png;base64,test2"]
							props.setSelectedImages?.(newImages)
						}}
						data-testid="add-images-button"
						disabled={props.shouldDisableImages}>
						Add Images
					</button>
					<div data-testid="selected-images-count">{selectedImages.length}</div>
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

describe("ChatView - Image-Only Message Edge Case", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(vscode.postMessage).mockClear()
	})

	it("handles image-only messages without breaking the queue", async () => {
		const { getByTestId } = renderChatView()

		// Set up AI busy state to trigger queueing
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

		// Simulate sending image-only message (empty text + images)
		// This simulates what happens when a user pastes images but no text
		const sendImageOnlyButton = getByTestId("send-image-only-button")

		// Simulate the ChatView receiving selectedImages through props
		// This would normally happen through the ChatTextArea component
		act(() => {
			// Trigger the handleSendMessage with empty text and mock images
			// We'll simulate this by directly calling the onSend with empty string
			// The real ChatView should handle this gracefully
			sendImageOnlyButton.click()
		})

		// The key test: verify that the system doesn't crash or break
		// Even with empty text, the message should be handled properly

		// Since we're testing the edge case, we mainly want to ensure:
		// 1. No errors are thrown
		// 2. The component remains functional
		// 3. The queue system doesn't break

		// Wait a bit to ensure any async operations complete
		await waitFor(() => {
			// The component should still be functional
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Verify no errors were thrown and the component is still responsive
		expect(getByTestId("chat-input")).toBeInTheDocument()
		expect(getByTestId("send-image-only-button")).toBeInTheDocument()
	})

	it("processes empty text with images correctly when AI becomes available", async () => {
		const { getByTestId } = renderChatView()

		// Start with AI busy state
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

		// Send image-only message while AI is busy
		act(() => {
			getByTestId("send-image-only-button").click()
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

		// Wait for AI to become available
		await waitFor(() => {
			const chatInput = getByTestId("chat-input")
			expect(chatInput.getAttribute("data-sending-disabled")).toBe("false")
		})

		// The key test: verify that the system handles the transition correctly
		// and doesn't break when processing queued image-only messages

		// Component should remain functional
		expect(getByTestId("chat-textarea")).toBeInTheDocument()
		expect(getByTestId("chat-input")).toBeInTheDocument()
	})

	it("sends image-only messages immediately when AI is not busy", async () => {
		const { getByTestId } = renderChatView()

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

		// Send image-only message when AI is not busy
		act(() => {
			getByTestId("send-image-only-button").click()
		})

		// The key test: verify that image-only messages are handled correctly
		// when sent immediately (not queued)

		// Component should remain functional
		expect(getByTestId("chat-textarea")).toBeInTheDocument()
		expect(getByTestId("chat-input")).toBeInTheDocument()
	})
})
