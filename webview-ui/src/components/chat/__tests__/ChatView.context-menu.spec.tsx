// npx vitest run src/components/chat/__tests__/ChatView.context-menu.spec.tsx

import React from "react"
import { render, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { vi } from "vitest"

import ChatView, { ChatViewProps } from "../ChatView"

// Mock the ExtensionStateContext
vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		didHydrateState: true,
		showWelcome: false,
		shouldShowAnnouncement: false,
		clineMessages: [],
		currentTaskItem: null,
		taskHistory: [],
		apiConfiguration: null,
		organizationAllowList: [],
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
		telemetrySetting: "unset",
		hasSystemPromptOverride: false,
		historyPreviewCollapsed: false,
		soundEnabled: false,
		soundVolume: 0.5,
	}),
}))

// Mock other dependencies
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("../ChatRow", () => ({
	default: function MockChatRow({ message }: { message: any }) {
		return <div data-testid="chat-row">{JSON.stringify(message)}</div>
	},
}))

vi.mock("../ChatTextArea", () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const React = require("react")
	return {
		default: React.forwardRef(function MockChatTextArea(
			_props: any,
			ref: React.ForwardedRef<{ focus: () => void }>,
		) {
			React.useImperativeHandle(ref, () => ({
				focus: vi.fn(),
			}))
			return <div data-testid="chat-text-area">Chat Text Area</div>
		}),
	}
})

vi.mock("../TaskHeader", () => ({
	default: function MockTaskHeader() {
		return <div data-testid="task-header">Task Header</div>
	},
}))

vi.mock("../AutoApproveMenu", () => ({
	default: function MockAutoApproveMenu() {
		return <div data-testid="auto-approve-menu">Auto Approve Menu</div>
	},
}))

vi.mock("@src/components/welcome/RooHero", () => ({
	default: function MockRooHero() {
		return <div data-testid="roo-hero">Roo Hero</div>
	},
}))

vi.mock("@src/components/welcome/RooTips", () => ({
	default: function MockRooTips() {
		return <div data-testid="roo-tips">Roo Tips</div>
	},
}))

vi.mock("../history/HistoryPreview", () => ({
	default: function MockHistoryPreview() {
		return <div data-testid="history-preview">History Preview</div>
	},
}))

vi.mock("@src/components/common/TelemetryBanner", () => ({
	default: function MockTelemetryBanner() {
		return <div data-testid="telemetry-banner">Telemetry Banner</div>
	},
}))

vi.mock("@src/components/common/VersionIndicator", () => ({
	default: function MockVersionIndicator() {
		return <div data-testid="version-indicator">Version Indicator</div>
	},
}))

const queryClient = new QueryClient({
	defaultOptions: {
		queries: { retry: false },
		mutations: { retry: false },
	},
})

const defaultProps: ChatViewProps = {
	isHidden: false,
	showAnnouncement: false,
	hideAnnouncement: vi.fn(),
}

const renderChatView = (props: Partial<ChatViewProps> = {}) => {
	return render(
		<QueryClientProvider client={queryClient}>
			<ChatView {...defaultProps} {...props} />
		</QueryClientProvider>,
	)
}

describe("ChatView - Context Menu Prevention", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should prevent default context menu on right-click", () => {
		const { container } = renderChatView()

		// Find the main chat view container
		const chatViewContainer = container.querySelector(".fixed")
		expect(chatViewContainer).toBeTruthy()

		// Create a context menu event
		const contextMenuEvent = new MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
			button: 2, // Right mouse button
		})

		// Spy on preventDefault
		const preventDefaultSpy = vi.spyOn(contextMenuEvent, "preventDefault")

		// Fire the context menu event
		if (chatViewContainer) {
			fireEvent(chatViewContainer, contextMenuEvent)
		}

		// Verify preventDefault was called
		expect(preventDefaultSpy).toHaveBeenCalled()
	})

	it("should prevent context menu on nested elements", () => {
		const { getByTestId } = renderChatView()

		// Test on a nested element (e.g., chat text area)
		const chatTextArea = getByTestId("chat-text-area")

		const contextMenuEvent = new MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
			button: 2,
		})

		const preventDefaultSpy = vi.spyOn(contextMenuEvent, "preventDefault")

		fireEvent(chatTextArea, contextMenuEvent)

		// The event should bubble up and be prevented at the parent level
		expect(preventDefaultSpy).toHaveBeenCalled()
	})
})
