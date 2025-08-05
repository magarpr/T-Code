import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import mermaid from "mermaid"
import MermaidBlock from "../MermaidBlock"

// Mock mermaid module
vi.mock("mermaid", () => ({
	default: {
		initialize: vi.fn(),
		parse: vi.fn(),
		render: vi.fn(),
	},
}))

// Mock vscode API
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock translation hook
vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				"common:mermaid.loading": "Loading diagram...",
				"common:mermaid.render_error": "Failed to render diagram",
			}
			return translations[key] || key
		},
	}),
}))

// Mock clipboard hook
let mockCopyWithFeedback = vi.fn()
vi.mock("@src/utils/clipboard", () => ({
	useCopyToClipboard: () => ({
		showCopyFeedback: false,
		copyWithFeedback: mockCopyWithFeedback,
	}),
}))

// Mock CodeBlock component
vi.mock("../CodeBlock", () => ({
	default: ({ source, language }: { source: string; language: string }) => (
		<div data-testid="code-block" data-language={language}>
			{source}
		</div>
	),
}))

// Mock MermaidButton component
vi.mock("@/components/common/MermaidButton", () => ({
	MermaidButton: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock canvas API for SVG to PNG conversion
const mockToDataURL = vi.fn(() => "data:image/png;base64,mockpngdata")
const mockGetContext = vi.fn(() => ({
	fillStyle: "",
	fillRect: vi.fn(),
	drawImage: vi.fn(),
	imageSmoothingEnabled: true,
	imageSmoothingQuality: "high",
}))

HTMLCanvasElement.prototype.toDataURL = mockToDataURL
HTMLCanvasElement.prototype.getContext = mockGetContext as any

describe("MermaidBlock", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockCopyWithFeedback = vi.fn()
		mockToDataURL.mockClear()
		mockGetContext.mockClear()
	})

	it("renders loading state initially", () => {
		vi.mocked(mermaid.parse).mockReturnValue(new Promise(() => {})) // Never resolves
		render(<MermaidBlock code="flowchart TD\n  A --> B" />)
		expect(screen.getByText("Loading diagram...")).toBeInTheDocument()
	})

	it("renders mermaid diagram successfully", async () => {
		const svgContent = "<svg><text>Test Diagram</text></svg>"
		vi.mocked(mermaid.parse).mockResolvedValue({} as any)
		vi.mocked(mermaid.render).mockResolvedValue({ svg: svgContent } as any)

		render(<MermaidBlock code="flowchart TD\n  A --> B" />)

		await waitFor(() => {
			const container = screen.getByTestId("svg-container")
			expect(container.innerHTML).toBe(svgContent)
		})
	})

	describe("Error handling", () => {
		it("displays error message when mermaid parsing fails", async () => {
			const errorMessage = "Parse error on line 2: Expecting 'AMP', 'COLON', got 'LINK_ID'"
			vi.mocked(mermaid.parse).mockRejectedValue(new Error(errorMessage))

			render(<MermaidBlock code="flowchart TD A[Users Credentials] --> B{AuthController@che" />)

			await waitFor(() => {
				expect(screen.getByText("Failed to render diagram")).toBeInTheDocument()
			})
		})

		it("shows enhanced error message for unclosed brackets", async () => {
			const errorMessage = "Parse error on line 2: Expecting 'AMP', 'COLON', got 'LINK_ID'"
			vi.mocked(mermaid.parse).mockRejectedValue(new Error(errorMessage))

			render(<MermaidBlock code="flowchart TD A[Users Credentials --> B" />)

			await waitFor(() => {
				expect(screen.getByText("Failed to render diagram")).toBeInTheDocument()
			})

			// Click to expand error
			const errorHeader = screen.getByText("Failed to render diagram").parentElement
			await userEvent.click(errorHeader!)

			await waitFor(() => {
				const errorDetails = screen.getByText(/You have unclosed square brackets/)
				expect(errorDetails).toBeInTheDocument()
			})
		})

		it("shows enhanced error message for unclosed braces", async () => {
			const errorMessage = "Parse error on line 2: Expecting 'AMP', 'COLON', got 'LINK_ID'"
			vi.mocked(mermaid.parse).mockRejectedValue(new Error(errorMessage))

			render(<MermaidBlock code="flowchart TD A{Decision --> B" />)

			await waitFor(() => {
				expect(screen.getByText("Failed to render diagram")).toBeInTheDocument()
			})

			// Click to expand error
			const errorHeader = screen.getByText("Failed to render diagram").parentElement
			await userEvent.click(errorHeader!)

			await waitFor(() => {
				const errorDetails = screen.getByText(/You have unclosed curly braces/)
				expect(errorDetails).toBeInTheDocument()
			})
		})

		it("shows suggestion for incomplete arrow connections", async () => {
			const errorMessage = "Parse error at end of input"
			vi.mocked(mermaid.parse).mockRejectedValue(new Error(errorMessage))

			render(<MermaidBlock code="flowchart TD\n  A --> " />)

			await waitFor(() => {
				expect(screen.getByText("Failed to render diagram")).toBeInTheDocument()
			})

			// Click to expand error
			const errorHeader = screen.getByText("Failed to render diagram").parentElement
			await userEvent.click(errorHeader!)

			await waitFor(() => {
				const errorDetails = screen.getByText(/Your diagram appears to end with an arrow/)
				expect(errorDetails).toBeInTheDocument()
			})
		})

		it("shows suggestion for missing diagram type", async () => {
			const errorMessage = "Parse error on line 1"
			vi.mocked(mermaid.parse).mockRejectedValue(new Error(errorMessage))

			render(<MermaidBlock code="A --> B" />)

			await waitFor(() => {
				expect(screen.getByText("Failed to render diagram")).toBeInTheDocument()
			})

			// Click to expand error
			const errorHeader = screen.getByText("Failed to render diagram").parentElement
			await userEvent.click(errorHeader!)

			await waitFor(() => {
				const errorDetails = screen.getByText(/Make sure your diagram starts with a valid diagram type/)
				expect(errorDetails).toBeInTheDocument()
			})
		})

		it("shows code block when error is expanded", async () => {
			const code = "flowchart TD A[Incomplete"
			const errorMessage = "Parse error"
			vi.mocked(mermaid.parse).mockRejectedValue(new Error(errorMessage))

			render(<MermaidBlock code={code} />)

			await waitFor(() => {
				expect(screen.getByText("Failed to render diagram")).toBeInTheDocument()
			})

			// Click to expand error
			const errorHeader = screen.getByText("Failed to render diagram").parentElement
			await userEvent.click(errorHeader!)

			await waitFor(() => {
				const codeBlock = screen.getByTestId("code-block")
				expect(codeBlock).toBeInTheDocument()
				expect(codeBlock).toHaveAttribute("data-language", "mermaid")
				expect(codeBlock).toHaveTextContent(code)
			})
		})

		it("allows copying error message and code", async () => {
			const code = "flowchart TD A[Incomplete"
			const errorMessage = "Parse error"
			vi.mocked(mermaid.parse).mockRejectedValue(new Error(errorMessage))

			render(<MermaidBlock code={code} />)

			await waitFor(() => {
				expect(screen.getByText("Failed to render diagram")).toBeInTheDocument()
			})

			// Find and click copy button
			const copyButton = screen.getByRole("button")
			await userEvent.click(copyButton)

			expect(mockCopyWithFeedback).toHaveBeenCalledWith(
				expect.stringContaining(`Error: ${errorMessage}`),
				expect.any(Object),
			)
			expect(mockCopyWithFeedback).toHaveBeenCalledWith(expect.stringContaining("```mermaid"), expect.any(Object))
		})
	})

	it("renders mermaid diagram and allows interaction", async () => {
		const svgContent = '<svg width="100" height="100"><rect width="100" height="100"></rect></svg>'
		vi.mocked(mermaid.parse).mockResolvedValue({} as any)
		vi.mocked(mermaid.render).mockResolvedValue({ svg: svgContent } as any)

		render(<MermaidBlock code="flowchart TD\n  A --> B" />)

		await waitFor(() => {
			const container = screen.getByTestId("svg-container")
			expect(container.innerHTML).toBe(svgContent)
		})

		// Verify the SVG container is clickable
		const svgContainer = screen.getByTestId("svg-container")
		expect(svgContainer).toBeInTheDocument()
		expect(svgContainer).toHaveStyle({ cursor: "pointer" })
	})

	it("debounces diagram rendering", async () => {
		const { rerender } = render(<MermaidBlock code="flowchart TD\n  A --> B" />)

		// Initial parse call
		expect(mermaid.parse).toHaveBeenCalledTimes(0)

		// Wait for debounce
		await waitFor(
			() => {
				expect(mermaid.parse).toHaveBeenCalledTimes(1)
			},
			{ timeout: 600 },
		)

		// Quick re-renders should not trigger immediate parse
		rerender(<MermaidBlock code="flowchart TD\n  A --> C" />)
		rerender(<MermaidBlock code="flowchart TD\n  A --> D" />)

		// Should still be 1 call
		expect(mermaid.parse).toHaveBeenCalledTimes(1)

		// Wait for new debounce
		await waitFor(
			() => {
				expect(mermaid.parse).toHaveBeenCalledTimes(2)
			},
			{ timeout: 600 },
		)

		// Should parse the latest code
		expect(mermaid.parse).toHaveBeenLastCalledWith("flowchart TD\\n  A --> D")
	})
})
