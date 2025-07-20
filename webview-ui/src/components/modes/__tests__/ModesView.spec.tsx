// npx vitest src/components/modes/__tests__/ModesView.spec.tsx

import { render, screen, fireEvent, waitFor } from "@/utils/test-utils"
import ModesView from "../ModesView"
import { ExtensionStateContext } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"

// Mock vscode API
vitest.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vitest.fn(),
	},
}))

const mockExtensionState = {
	customModePrompts: {},
	listApiConfigMeta: [
		{ id: "config1", name: "Config 1" },
		{ id: "config2", name: "Config 2" },
	],
	enhancementApiConfigId: "",
	setEnhancementApiConfigId: vitest.fn(),
	mode: "code",
	customModes: [],
	customSupportPrompts: [],
	currentApiConfigName: "",
	customInstructions: "Initial instructions",
	setCustomInstructions: vitest.fn(),
	modeUsageFrequency: {},
}

const renderPromptsView = (props = {}) => {
	const mockOnDone = vitest.fn()
	return render(
		<ExtensionStateContext.Provider value={{ ...mockExtensionState, ...props } as any}>
			<ModesView onDone={mockOnDone} />
		</ExtensionStateContext.Provider>,
	)
}

Element.prototype.scrollIntoView = vitest.fn()

describe("PromptsView", () => {
	beforeEach(() => {
		vitest.clearAllMocks()
	})

	it("displays the current mode name in the select trigger", () => {
		renderPromptsView({ mode: "code" })
		const selectTrigger = screen.getByTestId("mode-select-trigger")
		expect(selectTrigger).toHaveTextContent("Code")
	})

	it("opens the mode selection popover when the trigger is clicked", async () => {
		renderPromptsView()
		const selectTrigger = screen.getByTestId("mode-select-trigger")
		fireEvent.click(selectTrigger)
		await waitFor(() => {
			expect(selectTrigger).toHaveAttribute("aria-expanded", "true")
		})
	})

	it("filters mode options based on search input", async () => {
		renderPromptsView()
		const selectTrigger = screen.getByTestId("mode-select-trigger")
		fireEvent.click(selectTrigger)

		const searchInput = screen.getByTestId("mode-search-input")
		fireEvent.change(searchInput, { target: { value: "ask" } })

		await waitFor(() => {
			expect(screen.getByTestId("mode-option-ask")).toBeInTheDocument()
			expect(screen.queryByTestId("mode-option-code")).not.toBeInTheDocument()
			expect(screen.queryByTestId("mode-option-architect")).not.toBeInTheDocument()
		})
	})

	it("selects a mode from the dropdown and sends update message", async () => {
		renderPromptsView()
		const selectTrigger = screen.getByTestId("mode-select-trigger")
		fireEvent.click(selectTrigger)

		const askOption = await waitFor(() => screen.getByTestId("mode-option-ask"))
		fireEvent.click(askOption)

		expect(mockExtensionState.setEnhancementApiConfigId).not.toHaveBeenCalled() // Ensure this is not called by mode switch
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "mode",
			text: "ask",
		})
		await waitFor(() => {
			expect(selectTrigger).toHaveAttribute("aria-expanded", "false")
		})
	})

	it("handles prompt changes correctly", async () => {
		renderPromptsView()

		// Get the textarea
		const textarea = await waitFor(() => screen.getByTestId("code-prompt-textarea"))

		// Simulate VSCode TextArea change event
		const changeEvent = new CustomEvent("change", {
			detail: {
				target: {
					value: "New prompt value",
				},
			},
		})

		fireEvent(textarea, changeEvent)

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "updatePrompt",
			promptMode: "code",
			customPrompt: { roleDefinition: "New prompt value" },
		})
	})

	it("resets role definition only for built-in modes", async () => {
		const customMode = {
			slug: "custom-mode",
			name: "Custom Mode",
			roleDefinition: "Custom role",
			groups: [],
		}

		// Test with built-in mode (code)
		const { unmount } = render(
			<ExtensionStateContext.Provider
				value={{ ...mockExtensionState, mode: "code", customModes: [customMode] } as any}>
				<ModesView onDone={vitest.fn()} />
			</ExtensionStateContext.Provider>,
		)

		// Find and click the role definition reset button
		const resetButton = screen.getByTestId("role-definition-reset")
		expect(resetButton).toBeInTheDocument()
		await fireEvent.click(resetButton)

		// Verify it only resets role definition
		// When resetting a built-in mode's role definition, the field should be removed entirely
		// from the customPrompt object, not set to undefined.
		// This allows the default role definition from the built-in mode to be used instead.
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "updatePrompt",
			promptMode: "code",
			customPrompt: {}, // Empty object because the role definition field is removed entirely
		})

		// Cleanup before testing custom mode
		unmount()

		// Test with custom mode
		render(
			<ExtensionStateContext.Provider
				value={{ ...mockExtensionState, mode: "custom-mode", customModes: [customMode] } as any}>
				<ModesView onDone={vitest.fn()} />
			</ExtensionStateContext.Provider>,
		)

		// Verify reset button is not present for custom mode
		expect(screen.queryByTestId("role-definition-reset")).not.toBeInTheDocument()
	})

	it("description section behavior for different mode types", async () => {
		const customMode = {
			slug: "custom-mode",
			name: "Custom Mode",
			roleDefinition: "Custom role",
			description: "Custom description",
			groups: [],
		}

		// Test with built-in mode (code) - description section should be shown with reset button
		const { unmount } = render(
			<ExtensionStateContext.Provider
				value={{ ...mockExtensionState, mode: "code", customModes: [customMode] } as any}>
				<ModesView onDone={vitest.fn()} />
			</ExtensionStateContext.Provider>,
		)

		// Verify description reset button IS present for built-in modes
		// because built-in modes can have their descriptions customized and reset
		expect(screen.queryByTestId("description-reset")).toBeInTheDocument()

		// Cleanup before testing custom mode
		unmount()

		// Test with custom mode - description section should be shown
		render(
			<ExtensionStateContext.Provider
				value={{ ...mockExtensionState, mode: "custom-mode", customModes: [customMode] } as any}>
				<ModesView onDone={vitest.fn()} />
			</ExtensionStateContext.Provider>,
		)

		// Verify description section is present for custom modes
		// but reset button is NOT present (since custom modes manage their own descriptions)
		expect(screen.queryByTestId("description-reset")).not.toBeInTheDocument()

		// Verify the description text field is present for custom modes
		expect(screen.getByTestId("custom-mode-description-textfield")).toBeInTheDocument()
	})

	it("handles clearing custom instructions correctly", async () => {
		const setCustomInstructions = vitest.fn()
		renderPromptsView({
			...mockExtensionState,
			customInstructions: "Initial instructions",
			setCustomInstructions,
		})

		const textarea = screen.getByTestId("global-custom-instructions-textarea")

		// Simulate VSCode TextArea change event with empty value
		// We need to simulate both the CustomEvent format and regular event format
		// since the component handles both
		Object.defineProperty(textarea, "value", {
			writable: true,
			value: "",
		})

		const changeEvent = new Event("change", { bubbles: true })
		fireEvent(textarea, changeEvent)

		// The component calls setCustomInstructions with value || undefined
		// Since empty string is falsy, it should be undefined
		expect(setCustomInstructions).toHaveBeenCalledWith(undefined)
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "customInstructions",
			text: undefined,
		})
	})

	describe("Mode sorting by usage frequency", () => {
		it("sorts modes by usage frequency in descending order", async () => {
			const modeUsageFrequency = {
				ask: 10,
				code: 5,
				architect: 15,
				debug: 3,
			}

			renderPromptsView({ modeUsageFrequency })

			// Open the mode selector
			const selectTrigger = screen.getByTestId("mode-select-trigger")
			fireEvent.click(selectTrigger)

			// Wait for the dropdown to open
			await waitFor(() => {
				expect(selectTrigger).toHaveAttribute("aria-expanded", "true")
			})

			// Get all mode options
			const modeOptions = screen.getAllByTestId(/^mode-option-/)
			const modeIds = modeOptions.map((option) => option.getAttribute("data-testid")?.replace("mode-option-", ""))

			// Verify the order - architect (15) should be first, ask (10) second, code (5) third, debug (3) fourth
			expect(modeIds[0]).toBe("architect")
			expect(modeIds[1]).toBe("ask")
			expect(modeIds[2]).toBe("code")
			expect(modeIds[3]).toBe("debug")
		})

		it("maintains original order for modes with equal usage frequency", async () => {
			const modeUsageFrequency = {
				code: 5,
				architect: 5,
				ask: 5,
			}

			renderPromptsView({ modeUsageFrequency })

			// Open the mode selector
			const selectTrigger = screen.getByTestId("mode-select-trigger")
			fireEvent.click(selectTrigger)

			// Wait for the dropdown to open
			await waitFor(() => {
				expect(selectTrigger).toHaveAttribute("aria-expanded", "true")
			})

			// Get all mode options
			const modeOptions = screen.getAllByTestId(/^mode-option-/)
			const modeIds = modeOptions.map((option) => option.getAttribute("data-testid")?.replace("mode-option-", ""))

			// When frequencies are equal, modes should maintain their original order
			// The original order is: architect, code, ask, debug, orchestrator (from modes array)
			expect(modeIds[0]).toBe("architect")
			expect(modeIds[1]).toBe("code")
			expect(modeIds[2]).toBe("ask")
		})

		it("places modes with no usage data at the end", async () => {
			const modeUsageFrequency = {
				code: 10,
				architect: 5,
				// ask and debug have no usage data
			}

			renderPromptsView({ modeUsageFrequency })

			// Open the mode selector
			const selectTrigger = screen.getByTestId("mode-select-trigger")
			fireEvent.click(selectTrigger)

			// Wait for the dropdown to open
			await waitFor(() => {
				expect(selectTrigger).toHaveAttribute("aria-expanded", "true")
			})

			// Get all mode options
			const modeOptions = screen.getAllByTestId(/^mode-option-/)
			const modeIds = modeOptions.map((option) => option.getAttribute("data-testid")?.replace("mode-option-", ""))

			// code (10) should be first, architect (5) second, then modes with no usage
			expect(modeIds[0]).toBe("code")
			expect(modeIds[1]).toBe("architect")
			// ask and debug should be after the modes with usage data
			expect(modeIds.indexOf("ask")).toBeGreaterThan(1)
			expect(modeIds.indexOf("debug")).toBeGreaterThan(1)
		})

		it("handles empty usage frequency object correctly", async () => {
			renderPromptsView({ modeUsageFrequency: {} })

			// Open the mode selector
			const selectTrigger = screen.getByTestId("mode-select-trigger")
			fireEvent.click(selectTrigger)

			// Wait for the dropdown to open
			await waitFor(() => {
				expect(selectTrigger).toHaveAttribute("aria-expanded", "true")
			})

			// Get all mode options
			const modeOptions = screen.getAllByTestId(/^mode-option-/)

			// Should show all modes in their original order
			expect(modeOptions.length).toBeGreaterThan(0)
		})

		it("includes custom modes in sorting", async () => {
			const customMode = {
				slug: "custom-mode",
				name: "Custom Mode",
				roleDefinition: "Custom role",
				groups: [],
			}

			const modeUsageFrequency = {
				"custom-mode": 20,
				code: 10,
				architect: 5,
			}

			renderPromptsView({
				modeUsageFrequency,
				customModes: [customMode],
			})

			// Open the mode selector
			const selectTrigger = screen.getByTestId("mode-select-trigger")
			fireEvent.click(selectTrigger)

			// Wait for the dropdown to open
			await waitFor(() => {
				expect(selectTrigger).toHaveAttribute("aria-expanded", "true")
			})

			// Get all mode options
			const modeOptions = screen.getAllByTestId(/^mode-option-/)
			const modeIds = modeOptions.map((option) => option.getAttribute("data-testid")?.replace("mode-option-", ""))

			// custom-mode (20) should be first, code (10) second, architect (5) third
			expect(modeIds[0]).toBe("custom-mode")
			expect(modeIds[1]).toBe("code")
			expect(modeIds[2]).toBe("architect")
		})
	})
})
