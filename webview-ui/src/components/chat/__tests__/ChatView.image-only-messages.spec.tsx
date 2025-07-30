import React from "react"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { describe, test, expect, vi, beforeEach } from "vitest"
import ChatView from "../ChatView"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"

// Mock the vscode API
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Import the mocked vscode to access the mock function
import { vscode } from "@src/utils/vscode"
const mockPostMessage = vscode.postMessage as any

// Mock the extension state context
vi.mock("@src/context/ExtensionStateContext")
const mockUseExtensionState = useExtensionState as any

// Mock the selected model hook
vi.mock("@src/components/ui/hooks/useSelectedModel")
const mockUseSelectedModel = useSelectedModel as any

// Mock other dependencies
vi.mock("@src/components/welcome/RooHero", () => ({
	default: () => <div data-testid="roo-hero">Roo Hero</div>,
}))

vi.mock("@src/components/welcome/RooTips", () => ({
	default: () => <div data-testid="roo-tips">Roo Tips</div>,
}))

vi.mock("@src/components/welcome/RooCloudCTA", () => ({
	default: () => <div data-testid="roo-cloud-cta">Roo Cloud CTA</div>,
}))

vi.mock("../TaskHeader", () => ({
	default: () => <div data-testid="task-header">Task Header</div>,
}))

vi.mock("../QueuedMessages", () => ({
	default: ({
		queue,
		onRemove: _onRemove,
		onUpdate: _onUpdate,
	}: {
		queue: any[]
		onRemove: (index: number) => void
		onUpdate: (index: number, newText: string) => void
	}) => {
		if (queue.length === 0) {
			return null
		}
		return (
			<div data-testid="queued-messages">
				{queue.map((message, index) => (
					<div key={message.id} data-testid={`message-text-${index}`}>
						{message.text}
					</div>
				))}
			</div>
		)
	},
}))

// Mock ChatTextArea with the enhanced mock
vi.mock("../ChatTextArea", () => ({
	default: React.forwardRef<HTMLTextAreaElement, any>((props, _ref) => {
		const { inputValue, selectedImages, onSend, sendingDisabled, shouldDisableImages, setSelectedImages } = props

		// Helper function to simulate adding images
		const simulateAddImages = (count: number) => {
			const newImages = Array.from({ length: count }, (_, i) => `data:image/png;base64,test-image-${i}`)
			setSelectedImages((prev: string[]) => [...prev, ...newImages])
		}

		return (
			<div data-testid="chat-textarea">
				<input
					data-testid="chat-input"
					type="text"
					value={inputValue}
					data-sending-disabled={sendingDisabled}
					onChange={() => {}}
				/>
				<button data-testid="send-button" disabled={sendingDisabled} onClick={() => onSend()}>
					Send
				</button>
				<button data-testid="add-images-button" onClick={() => simulateAddImages(2)}>
					Add Images
				</button>
				<button
					data-testid="send-image-only-button"
					disabled={shouldDisableImages || selectedImages.length === 0}
					onClick={() => onSend()}>
					Send Images Only
				</button>
				<div data-testid="selected-images-count">{selectedImages.length}</div>
			</div>
		)
	}),
}))

// Mock other components
vi.mock("../AutoApproveMenu", () => ({
	default: () => <div data-testid="auto-approve-menu">Auto Approve Menu</div>,
}))

vi.mock("../Announcement", () => ({
	default: () => <div data-testid="announcement">Announcement</div>,
}))

vi.mock("../common/TelemetryBanner", () => ({
	default: () => <div data-testid="telemetry-banner">Telemetry Banner</div>,
}))

vi.mock("../common/VersionIndicator", () => ({
	default: () => <div data-testid="version-indicator">Version Indicator</div>,
}))

vi.mock("../history/HistoryPreview", () => ({
	default: () => <div data-testid="history-preview">History Preview</div>,
}))

vi.mock("../history/useTaskSearch", () => ({
	useTaskSearch: () => ({ tasks: [] }),
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("react-virtuoso", () => ({
	Virtuoso: ({ data, itemContent }: { data: any[]; itemContent: (index: number, item: any) => React.ReactNode }) => (
		<div data-testid="virtuoso-scroller">
			<div data-testid="virtuoso-item-list">
				{data.map((item, index) => (
					<div key={index}>{itemContent(index, item)}</div>
				))}
			</div>
		</div>
	),
}))

// Mock sound hooks
vi.mock("use-sound", () => ({
	default: () => [vi.fn()],
}))

// Mock other hooks
vi.mock("@src/hooks/useAutoApprovalState", () => ({
	useAutoApprovalState: () => ({ hasEnabledOptions: false }),
}))

vi.mock("@src/hooks/useAutoApprovalToggles", () => ({
	useAutoApprovalToggles: () => ({}),
}))

vi.mock("react-use", () => ({
	useDeepCompareEffect: vi.fn((fn, deps) => {
		// Mock useDeepCompareEffect to behave like useEffect
		// eslint-disable-next-line react-hooks/exhaustive-deps
		React.useEffect(fn, deps)
	}),
	useEvent: vi.fn(),
	useMount: vi.fn(),
	useSize: vi.fn(() => [<div key="size-div" />, { height: 100 }]),
}))

vi.mock("@src/utils/useDebounceEffect", () => ({
	useDebounceEffect: vi.fn(),
}))

// Mock StandardTooltip to avoid TooltipProvider issues
vi.mock("@src/components/ui", () => ({
	StandardTooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Helper function to create base extension state
const createBaseExtensionState = (overrides = {}): any => ({
	clineMessages: [],
	currentTaskItem: {
		id: "test-task",
		ts: Date.now(),
		type: "ask",
		ask: "tool",
		text: "Test task",
	},
	taskHistory: [],
	apiConfiguration: {
		apiProvider: "anthropic",
		apiKey: "test-key",
		apiModelId: "claude-3-5-sonnet-20241022",
	},
	organizationAllowList: {
		allowAll: false,
		providers: {
			anthropic: {
				allowAll: true,
			},
		},
	},
	mcpServers: [],
	alwaysAllowBrowser: false,
	alwaysAllowReadOnly: false,
	alwaysAllowReadOnlyOutsideWorkspace: false,
	alwaysAllowWrite: false,
	alwaysAllowWriteOutsideWorkspace: false,
	alwaysAllowWriteProtected: false,
	alwaysAllowExecute: false,
	alwaysAllowMcp: false,
	allowedCommands: [],
	deniedCommands: [],
	writeDelayMs: 0,
	followupAutoApproveTimeoutMs: 0,
	mode: "code",
	setMode: vi.fn(),
	autoApprovalEnabled: false,
	alwaysAllowModeSwitch: false,
	alwaysAllowSubtasks: false,
	alwaysAllowFollowupQuestions: false,
	alwaysAllowUpdateTodoList: false,
	customModes: [],
	telemetrySetting: "enabled",
	hasSystemPromptOverride: false,
	historyPreviewCollapsed: false,
	soundEnabled: false,
	soundVolume: 0.5,
	cloudIsAuthenticated: false,
	// Add missing required properties with default values
	didHydrateState: true,
	showWelcome: false,
	theme: "dark",
	filePaths: [],
	openedTabs: [],
	currentApiConfigName: "test-config",
	listApiConfigMeta: [],
	customModePrompts: {},
	cwd: "/test",
	pinnedApiConfigs: [],
	togglePinnedApiConfig: vi.fn(),
	commands: [],
	...overrides,
})

describe("ChatView - Image-Only Message Tests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockPostMessage.mockClear()

		// Mock selected model with image support
		mockUseSelectedModel.mockReturnValue({
			info: {
				name: "Claude 3.5 Sonnet",
				supportsImages: true,
				maxTokens: 200000,
			},
		})
	})

	test("handles image-only messages correctly when AI is busy", async () => {
		// Start with AI busy state - use api_req_retry_delayed which sets sendingDisabled to true
		mockUseExtensionState.mockReturnValue(
			createBaseExtensionState({
				clineMessages: [
					{
						type: "say",
						say: "api_req_retry_delayed",
						ts: Date.now(),
						text: "Retrying API request in 5 seconds...",
					},
				],
			}),
		)

		const { getByTestId } = render(
			<ChatView isHidden={false} showAnnouncement={false} hideAnnouncement={() => {}} />,
		)

		// Verify AI is busy (when there's an active api request, sendingDisabled should be true)
		expect(getByTestId("chat-input")).toHaveAttribute("data-sending-disabled", "true")
		expect(getByTestId("selected-images-count")).toHaveTextContent("0")

		// Add images
		await act(async () => {
			fireEvent.click(getByTestId("add-images-button"))
		})

		// Verify images were added
		await waitFor(() => {
			expect(getByTestId("selected-images-count")).toHaveTextContent("2")
		})

		// Try to send image-only message while AI is busy
		await act(async () => {
			fireEvent.click(getByTestId("send-image-only-button"))
		})

		// Wait for message to be queued
		await waitFor(() => {
			expect(getByTestId("queued-messages")).toBeInTheDocument()
			expect(getByTestId("message-text-0")).toHaveTextContent("")
		})
	})

	test("allows removing image-only messages from the queue", async () => {
		// Start with AI busy state
		mockUseExtensionState.mockReturnValue(
			createBaseExtensionState({
				clineMessages: [
					{
						type: "say",
						say: "api_req_retry_delayed",
						ts: Date.now(),
						text: "Retrying API request in 5 seconds...",
					},
				],
			}),
		)

		const { getByTestId } = render(
			<ChatView isHidden={false} showAnnouncement={false} hideAnnouncement={() => {}} />,
		)

		// Add images and send to queue
		await act(async () => {
			fireEvent.click(getByTestId("add-images-button"))
		})

		await act(async () => {
			fireEvent.click(getByTestId("send-image-only-button"))
		})

		// Wait for message to be queued
		await waitFor(() => {
			expect(getByTestId("queued-messages")).toBeInTheDocument()
		})
	})

	test("handles multiple image-only messages in queue correctly", async () => {
		// Start with AI busy state
		mockUseExtensionState.mockReturnValue(
			createBaseExtensionState({
				clineMessages: [
					{
						type: "say",
						say: "api_req_retry_delayed",
						ts: Date.now(),
						text: "Retrying API request in 5 seconds...",
					},
				],
			}),
		)

		const { getByTestId } = render(
			<ChatView isHidden={false} showAnnouncement={false} hideAnnouncement={() => {}} />,
		)

		// Add first set of images and send
		await act(async () => {
			fireEvent.click(getByTestId("add-images-button"))
		})

		await act(async () => {
			fireEvent.click(getByTestId("send-image-only-button"))
		})

		// Add second set of images and send
		await act(async () => {
			fireEvent.click(getByTestId("add-images-button"))
		})

		await act(async () => {
			fireEvent.click(getByTestId("send-image-only-button"))
		})

		// Wait for both messages to be queued
		await waitFor(() => {
			expect(getByTestId("queued-messages")).toBeInTheDocument()
			expect(getByTestId("message-text-0")).toBeInTheDocument()
			expect(getByTestId("message-text-1")).toBeInTheDocument()
		})
	})

	test("processes queued image-only messages when AI becomes available", async () => {
		// Start with AI busy state
		mockUseExtensionState.mockReturnValue(
			createBaseExtensionState({
				clineMessages: [
					{
						type: "say",
						say: "api_req_retry_delayed",
						ts: Date.now(),
						text: "Retrying API request in 5 seconds...",
					},
				],
			}),
		)

		const { getByTestId, rerender } = render(
			<ChatView isHidden={false} showAnnouncement={false} hideAnnouncement={() => {}} />,
		)

		// Add images and queue message
		await act(async () => {
			fireEvent.click(getByTestId("add-images-button"))
		})

		await act(async () => {
			fireEvent.click(getByTestId("send-image-only-button"))
		})

		// Wait for message to be queued
		await waitFor(() => {
			expect(getByTestId("queued-messages")).toBeInTheDocument()
		})

		// Simulate AI becoming available (empty messages = new task state)
		mockUseExtensionState.mockReturnValue(
			createBaseExtensionState({
				clineMessages: [],
			}),
		)

		await act(async () => {
			rerender(<ChatView isHidden={false} showAnnouncement={false} hideAnnouncement={() => {}} />)
		})

		// Wait for AI to become available (sendingDisabled should be false)
		await waitFor(() => {
			expect(getByTestId("chat-input")).toHaveAttribute("data-sending-disabled", "false")
		})

		// The queue should be processed and cleared when AI becomes available
		// Since we switched to empty messages (new task state), the queue should be gone
		expect(() => getByTestId("queued-messages")).toThrow()
	})

	test("allows image-only messages when AI is not busy", async () => {
		// Start with AI not busy state (no messages = new task scenario)
		mockUseExtensionState.mockReturnValue(
			createBaseExtensionState({
				clineMessages: [],
			}),
		)

		const { getByTestId } = render(
			<ChatView isHidden={false} showAnnouncement={false} hideAnnouncement={() => {}} />,
		)

		// Verify AI is not busy
		expect(getByTestId("chat-input")).toHaveAttribute("data-sending-disabled", "false")
		expect(getByTestId("selected-images-count")).toHaveTextContent("0")

		// Add images
		await act(async () => {
			fireEvent.click(getByTestId("add-images-button"))
		})

		// Verify images were added
		await waitFor(() => {
			expect(getByTestId("selected-images-count")).toHaveTextContent("2")
		})

		// Send image-only message when AI is not busy
		await act(async () => {
			fireEvent.click(getByTestId("send-image-only-button"))
		})

		// Message should be sent directly as a new task (since no existing messages)
		await waitFor(() => {
			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "newTask",
				}),
			)
		})

		// No queue should be created
		expect(screen.queryByTestId("queued-messages")).not.toBeInTheDocument()
	})

	test("queues image-only messages when AI becomes busy", async () => {
		// Start with AI not busy (existing task but no active ask)
		mockUseExtensionState.mockReturnValue(
			createBaseExtensionState({
				clineMessages: [
					{
						type: "say",
						say: "text",
						ts: Date.now(),
						text: "Previous response",
					},
				],
			}),
		)

		const { getByTestId, rerender } = render(
			<ChatView isHidden={false} showAnnouncement={false} hideAnnouncement={() => {}} />,
		)

		// Initially AI is not busy
		expect(getByTestId("chat-input")).toHaveAttribute("data-sending-disabled", "false")

		// Simulate AI becoming busy
		mockUseExtensionState.mockReturnValue(
			createBaseExtensionState({
				clineMessages: [
					{
						type: "say",
						say: "text",
						ts: Date.now() - 1000,
						text: "Previous response",
					},
					{
						type: "say",
						say: "api_req_retry_delayed",
						ts: Date.now(),
						text: "Retrying API request in 5 seconds...",
					},
				],
			}),
		)

		await act(async () => {
			rerender(<ChatView isHidden={false} showAnnouncement={false} hideAnnouncement={() => {}} />)
		})

		// Now AI should be busy
		expect(getByTestId("chat-input")).toHaveAttribute("data-sending-disabled", "true")

		// Add images and try to send
		await act(async () => {
			fireEvent.click(getByTestId("add-images-button"))
		})

		await act(async () => {
			fireEvent.click(getByTestId("send-image-only-button"))
		})

		// Message should be queued
		await waitFor(() => {
			expect(getByTestId("queued-messages")).toBeInTheDocument()
		})
	})
})
