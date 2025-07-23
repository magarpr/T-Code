import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ChatRowContent } from "../ChatRow"
import { ClineMessage } from "@roo-code/types"
import { TooltipProvider } from "@src/components/ui/tooltip"

// Mock dependencies
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	Trans: ({ i18nKey, children }: any) => <span>{i18nKey || children}</span>,
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
}))

vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		mcpServers: [],
		alwaysAllowMcp: false,
		currentCheckpoint: null,
		mode: "code",
	}),
}))

vi.mock("@src/utils/clipboard", () => ({
	useCopyToClipboard: () => ({
		copyWithFeedback: vi.fn().mockResolvedValue(true),
	}),
}))

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

describe("ChatRow", () => {
	const mockProps = {
		message: {} as ClineMessage,
		lastModifiedMessage: undefined,
		isExpanded: false,
		isLast: false,
		isStreaming: false,
		onToggleExpand: vi.fn(),
		onHeightChange: vi.fn(),
		onSuggestionClick: vi.fn(),
		onBatchFileResponse: vi.fn(),
		onFollowUpUnmount: vi.fn(),
		isFollowUpAnswered: false,
		editable: false,
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("API Request Error Display", () => {
		const renderWithProviders = (ui: React.ReactElement) => {
			return render(<TooltipProvider>{ui}</TooltipProvider>)
		}

		it("should display error details when API request fails and is expanded", () => {
			const errorDetails = JSON.stringify(
				{
					error: {
						type: "invalid_request_error",
						message: "Invalid API key provided",
					},
					status: 401,
				},
				null,
				2,
			)

			const failedApiMessage: ClineMessage = {
				ts: Date.now(),
				type: "say",
				say: "api_req_started",
				text: JSON.stringify({
					request: "Test API request",
					errorDetails,
				}),
			}

			const { rerender } = renderWithProviders(
				<ChatRowContent {...mockProps} message={failedApiMessage} isExpanded={false} />,
			)

			// Should not show error details when collapsed
			expect(screen.queryByText(/invalid_request_error/)).not.toBeInTheDocument()

			// Expand the message
			rerender(
				<TooltipProvider>
					<ChatRowContent {...mockProps} message={failedApiMessage} isExpanded={true} />
				</TooltipProvider>,
			)

			// Should show error details when expanded
			expect(screen.getByText(/invalid_request_error/)).toBeInTheDocument()
			expect(screen.getByText(/Invalid API key provided/)).toBeInTheDocument()
		})

		it("should make failed API requests expandable", () => {
			const failedApiMessage: ClineMessage = {
				ts: Date.now(),
				type: "say",
				say: "api_req_started",
				text: JSON.stringify({
					request: "Test API request",
					streamingFailedMessage: "Connection timeout",
				}),
			}

			renderWithProviders(
				<ChatRowContent
					{...mockProps}
					message={failedApiMessage}
					lastModifiedMessage={{
						ts: Date.now(),
						type: "ask",
						ask: "api_req_failed",
						text: "API request failed",
					}}
					isLast={true}
				/>,
			)

			// Find the header div that should be clickable
			const headerDiv = screen.getByText("chat:apiRequest.failed").closest("div")?.parentElement
			expect(headerDiv).toBeTruthy()

			// Click to expand
			fireEvent.click(headerDiv!)
			expect(mockProps.onToggleExpand).toHaveBeenCalledWith(failedApiMessage.ts)
		})

		it("should show streaming failed message when present", () => {
			const streamingFailedMessage = "Stream interrupted: Network error"
			const failedApiMessage: ClineMessage = {
				ts: Date.now(),
				type: "say",
				say: "api_req_started",
				text: JSON.stringify({
					request: "Test API request",
					cancelReason: "streaming_failed",
					streamingFailedMessage,
				}),
			}

			renderWithProviders(<ChatRowContent {...mockProps} message={failedApiMessage} />)

			expect(screen.getByText(streamingFailedMessage)).toBeInTheDocument()
			expect(screen.getByText("chat:apiRequest.streamingFailed")).toBeInTheDocument()
		})

		it("should show error details in expanded view when available", () => {
			const errorDetails = JSON.stringify(
				{
					error: {
						type: "rate_limit_error",
						message: "Rate limit exceeded",
						code: "rate_limit_exceeded",
					},
					status: 429,
					headers: {
						"retry-after": "60",
					},
				},
				null,
				2,
			)

			const failedApiMessage: ClineMessage = {
				ts: Date.now(),
				type: "say",
				say: "api_req_started",
				text: JSON.stringify({
					request: "Test API request",
					errorDetails,
					streamingFailedMessage: "Rate limit exceeded",
				}),
			}

			renderWithProviders(<ChatRowContent {...mockProps} message={failedApiMessage} isExpanded={true} />)

			// Should show the error details in the code accordion
			expect(screen.getByText(/rate_limit_error/)).toBeInTheDocument()
			// Use getAllByText since the error message appears in multiple places
			const errorMessages = screen.getAllByText(/Rate limit exceeded/)
			expect(errorMessages.length).toBeGreaterThan(0)
			expect(screen.getByText(/retry-after/)).toBeInTheDocument()
		})

		it("should show request details for successful API requests when expanded", () => {
			const successfulApiMessage: ClineMessage = {
				ts: Date.now(),
				type: "say",
				say: "api_req_started",
				text: JSON.stringify({
					request: "Test API request content",
					cost: 0.005,
					tokensIn: 100,
					tokensOut: 200,
				}),
			}

			renderWithProviders(<ChatRowContent {...mockProps} message={successfulApiMessage} isExpanded={true} />)

			// Should show the request content
			expect(screen.getByText(/Test API request content/)).toBeInTheDocument()
		})
	})
})
