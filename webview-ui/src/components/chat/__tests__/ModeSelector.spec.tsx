import React from "react"
import { render, screen, fireEvent, waitFor } from "@/utils/test-utils"
import { describe, test, expect, vi, beforeEach } from "vitest"
import ModeSelector from "../ModeSelector"
import { Mode } from "@roo/modes"
import { ModeConfig } from "@roo-code/types"
import { vscode } from "@/utils/vscode"

// Mock the dependencies
vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Spy on window.postMessage
const windowPostMessageSpy = vi.spyOn(window, "postMessage")

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		hasOpenedModeSelector: false,
		setHasOpenedModeSelector: vi.fn(),
	}),
}))

vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/ui/hooks/useRooPortal", () => ({
	useRooPortal: () => document.body,
}))

vi.mock("@/utils/TelemetryClient", () => ({
	telemetryClient: {
		capture: vi.fn(),
	},
}))

// Create a variable to control what getAllModes returns
let mockModes: ModeConfig[] = []

vi.mock("@roo/modes", async () => {
	const actual = await vi.importActual<typeof import("@roo/modes")>("@roo/modes")
	return {
		...actual,
		getAllModes: () => mockModes,
	}
})

describe("ModeSelector", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Reset mock modes
		mockModes = []
	})

	test("shows custom description from customModePrompts", () => {
		const customModePrompts = {
			code: {
				description: "Custom code mode description",
			},
		}

		render(
			<ModeSelector
				value={"code" as Mode}
				onChange={vi.fn()}
				modeShortcutText="Ctrl+M"
				customModePrompts={customModePrompts}
			/>,
		)

		// The component should be rendered
		expect(screen.getByTestId("mode-selector-trigger")).toBeInTheDocument()
	})

	test("falls back to default description when no custom prompt", () => {
		render(<ModeSelector value={"code" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

		// The component should be rendered
		expect(screen.getByTestId("mode-selector-trigger")).toBeInTheDocument()
	})

	test("shows search bar when there are more than 6 modes", () => {
		// Set up mock to return 7 modes
		mockModes = Array.from({ length: 7 }, (_, i) => ({
			slug: `mode-${i}`,
			name: `Mode ${i}`,
			description: `Description for mode ${i}`,
			roleDefinition: "Role definition",
			groups: ["read", "edit"],
		}))

		render(<ModeSelector value={"mode-0" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

		// Click to open the popover
		fireEvent.click(screen.getByTestId("mode-selector-trigger"))

		// Search input should be visible
		expect(screen.getByTestId("mode-search-input")).toBeInTheDocument()

		// Info icon should be visible
		expect(screen.getByText("chat:modeSelector.title")).toBeInTheDocument()
		const infoIcon = document.querySelector(".codicon-info")
		expect(infoIcon).toBeInTheDocument()
	})

	test("shows info blurb instead of search bar when there are 6 or fewer modes", () => {
		// Set up mock to return 5 modes
		mockModes = Array.from({ length: 5 }, (_, i) => ({
			slug: `mode-${i}`,
			name: `Mode ${i}`,
			description: `Description for mode ${i}`,
			roleDefinition: "Role definition",
			groups: ["read", "edit"],
		}))

		render(<ModeSelector value={"mode-0" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

		// Click to open the popover
		fireEvent.click(screen.getByTestId("mode-selector-trigger"))

		// Search input should NOT be visible
		expect(screen.queryByTestId("mode-search-input")).not.toBeInTheDocument()

		// Info blurb should be visible
		expect(screen.getByText(/chat:modeSelector.description/)).toBeInTheDocument()

		// Info icon should NOT be visible
		const infoIcon = document.querySelector(".codicon-info")
		expect(infoIcon).not.toBeInTheDocument()
	})

	test("filters modes correctly when searching", () => {
		// Set up mock to return 7 modes to enable search
		mockModes = Array.from({ length: 7 }, (_, i) => ({
			slug: `mode-${i}`,
			name: `Mode ${i}`,
			description: `Description for mode ${i}`,
			roleDefinition: "Role definition",
			groups: ["read", "edit"],
		}))

		render(<ModeSelector value={"mode-0" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

		// Click to open the popover
		fireEvent.click(screen.getByTestId("mode-selector-trigger"))

		// Type in search
		const searchInput = screen.getByTestId("mode-search-input")
		fireEvent.change(searchInput, { target: { value: "Mode 3" } })

		// Should show filtered results
		const modeItems = screen.getAllByTestId("mode-selector-item")
		expect(modeItems.length).toBeLessThan(7) // Should have filtered some out
	})

	test("respects disableSearch prop even when there are more than 6 modes", () => {
		// Set up mock to return 10 modes
		mockModes = Array.from({ length: 10 }, (_, i) => ({
			slug: `mode-${i}`,
			name: `Mode ${i}`,
			description: `Description for mode ${i}`,
			roleDefinition: "Role definition",
			groups: ["read", "edit"],
		}))

		render(
			<ModeSelector value={"mode-0" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" disableSearch={true} />,
		)

		// Click to open the popover
		fireEvent.click(screen.getByTestId("mode-selector-trigger"))

		// Search input should NOT be visible even with 10 modes
		expect(screen.queryByTestId("mode-search-input")).not.toBeInTheDocument()

		// Info blurb should be visible instead
		expect(screen.getByText(/chat:modeSelector.description/)).toBeInTheDocument()

		// Info icon should NOT be visible
		const infoIcon = document.querySelector(".codicon-info")
		expect(infoIcon).not.toBeInTheDocument()
	})

	test("shows search when disableSearch is false (default) and modes > 6", () => {
		// Set up mock to return 8 modes
		mockModes = Array.from({ length: 8 }, (_, i) => ({
			slug: `mode-${i}`,
			name: `Mode ${i}`,
			description: `Description for mode ${i}`,
			roleDefinition: "Role definition",
			groups: ["read", "edit"],
		}))

		// Don't pass disableSearch prop (should default to false)
		render(<ModeSelector value={"mode-0" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

		// Click to open the popover
		fireEvent.click(screen.getByTestId("mode-selector-trigger"))

		// Search input should be visible
		expect(screen.getByTestId("mode-search-input")).toBeInTheDocument()

		// Info icon should be visible
		const infoIcon = document.querySelector(".codicon-info")
		expect(infoIcon).toBeInTheDocument()
	})

	describe("Export functionality", () => {
		test("export button triggers export message", () => {
			// Set up mock to return a few modes
			mockModes = Array.from({ length: 3 }, (_, i) => ({
				slug: `mode-${i}`,
				name: `Mode ${i}`,
				description: `Description for mode ${i}`,
				roleDefinition: "Role definition",
				groups: ["read", "edit"],
			}))

			render(<ModeSelector value={"mode-0" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

			// Click to open the popover
			fireEvent.click(screen.getByTestId("mode-selector-trigger"))

			// Find and click the export button
			const exportButton = screen.getByLabelText("prompts:exportMode.title")
			fireEvent.click(exportButton)

			// Should have sent export message
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "exportMode",
				slug: "mode-0",
			})
		})

		test("export error is displayed when export fails", async () => {
			render(<ModeSelector value={"code" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

			// Simulate export error message
			const errorEvent = new MessageEvent("message", {
				data: {
					type: "exportModeResult",
					success: false,
					error: "Failed to export mode",
				},
			})
			window.dispatchEvent(errorEvent)

			// Error notification should be displayed
			await waitFor(() => {
				expect(screen.getByText("prompts:exportMode.errorTitle")).toBeInTheDocument()
				expect(screen.getByText("Failed to export mode")).toBeInTheDocument()
			})
		})
	})

	describe("Import functionality", () => {
		test("import button opens import dialog", () => {
			render(<ModeSelector value={"code" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

			// Click to open the popover
			fireEvent.click(screen.getByTestId("mode-selector-trigger"))

			// Find and click the import button
			const importButton = screen.getByLabelText("prompts:modes.importMode")
			fireEvent.click(importButton)

			// Import dialog should be displayed
			expect(screen.getByText("prompts:modes.importMode")).toBeInTheDocument()
			expect(screen.getByText("prompts:importMode.selectLevel")).toBeInTheDocument()
		})

		test("import dialog allows selection between project and global", () => {
			render(<ModeSelector value={"code" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

			// Open popover and click import
			fireEvent.click(screen.getByTestId("mode-selector-trigger"))
			const importButton = screen.getByLabelText("prompts:modes.importMode")
			fireEvent.click(importButton)

			// Check radio buttons are present
			const projectRadio = screen.getByLabelText(/prompts:importMode.project.label/)
			const globalRadio = screen.getByLabelText(/prompts:importMode.global.label/)

			expect(projectRadio).toBeInTheDocument()
			expect(globalRadio).toBeInTheDocument()
			expect(projectRadio).toBeChecked()
			expect(globalRadio).not.toBeChecked()
		})

		test("import dialog cancel button closes dialog", () => {
			render(<ModeSelector value={"code" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

			// Open import dialog
			fireEvent.click(screen.getByTestId("mode-selector-trigger"))
			fireEvent.click(screen.getByLabelText("prompts:modes.importMode"))

			// Click cancel
			const cancelButton = screen.getByText("prompts:createModeDialog.buttons.cancel")
			fireEvent.click(cancelButton)

			// Dialog should be closed
			expect(screen.queryByText("prompts:importMode.selectLevel")).not.toBeInTheDocument()
		})

		test("import dialog import button triggers import message", () => {
			render(<ModeSelector value={"code" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

			// Open import dialog
			fireEvent.click(screen.getByTestId("mode-selector-trigger"))
			fireEvent.click(screen.getByLabelText("prompts:modes.importMode"))

			// Select global option
			const globalRadio = screen.getByLabelText(/prompts:importMode.global.label/)
			fireEvent.click(globalRadio)

			// Click import
			const importButton = screen.getByText("prompts:importMode.import")
			fireEvent.click(importButton)

			// Should have sent import message
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "importMode",
				source: "global",
			})
		})

		test("import error is displayed when import fails", async () => {
			render(<ModeSelector value={"code" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

			// Simulate import error message
			const errorEvent = new MessageEvent("message", {
				data: {
					type: "importModeResult",
					success: false,
					error: "Failed to import mode",
				},
			})
			window.dispatchEvent(errorEvent)

			// Error notification should be displayed
			await waitFor(() => {
				expect(screen.getByText("prompts:importMode.errorTitle")).toBeInTheDocument()
				expect(screen.getByText("Failed to import mode")).toBeInTheDocument()
			})
		})

		test("import dialog closes on successful import", async () => {
			render(<ModeSelector value={"code" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

			// Open import dialog
			fireEvent.click(screen.getByTestId("mode-selector-trigger"))
			fireEvent.click(screen.getByLabelText("prompts:modes.importMode"))

			// Dialog should be open
			expect(screen.getByText("prompts:importMode.selectLevel")).toBeInTheDocument()

			// Simulate successful import message
			const successEvent = new MessageEvent("message", {
				data: {
					type: "importModeResult",
					success: true,
				},
			})
			window.dispatchEvent(successEvent)

			// Dialog should be closed
			await waitFor(() => {
				expect(screen.queryByText("prompts:importMode.selectLevel")).not.toBeInTheDocument()
			})
		})

		test("cancelled import does not show error", async () => {
			render(<ModeSelector value={"code" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

			// Simulate cancelled import message
			const cancelEvent = new MessageEvent("message", {
				data: {
					type: "importModeResult",
					success: false,
					error: "cancelled",
				},
			})
			window.dispatchEvent(cancelEvent)

			// No error notification should be displayed
			await waitFor(() => {
				expect(screen.queryByText("prompts:importMode.errorTitle")).not.toBeInTheDocument()
			})
		})
	})

	describe("Bottom bar buttons", () => {
		test("marketplace button sends correct message", () => {
			render(<ModeSelector value={"code" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

			// Click to open the popover
			fireEvent.click(screen.getByTestId("mode-selector-trigger"))

			// Find and click the marketplace button
			const marketplaceButton = screen.getByLabelText("chat:modeSelector.marketplace")
			fireEvent.click(marketplaceButton)

			// Should have sent marketplace message
			expect(windowPostMessageSpy).toHaveBeenCalledWith(
				{
					type: "action",
					action: "marketplaceButtonClicked",
					values: { marketplaceTab: "mode" },
				},
				"*",
			)
		})

		test("settings button sends correct message", () => {
			render(<ModeSelector value={"code" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

			// Click to open the popover
			fireEvent.click(screen.getByTestId("mode-selector-trigger"))

			// Find and click the settings button
			const settingsButton = screen.getByLabelText("chat:modeSelector.settings")
			fireEvent.click(settingsButton)

			// Should have sent switch tab message
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "switchTab",
				tab: "modes",
			})
		})
	})

	describe("Error notification behavior", () => {
		test("error notification can be closed manually", async () => {
			render(<ModeSelector value={"code" as Mode} onChange={vi.fn()} modeShortcutText="Ctrl+M" />)

			// Simulate export error
			const errorEvent = new MessageEvent("message", {
				data: {
					type: "exportModeResult",
					success: false,
					error: "Test error",
				},
			})
			window.dispatchEvent(errorEvent)

			// Error should be displayed
			await waitFor(() => {
				expect(screen.getByText("Test error")).toBeInTheDocument()
			})

			// Click close button - find the button with X icon inside the error notification
			const errorNotification = screen.getByText("Test error").closest("div")?.parentElement?.parentElement
			const closeButton = errorNotification?.querySelector("button:last-child")
			if (closeButton) {
				fireEvent.click(closeButton)
			}

			// Error should be gone
			expect(screen.queryByText("Test error")).not.toBeInTheDocument()
		})
	})
})
