// npx vitest src/components/webpreview/__tests__/WebPreviewView.spec.tsx

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// Mock vscode API before importing component
vi.mock("../../../utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Import component after mocking
import { WebPreviewView } from "../WebPreviewView"
import { vscode } from "../../../utils/vscode"

describe("WebPreviewView", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("should render with default URL", () => {
		render(<WebPreviewView />)

		const urlInput = screen.getByPlaceholderText("Enter URL...") as HTMLInputElement
		expect(urlInput.value).toBe("http://localhost:3000")
	})

	it("should render device dropdown with options", () => {
		render(<WebPreviewView />)

		const dropdown = screen.getByRole("combobox")
		expect(dropdown).toBeInTheDocument()

		// Check default selection
		expect(dropdown).toHaveTextContent("Desktop")
	})

	it("should render element selection button", () => {
		render(<WebPreviewView />)

		const selectButton = screen.getByText("Select Element")
		expect(selectButton).toBeInTheDocument()
	})

	it("should navigate when Go button is clicked", async () => {
		render(<WebPreviewView />)

		const urlInput = screen.getByPlaceholderText("Enter URL...") as HTMLInputElement
		const goButton = screen.getByText("Go")

		// Change URL
		await userEvent.clear(urlInput)
		await userEvent.type(urlInput, "https://example.com")

		// Click Go
		fireEvent.click(goButton)

		// Should post navigation message
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "webPreviewNavigate",
			url: "https://example.com",
		})
	})

	it("should navigate when Enter is pressed in URL input", async () => {
		render(<WebPreviewView />)

		const urlInput = screen.getByPlaceholderText("Enter URL...") as HTMLInputElement

		// Change URL and press Enter
		await userEvent.clear(urlInput)
		await userEvent.type(urlInput, "https://example.com{enter}")

		// Should post navigation message
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "webPreviewNavigate",
			url: "https://example.com",
		})
	})

	it("should toggle element selection mode", () => {
		render(<WebPreviewView />)

		const selectButton = screen.getByText("Select Element")

		// Click to enable selection
		fireEvent.click(selectButton)

		// Button should change to cancel mode
		expect(screen.getByText("Cancel Selection")).toBeInTheDocument()

		// Click again to disable
		fireEvent.click(screen.getByText("Cancel Selection"))

		// Should be back to normal
		expect(screen.getByText("Select Element")).toBeInTheDocument()
	})

	it("should handle device change", async () => {
		render(<WebPreviewView />)

		const dropdown = screen.getByRole("combobox")

		// Change device
		fireEvent.change(dropdown, { target: { value: "iPhone 14" } })

		// Check if device frame is updated
		await waitFor(() => {
			const deviceFrame = document.querySelector(".device-frame") as HTMLElement
			expect(deviceFrame.style.width).toBe("390px")
			expect(deviceFrame.style.height).toBe("844px")
		})
	})

	it("should post ready message on mount", () => {
		render(<WebPreviewView />)

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "webPreviewReady",
		})
	})

	it("should handle navigation message from extension", () => {
		render(<WebPreviewView />)

		const urlInput = screen.getByPlaceholderText("Enter URL...") as HTMLInputElement

		// Simulate message from extension
		const event = new MessageEvent("message", {
			data: {
				type: "webPreviewNavigate",
				url: "https://new-url.com",
			},
		})

		window.dispatchEvent(event)

		// URL should be updated
		expect(urlInput.value).toBe("https://new-url.com")
	})

	it("should handle device change message from extension", async () => {
		render(<WebPreviewView />)

		// Simulate message from extension
		const event = new MessageEvent("message", {
			data: {
				type: "webPreviewSetDevice",
				device: "iPad",
			},
		})

		window.dispatchEvent(event)

		// Device should be updated
		await waitFor(() => {
			const deviceFrame = document.querySelector(".device-frame") as HTMLElement
			expect(deviceFrame.style.width).toBe("768px")
			expect(deviceFrame.style.height).toBe("1024px")
		})
	})

	it("should handle element selection from iframe", () => {
		render(<WebPreviewView />)

		// Enable selection mode
		const selectButton = screen.getByText("Select Element")
		fireEvent.click(selectButton)

		// Simulate element selection message from iframe
		const event = new MessageEvent("message", {
			data: {
				type: "elementSelected",
				element: {
					html: "<button>Test</button>",
					selector: "button",
					xpath: "/html/body/button",
					position: { x: 10, y: 20, width: 100, height: 40 },
				},
			},
		})

		window.dispatchEvent(event)

		// Should post element to extension
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "webPreviewElementSelected",
			element: expect.objectContaining({
				html: "<button>Test</button>",
				selector: "button",
			}),
		})

		// Selection mode should be disabled
		expect(screen.getByText("Select Element")).toBeInTheDocument()
	})

	it("should scale device frame to fit container", async () => {
		// Mock container dimensions
		Object.defineProperty(HTMLElement.prototype, "clientWidth", {
			configurable: true,
			value: 800,
		})
		Object.defineProperty(HTMLElement.prototype, "clientHeight", {
			configurable: true,
			value: 600,
		})

		render(<WebPreviewView />)

		// Select a large device
		const dropdown = screen.getByRole("combobox")
		fireEvent.change(dropdown, { target: { value: "Desktop" } })

		// Device frame should be scaled down
		await waitFor(() => {
			const deviceFrame = document.querySelector(".device-frame") as HTMLElement
			const transform = deviceFrame.style.transform
			expect(transform).toContain("scale(")
			// Scale should be less than 1 for desktop on small container
			expect(parseFloat(transform.match(/scale\(([\d.]+)\)/)?.[1] || "1")).toBeLessThan(1)
		})
	})

	it("should render iframe with correct attributes", () => {
		render(<WebPreviewView />)

		const iframe = document.querySelector("iframe") as HTMLIFrameElement

		expect(iframe).toHaveAttribute("src", "http://localhost:3000")
		expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups")
		expect(iframe.style.width).toBe("100%")
		expect(iframe.style.height).toBe("100%")
		expect(iframe.style.border).toBe("none")
	})
})
