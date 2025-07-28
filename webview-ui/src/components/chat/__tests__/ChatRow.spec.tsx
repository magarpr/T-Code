import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import ChatRow from "../ChatRow"
import { ClineMessage } from "@roo-code/types"

// Mock the dependencies
vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		mcpServers: [],
		alwaysAllowMcp: false,
		currentCheckpoint: null,
		mode: "code",
	}),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
}))

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("react-use", () => ({
	useSize: (element: any) => [element, { height: 100 }],
	useMount: (fn: () => void) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { useEffect } = require("react")
		// eslint-disable-next-line react-hooks/exhaustive-deps
		useEffect(fn, [])
	},
}))

vi.mock("@src/utils/clipboard", () => ({
	useCopyToClipboard: () => ({
		copyWithFeedback: vi.fn().mockResolvedValue(true),
	}),
}))

describe("ChatRow", () => {
	const mockOnToggleExpand = vi.fn()
	const mockOnHeightChange = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should render reasoning block expanded when it's the last message", () => {
		const reasoningMessage: ClineMessage = {
			ts: Date.now(),
			type: "say",
			say: "reasoning",
			text: "This is my reasoning process...",
			partial: false,
		}

		render(
			<ChatRow
				message={reasoningMessage}
				isExpanded={false}
				isLast={true}
				isStreaming={false}
				onToggleExpand={mockOnToggleExpand}
				onHeightChange={mockOnHeightChange}
			/>,
		)

		// Check that the reasoning content is visible (expanded)
		expect(screen.getByText("This is my reasoning process...")).toBeInTheDocument()
	})

	it("should render reasoning block collapsed when it's not the last message", () => {
		const reasoningMessage: ClineMessage = {
			ts: Date.now(),
			type: "say",
			say: "reasoning",
			text: "This is my reasoning process...",
			partial: false,
		}

		render(
			<ChatRow
				message={reasoningMessage}
				isExpanded={false}
				isLast={false}
				isStreaming={false}
				onToggleExpand={mockOnToggleExpand}
				onHeightChange={mockOnHeightChange}
			/>,
		)

		// Check that the reasoning content is not visible (collapsed)
		expect(screen.queryByText("This is my reasoning process...")).not.toBeInTheDocument()
	})

	it("should auto-collapse reasoning block when isLast changes from true to false", () => {
		const reasoningMessage: ClineMessage = {
			ts: Date.now(),
			type: "say",
			say: "reasoning",
			text: "This is my reasoning process...",
			partial: false,
		}

		const { rerender } = render(
			<ChatRow
				message={reasoningMessage}
				isExpanded={false}
				isLast={true}
				isStreaming={false}
				onToggleExpand={mockOnToggleExpand}
				onHeightChange={mockOnHeightChange}
			/>,
		)

		// Initially expanded (last message)
		expect(screen.getByText("This is my reasoning process...")).toBeInTheDocument()

		// Rerender with isLast=false
		rerender(
			<ChatRow
				message={reasoningMessage}
				isExpanded={false}
				isLast={false}
				isStreaming={false}
				onToggleExpand={mockOnToggleExpand}
				onHeightChange={mockOnHeightChange}
			/>,
		)

		// Should be collapsed now
		expect(screen.queryByText("This is my reasoning process...")).not.toBeInTheDocument()
	})

	it("should not affect non-reasoning messages", () => {
		const textMessage: ClineMessage = {
			ts: Date.now(),
			type: "say",
			say: "text",
			text: "This is a regular text message",
			partial: false,
		}

		render(
			<ChatRow
				message={textMessage}
				isExpanded={false}
				isLast={true}
				isStreaming={false}
				onToggleExpand={mockOnToggleExpand}
				onHeightChange={mockOnHeightChange}
			/>,
		)

		// Regular text messages should always be visible
		expect(screen.getByText("This is a regular text message")).toBeInTheDocument()
	})

	it("should allow manual toggle of reasoning block", () => {
		const reasoningMessage: ClineMessage = {
			ts: Date.now(),
			type: "say",
			say: "reasoning",
			text: "This is my reasoning process...",
			partial: false,
		}

		render(
			<ChatRow
				message={reasoningMessage}
				isExpanded={false}
				isLast={false}
				isStreaming={false}
				onToggleExpand={mockOnToggleExpand}
				onHeightChange={mockOnHeightChange}
			/>,
		)

		// Find the reasoning block header and click it
		const reasoningHeader = screen.getByText("chat:reasoning.thinking")
		fireEvent.click(reasoningHeader.closest("div")!)

		// The content should now be visible after manual toggle
		expect(screen.getByText("This is my reasoning process...")).toBeInTheDocument()
	})
})
