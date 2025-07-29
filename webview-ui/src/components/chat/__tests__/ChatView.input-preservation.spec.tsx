// npx vitest run src/components/chat/__tests__/ChatView.input-preservation.spec.tsx

import React from "react"
import { render, waitFor, act, fireEvent } from "@/utils/test-utils"
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

// Mock VersionIndicator - returns null by default to prevent rendering in tests
vi.mock("../../common/VersionIndicator", () => ({
	default: vi.fn(() => null),
}))

vi.mock("../Announcement", () => ({
	default: function MockAnnouncement({ hideAnnouncement }: { hideAnnouncement: () => void }) {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
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
				<div>rooCloudCTA.description</div>
				<div>rooCloudCTA.joinWaitlist</div>
			</div>
		)
	},
}))

// Mock QueuedMessages component
vi.mock("../QueuedMessages", () => ({
	default: function MockQueuedMessages({
		queue = [],
		onRemove,
	}: {
		queue?: Array<{ id: string; text: string; images?: string[] }>
		onRemove?: (index: number) => void
	}) {
		if (!queue || queue.length === 0) {
			return null
		}
		return (
			<div data-testid="queued-messages">
				{queue.map((msg, index) => (
					<div key={msg.id}>
						<span>{msg.text}</span>
						<button aria-label="Remove message" onClick={() => onRemove?.(index)}>
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
		return null // Don't render anything to avoid interference
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
	setInputValue?: (value: string) => void
	sendingDisabled?: boolean
	placeholderText?: string
	selectedImages?: string[]
	setSelectedImages?: (images: string[]) => void
	shouldDisableImages?: boolean
}

const mockInputRef = React.createRef<HTMLInputElement>()
const mockFocus = vi.fn()

// Track input value and selected images for testing
let mockInputValue = ""
let mockSelectedImages: string[] = []

vi.mock("../ChatTextArea", () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const mockReact = require("react")

	return {
		default: mockReact.forwardRef(function MockChatTextArea(
			props: ChatTextAreaProps,
			ref: React.ForwardedRef<{ focus: () => void }>,
		) {
			// Use useImperativeHandle to expose the mock focus method
			React.useImperativeHandle(ref, () => ({
				focus: mockFocus,
			}))

			// Update mock values when props change
			React.useEffect(() => {
				if (props.inputValue !== undefined) {
					mockInputValue = props.inputValue
				}
				if (props.selectedImages !== undefined) {
					mockSelectedImages = props.selectedImages
				}
			}, [props.inputValue, props.selectedImages])

			return (
				<div data-testid="chat-textarea">
					<input
						ref={mockInputRef}
						type="text"
						value={props.inputValue || ""}
						onChange={(e) => {
							mockInputValue = e.target.value
							props.setInputValue?.(e.target.value)
						}}
						data-sending-disabled={props.sendingDisabled}
						data-testid="chat-input"
					/>
					<div data-testid="selected-images-count">{props.selectedImages?.length || 0}</div>
					<button
						data-testid="send-button"
						onClick={() => props.onSend(props.inputValue || "")}
						disabled={props.sendingDisabled}>
						Send
					</button>
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
		disabled,
	}: {
		children: React.ReactNode
		onClick?: () => void
		appearance?: string
		disabled?: boolean
	}) {
		return (
			<button onClick={onClick} data-appearance={appearance} disabled={disabled} data-testid="vscode-button">
				{children}
			</button>
		)
	},
	VSCodeTextField: function MockVSCodeTextField({
		value,
		onInput,
		placeholder,
	}: {
		value?: string
		onInput?: (e: { target: { value: string } }) => void
		placeholder?: string
	}) {
		return (
			<input
				type="text"
				value={value}
				onChange={(e) => onInput?.({ target: { value: e.target.value } })}
				placeholder={placeholder}
			/>
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

describe("ChatView - Input Preservation Tests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockInputValue = ""
		mockSelectedImages = []
	})

	it("preserves input state when clicking Resume Task button", async () => {
		const { getByTestId, getAllByTestId } = renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Set some input value and selected images
		const chatInput = getByTestId("chat-input")
		fireEvent.change(chatInput, { target: { value: "Test input message" } })

		// Simulate having selected images
		mockSelectedImages = ["image1.png", "image2.jpg"]

		// Add resume_task ask
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
					ask: "resume_task",
					ts: Date.now(),
					text: "Task was interrupted. Resume or terminate?",
				},
			],
		})

		// Wait for buttons to appear
		await waitFor(() => {
			const buttons = getAllByTestId("vscode-button")
			expect(buttons.length).toBeGreaterThan(0)
		})

		// Find and click the primary button (Resume Task)
		const buttons = getAllByTestId("vscode-button")
		const primaryButton = buttons.find((btn) => btn.getAttribute("data-appearance") === "primary")
		expect(primaryButton).toBeDefined()

		// Clear vscode.postMessage calls to focus on the button click
		vi.mocked(vscode.postMessage).mockClear()

		// Click the Resume Task button
		act(() => {
			primaryButton!.click()
		})

		// Verify that the resume task message was sent
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "yesButtonClicked",
			})
		})

		// Verify that input state is preserved (input value should still be there)
		expect(mockInputValue).toBe("Test input message")
		expect(mockSelectedImages).toEqual(["image1.png", "image2.jpg"])
	})

	it("clears input state when clicking Terminate button", async () => {
		const { getByTestId, getAllByTestId } = renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Set some input value and selected images
		const chatInput = getByTestId("chat-input")
		fireEvent.change(chatInput, { target: { value: "Test input message" } })

		// Simulate having selected images
		mockSelectedImages = ["image1.png", "image2.jpg"]

		// Add resume_task ask
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
					ask: "resume_task",
					ts: Date.now(),
					text: "Task was interrupted. Resume or terminate?",
				},
			],
		})

		// Wait for buttons to appear
		await waitFor(() => {
			const buttons = getAllByTestId("vscode-button")
			expect(buttons.length).toBeGreaterThan(0)
		})

		// Find and click the secondary button (Terminate)
		const buttons = getAllByTestId("vscode-button")
		const secondaryButton = buttons.find((btn) => btn.getAttribute("data-appearance") === "secondary")
		expect(secondaryButton).toBeDefined()

		// Clear vscode.postMessage calls to focus on the button click
		vi.mocked(vscode.postMessage).mockClear()

		// Click the Terminate button
		act(() => {
			secondaryButton!.click()
		})

		// Verify that the start new task message was sent
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "clearTask",
			})
		})

		// Verify that input state is cleared
		await waitFor(() => {
			expect(mockInputValue).toBe("")
			expect(mockSelectedImages).toEqual([])
		})
	})

	it("clears input state when rejecting tool actions", async () => {
		const { getByTestId, getAllByTestId } = renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Set some input value and selected images
		const chatInput = getByTestId("chat-input")
		fireEvent.change(chatInput, { target: { value: "Test input message" } })

		// Simulate having selected images
		mockSelectedImages = ["image1.png", "image2.jpg"]

		// Add tool ask
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
					text: JSON.stringify({ tool: "editedExistingFile", path: "test.txt" }),
				},
			],
		})

		// Wait for buttons to appear
		await waitFor(() => {
			const buttons = getAllByTestId("vscode-button")
			expect(buttons.length).toBeGreaterThan(0)
		})

		// Find and click the secondary button (Reject)
		const buttons = getAllByTestId("vscode-button")
		const secondaryButton = buttons.find((btn) => btn.getAttribute("data-appearance") === "secondary")
		expect(secondaryButton).toBeDefined()

		// Clear vscode.postMessage calls to focus on the button click
		vi.mocked(vscode.postMessage).mockClear()

		// Click the Reject button
		act(() => {
			secondaryButton!.click()
		})

		// Verify that the rejection message was sent with input text and images
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "noButtonClicked",
				text: "Test input message",
				images: ["image1.png", "image2.jpg"],
			})
		})

		// Verify that input state is cleared
		await waitFor(() => {
			expect(mockInputValue).toBe("")
			expect(mockSelectedImages).toEqual([])
		})
	})

	it("clears input state when aborting command output", async () => {
		const { getByTestId, getAllByTestId } = renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Set some input value and selected images
		const chatInput = getByTestId("chat-input")
		fireEvent.change(chatInput, { target: { value: "Test input message" } })

		// Simulate having selected images
		mockSelectedImages = ["image1.png", "image2.jpg"]

		// Add command_output ask
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
					ask: "command_output",
					ts: Date.now(),
					text: "Command is running...",
				},
			],
		})

		// Wait for buttons to appear
		await waitFor(() => {
			const buttons = getAllByTestId("vscode-button")
			expect(buttons.length).toBeGreaterThan(0)
		})

		// Find and click the secondary button (Kill Command)
		const buttons = getAllByTestId("vscode-button")
		const secondaryButton = buttons.find((btn) => btn.getAttribute("data-appearance") === "secondary")
		expect(secondaryButton).toBeDefined()

		// Clear vscode.postMessage calls to focus on the button click
		vi.mocked(vscode.postMessage).mockClear()

		// Click the Kill Command button
		act(() => {
			secondaryButton!.click()
		})

		// Verify that the abort message was sent (no input text sent for terminal operations)
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "terminalOperation",
				terminalOperation: "abort",
			})
		})

		// Verify that input state is cleared
		await waitFor(() => {
			expect(mockInputValue).toBe("")
			expect(mockSelectedImages).toEqual([])
		})
	})

	it("clears input state for non-resume_task primary button actions", async () => {
		const { getByTestId, getAllByTestId } = renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Set some input value and selected images
		const chatInput = getByTestId("chat-input")
		fireEvent.change(chatInput, { target: { value: "Test input message" } })

		// Simulate having selected images
		mockSelectedImages = ["image1.png", "image2.jpg"]

		// Add tool ask (not resume_task)
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
					text: JSON.stringify({ tool: "editedExistingFile", path: "test.txt" }),
				},
			],
		})

		// Wait for buttons to appear
		await waitFor(() => {
			const buttons = getAllByTestId("vscode-button")
			expect(buttons.length).toBeGreaterThan(0)
		})

		// Find and click the primary button (Save)
		const buttons = getAllByTestId("vscode-button")
		const primaryButton = buttons.find((btn) => btn.getAttribute("data-appearance") === "primary")
		expect(primaryButton).toBeDefined()

		// Clear vscode.postMessage calls to focus on the button click
		vi.mocked(vscode.postMessage).mockClear()

		// Click the Save button
		act(() => {
			primaryButton!.click()
		})

		// Verify that the approval message was sent with input text and images
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "yesButtonClicked",
				text: "Test input message",
				images: ["image1.png", "image2.jpg"],
			})
		})

		// Verify that input state is cleared (since this is not resume_task)
		await waitFor(() => {
			expect(mockInputValue).toBe("")
			expect(mockSelectedImages).toEqual([])
		})
	})
})
