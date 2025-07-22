import React from "react"
import { render, screen, fireEvent } from "@/utils/test-utils"
import { Bedrock } from "../Bedrock"
import { ProviderSettings } from "@roo-code/types"

// Mock the vscrui Checkbox component
vi.mock("vscrui", () => ({
	Checkbox: ({ children, checked, onChange }: any) => (
		<label data-testid={`checkbox-${children?.toString().replace(/\s+/g, "-").toLowerCase()}`}>
			<input
				type="checkbox"
				checked={checked}
				onChange={() => onChange(!checked)} // Toggle the checked state
				data-testid={`checkbox-input-${children?.toString().replace(/\s+/g, "-").toLowerCase()}`}
			/>
			{children}
		</label>
	),
}))

// Mock the VSCodeTextField component
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeTextField: ({
		children,
		value,
		onInput,
		placeholder,
		className,
		style,
		"data-testid": dataTestId,
		...rest
	}: any) => {
		// For all text fields - apply data-testid directly to input if provided
		return (
			<div
				data-testid={dataTestId ? `${dataTestId}-text-field` : "vscode-text-field"}
				className={className}
				style={style}>
				{children}
				<input
					type="text"
					value={value}
					onChange={(e) => onInput && onInput(e)}
					placeholder={placeholder}
					data-testid={dataTestId}
					{...rest}
				/>
			</div>
		)
	},
	VSCodeRadio: () => <div>Radio</div>,
	VSCodeRadioGroup: ({ children }: any) => <div>{children}</div>,
}))

// Mock the translation hook
vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

// Store mock callbacks globally for test access
const mockSelectCallbacks: { [key: string]: any } = {}

// Mock the UI components
vi.mock("@src/components/ui", () => ({
	Select: ({ children, onValueChange, value }: any) => {
		// Store the onValueChange callback on the window for testing (for new tests)
		if (typeof window !== "undefined") {
			;(window as any).__selectOnValueChange = onValueChange
		}
		// Also store the callback for test access (for existing tests)
		if (onValueChange) {
			mockSelectCallbacks.onValueChange = onValueChange
		}

		return (
			<div data-testid="select-component" data-value={value}>
				{children}
			</div>
		)
	},
	SelectContent: ({ children }: any) => <div>{children}</div>,
	SelectItem: ({ value }: any) => <div data-value={value}>Item</div>,
	SelectTrigger: ({ children }: any) => <div role="combobox">{children}</div>,
	SelectValue: () => <div>Value</div>,
	StandardTooltip: ({ children }: any) => <div>{children}</div>,
}))

// Mock the constants
vi.mock("../../constants", () => ({
	AWS_REGIONS: [{ value: "us-east-1", label: "US East (N. Virginia)" }],
}))

describe("Bedrock Component", () => {
	const mockSetApiConfigurationField = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should show text field when VPC endpoint checkbox is checked", () => {
		// Initial render with checkbox unchecked
		const apiConfiguration: Partial<ProviderSettings> = {
			awsBedrockEndpoint: "",
			awsUseProfile: true, // Use profile to avoid rendering other text fields
		}

		render(
			<Bedrock
				apiConfiguration={apiConfiguration as ProviderSettings}
				setApiConfigurationField={mockSetApiConfigurationField}
			/>,
		)

		// Text field should not be visible initially
		expect(screen.queryByTestId("vpc-endpoint-input")).not.toBeInTheDocument()

		// Click the checkbox
		fireEvent.click(screen.getByTestId("checkbox-input-settings:providers.awsbedrockvpc.usecustomvpcendpoint"))

		// Text field should now be visible
		expect(screen.getByTestId("vpc-endpoint-input")).toBeInTheDocument()
	})

	it("should hide text field when VPC endpoint checkbox is unchecked", () => {
		// Initial render with checkbox checked
		const apiConfiguration: Partial<ProviderSettings> = {
			awsBedrockEndpoint: "https://example.com",
			awsBedrockEndpointEnabled: true, // Need to explicitly set this to true
			awsUseProfile: true, // Use profile to avoid rendering other text fields
		}

		render(
			<Bedrock
				apiConfiguration={apiConfiguration as ProviderSettings}
				setApiConfigurationField={mockSetApiConfigurationField}
			/>,
		)

		// Text field should be visible initially
		expect(screen.getByTestId("vpc-endpoint-input")).toBeInTheDocument()

		// Click the checkbox to uncheck it
		fireEvent.click(screen.getByTestId("checkbox-input-settings:providers.awsbedrockvpc.usecustomvpcendpoint"))

		// Text field should now be hidden
		expect(screen.queryByTestId("vpc-endpoint-input")).not.toBeInTheDocument()

		// Should call setApiConfigurationField to update the enabled flag
		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsBedrockEndpointEnabled", false)
	})

	// Test Scenario 1: Input Validation Test
	describe("Input Validation", () => {
		it("should accept valid URL formats", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsBedrockEndpoint: "",
				awsBedrockEndpointEnabled: true,
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Find the input field
			const inputField = screen.getByTestId("vpc-endpoint-input")
			expect(inputField).toBeInTheDocument()

			// Test with a valid URL
			fireEvent.change(inputField, { target: { value: "https://bedrock.us-east-1.amazonaws.com" } })

			// Verify the configuration field was updated with the valid URL
			expect(mockSetApiConfigurationField).toHaveBeenCalledWith(
				"awsBedrockEndpoint",
				"https://bedrock.us-east-1.amazonaws.com",
			)
		})

		it("should handle empty URL input", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsBedrockEndpoint: "https://example.com",
				awsBedrockEndpointEnabled: true,
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Find the input field
			const inputField = screen.getByTestId("vpc-endpoint-input")

			// Clear the field
			fireEvent.change(inputField, { target: { value: "" } })

			// Verify the configuration field was updated with empty string
			expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsBedrockEndpoint", "")
		})
	})

	// Test Scenario 2: Edge Case Tests
	describe("Edge Cases", () => {
		it("should preserve endpoint URL when toggling checkbox multiple times", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsBedrockEndpoint: "https://bedrock-vpc.example.com",
				awsBedrockEndpointEnabled: true,
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Initial state: checkbox checked, URL visible
			expect(screen.getByTestId("vpc-endpoint-input")).toBeInTheDocument()
			expect(screen.getByTestId("vpc-endpoint-input")).toHaveValue("https://bedrock-vpc.example.com")

			// Uncheck the checkbox
			fireEvent.click(screen.getByTestId("checkbox-input-settings:providers.awsbedrockvpc.usecustomvpcendpoint"))

			// Verify endpoint enabled was set to false
			expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsBedrockEndpointEnabled", false)

			// Check the checkbox again
			fireEvent.click(screen.getByTestId("checkbox-input-settings:providers.awsbedrockvpc.usecustomvpcendpoint"))

			// Verify endpoint enabled was set to true
			expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsBedrockEndpointEnabled", true)

			// Verify the URL field is visible again
			expect(screen.getByTestId("vpc-endpoint-input")).toBeInTheDocument()
		})

		it("should handle very long endpoint URLs", () => {
			const veryLongUrl =
				"https://bedrock-vpc-endpoint-with-a-very-long-name-that-might-cause-issues-in-some-ui-components.region-1.amazonaws.com/api/v1/endpoint"

			const apiConfiguration: Partial<ProviderSettings> = {
				awsBedrockEndpoint: veryLongUrl,
				awsBedrockEndpointEnabled: true,
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Verify the long URL is displayed correctly
			expect(screen.getByTestId("vpc-endpoint-input")).toHaveValue(veryLongUrl)

			// Change the URL to something else
			fireEvent.change(screen.getByTestId("vpc-endpoint-input"), {
				target: { value: "https://shorter-url.com" },
			})

			// Verify the configuration was updated
			expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsBedrockEndpoint", "https://shorter-url.com")
		})
	})

	// Test Scenario 3: UI Elements Tests
	describe("UI Elements", () => {
		it("should display example URLs when VPC endpoint checkbox is checked", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsBedrockEndpoint: "https://example.com",
				awsBedrockEndpointEnabled: true,
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Check that the VPC endpoint input is visible
			expect(screen.getByTestId("vpc-endpoint-input")).toBeInTheDocument()

			// Check for the example URLs section
			// Since we don't have a specific testid for the examples section,
			// we'll check for the text content
			expect(screen.getByText("settings:providers.awsBedrockVpc.examples")).toBeInTheDocument()
			expect(screen.getByText("• https://vpce-xxx.bedrock.region.vpce.amazonaws.com/")).toBeInTheDocument()
			expect(screen.getByText("• https://gateway.my-company.com/route/app/bedrock")).toBeInTheDocument()
		})

		it("should hide example URLs when VPC endpoint checkbox is unchecked", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsBedrockEndpoint: "https://example.com",
				awsBedrockEndpointEnabled: true,
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Initially the examples should be visible
			expect(screen.getByText("settings:providers.awsBedrockVpc.examples")).toBeInTheDocument()

			// Uncheck the VPC endpoint checkbox
			fireEvent.click(screen.getByTestId("checkbox-input-settings:providers.awsbedrockvpc.usecustomvpcendpoint"))

			// Now the examples should be hidden
			expect(screen.queryByText("settings:providers.awsBedrockVpc.examples")).not.toBeInTheDocument()
			expect(screen.queryByText("• https://vpce-xxx.bedrock.region.vpce.amazonaws.com/")).not.toBeInTheDocument()
			expect(screen.queryByText("• https://gateway.my-company.com/route/app/bedrock")).not.toBeInTheDocument()
		})
	})

	// Test Scenario 4: Error Handling Tests
	describe("Error Handling", () => {
		it("should handle invalid endpoint URLs gracefully", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsBedrockEndpoint: "",
				awsBedrockEndpointEnabled: true,
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Find the input field
			const inputField = screen.getByTestId("vpc-endpoint-input")

			// Enter an invalid URL (missing protocol)
			fireEvent.change(inputField, { target: { value: "invalid-url" } })

			// The component should still update the configuration
			// (URL validation would typically happen at a higher level or when used)
			expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsBedrockEndpoint", "invalid-url")
		})
	})

	// Test Scenario 5: Persistence Tests
	describe("Persistence", () => {
		it("should initialize with the correct state from apiConfiguration", () => {
			// Test with endpoint enabled
			const apiConfigurationEnabled: Partial<ProviderSettings> = {
				awsBedrockEndpoint: "https://custom-endpoint.aws.com",
				awsBedrockEndpointEnabled: true,
				awsUseProfile: true,
			}

			const { unmount } = render(
				<Bedrock
					apiConfiguration={apiConfigurationEnabled as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Verify checkbox is checked and endpoint is visible
			expect(
				screen.getByTestId("checkbox-input-settings:providers.awsbedrockvpc.usecustomvpcendpoint"),
			).toBeChecked()
			expect(screen.getByTestId("vpc-endpoint-input")).toBeInTheDocument()
			expect(screen.getByTestId("vpc-endpoint-input")).toHaveValue("https://custom-endpoint.aws.com")

			unmount()

			// Test with endpoint disabled
			const apiConfigurationDisabled: Partial<ProviderSettings> = {
				awsBedrockEndpoint: "https://custom-endpoint.aws.com",
				awsBedrockEndpointEnabled: false,
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfigurationDisabled as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Verify checkbox is unchecked and endpoint is not visible
			expect(
				screen.getByTestId("checkbox-input-settings:providers.awsbedrockvpc.usecustomvpcendpoint"),
			).not.toBeChecked()
			expect(screen.queryByTestId("vpc-endpoint-input")).not.toBeInTheDocument()
		})

		it("should update state when apiConfiguration changes", () => {
			// Initial render with endpoint disabled
			const apiConfigurationInitial: Partial<ProviderSettings> = {
				awsBedrockEndpoint: "https://initial-endpoint.aws.com",
				awsBedrockEndpointEnabled: false,
				awsUseProfile: true,
			}

			const { rerender } = render(
				<Bedrock
					apiConfiguration={apiConfigurationInitial as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Verify initial state
			expect(
				screen.getByTestId("checkbox-input-settings:providers.awsbedrockvpc.usecustomvpcendpoint"),
			).not.toBeChecked()
			expect(screen.queryByTestId("vpc-endpoint-input")).not.toBeInTheDocument()

			// Update with new configuration
			const apiConfigurationUpdated: Partial<ProviderSettings> = {
				awsBedrockEndpoint: "https://updated-endpoint.aws.com",
				awsBedrockEndpointEnabled: true,
				awsUseProfile: true,
			}

			rerender(
				<Bedrock
					apiConfiguration={apiConfigurationUpdated as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Verify updated state
			expect(
				screen.getByTestId("checkbox-input-settings:providers.awsbedrockvpc.usecustomvpcendpoint"),
			).toBeChecked()
			expect(screen.getByTestId("vpc-endpoint-input")).toBeInTheDocument()
			expect(screen.getByTestId("vpc-endpoint-input")).toHaveValue("https://updated-endpoint.aws.com")
		})
	})

	// Test Scenario 6: Custom Region Tests
	describe("Custom Region", () => {
		it("should show custom region input when 'Custom region...' is selected", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsRegion: "",
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Custom region input should not be visible initially
			expect(screen.queryByTestId("custom-region-input")).not.toBeInTheDocument()

			// Verify the Select component is rendered
			expect(screen.getByTestId("select-component")).toBeInTheDocument()

			// Call the onValueChange callback directly
			if (mockSelectCallbacks.onValueChange) {
				mockSelectCallbacks.onValueChange("custom")
			}

			// Verify that setApiConfigurationField was called with "custom"
			expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsRegion", "custom")
		})

		it("should hide custom region input when switching from custom to standard region", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsRegion: "custom",
				awsCustomRegion: "us-west-3",
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Custom region input should be visible initially
			expect(screen.getByTestId("custom-region-input")).toBeInTheDocument()
			expect(screen.getByTestId("custom-region-input")).toHaveValue("us-west-3")

			// Verify the Select component is rendered
			expect(screen.getByTestId("select-component")).toBeInTheDocument()

			// Call the onValueChange callback directly
			if (mockSelectCallbacks.onValueChange) {
				mockSelectCallbacks.onValueChange("us-east-1")
			}

			// Verify that both awsRegion and awsCustomRegion were updated
			expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsRegion", "us-east-1")
			expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsCustomRegion", "")
		})

		it("should handle custom region input changes", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsRegion: "custom",
				awsCustomRegion: "",
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Find the custom region input field
			const customRegionInput = screen.getByTestId("custom-region-input")
			expect(customRegionInput).toBeInTheDocument()

			// Enter a custom region
			fireEvent.change(customRegionInput, { target: { value: "us-west-3" } })

			// Verify the configuration field was updated
			expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsCustomRegion", "us-west-3")
		})

		it("should display example regions when custom region is selected", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsRegion: "custom",
				awsCustomRegion: "us-west-3",
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Check that the custom region input is visible
			expect(screen.getByTestId("custom-region-input")).toBeInTheDocument()

			// Check for the example regions section
			expect(screen.getByText("settings:providers.awsCustomRegion.examples")).toBeInTheDocument()
			expect(screen.getByText("• us-west-3")).toBeInTheDocument()
			expect(screen.getByText("• eu-central-3")).toBeInTheDocument()
			expect(screen.getByText("• ap-southeast-3")).toBeInTheDocument()
		})

		it("should preserve custom region value when toggling between custom and standard regions", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsRegion: "custom",
				awsCustomRegion: "us-west-3",
				awsUseProfile: true,
			}

			const { rerender } = render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Initial state: custom region selected with value
			expect(screen.getByTestId("custom-region-input")).toBeInTheDocument()
			expect(screen.getByTestId("custom-region-input")).toHaveValue("us-west-3")

			// Switch to standard region
			const updatedConfig: Partial<ProviderSettings> = {
				awsRegion: "us-east-1",
				awsCustomRegion: "", // This would be cleared by the component logic
				awsUseProfile: true,
			}

			rerender(
				<Bedrock
					apiConfiguration={updatedConfig as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Custom region input should be hidden
			expect(screen.queryByTestId("custom-region-input")).not.toBeInTheDocument()

			// Switch back to custom region with preserved value
			const backToCustomConfig: Partial<ProviderSettings> = {
				awsRegion: "custom",
				awsCustomRegion: "us-west-3", // Value preserved in parent state
				awsUseProfile: true,
			}

			rerender(
				<Bedrock
					apiConfiguration={backToCustomConfig as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Custom region input should be visible again with preserved value
			expect(screen.getByTestId("custom-region-input")).toBeInTheDocument()
			expect(screen.getByTestId("custom-region-input")).toHaveValue("us-west-3")
		})

		it("should handle empty custom region input", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsRegion: "custom",
				awsCustomRegion: "us-west-3",
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Find the custom region input field
			const customRegionInput = screen.getByTestId("custom-region-input")

			// Clear the field
			fireEvent.change(customRegionInput, { target: { value: "" } })

			// Verify the configuration field was updated with empty string
			expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsCustomRegion", "")
		})

		it("should initialize with correct state when custom region is pre-selected", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsRegion: "custom",
				awsCustomRegion: "eu-central-3",
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Verify custom region input is visible and has correct value
			expect(screen.getByTestId("custom-region-input")).toBeInTheDocument()
			expect(screen.getByTestId("custom-region-input")).toHaveValue("eu-central-3")

			// Verify examples are shown
			expect(screen.getByText("settings:providers.awsCustomRegion.examples")).toBeInTheDocument()
		})
	})

	// Test Scenario 7: Custom Region Validation Tests
	describe("Custom Region Validation", () => {
		it("should show validation error when custom region is empty", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsRegion: "custom",
				awsCustomRegion: "",
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// The custom region input should be visible
			const customRegionInput = screen.getByTestId("custom-region-input")
			expect(customRegionInput).toBeInTheDocument()

			// Trigger validation by changing input
			fireEvent.change(customRegionInput, { target: { value: "" } })

			// Should show required validation error
			expect(screen.getByText("settings:providers.awsCustomRegion.validation.required")).toBeInTheDocument()
		})

		it("should show validation error for invalid region format", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsRegion: "custom",
				awsCustomRegion: "",
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			const customRegionInput = screen.getByTestId("custom-region-input")

			// Test various invalid formats
			const invalidRegions = [
				"invalid-region",
				"us-west",
				"us-3",
				"uswest3",
				"US-WEST-3",
				"us-west-three",
				"123-west-3",
			]

			for (const invalidRegion of invalidRegions) {
				fireEvent.change(customRegionInput, { target: { value: invalidRegion } })

				// Should show format validation error
				expect(screen.getByText("settings:providers.awsCustomRegion.validation.format")).toBeInTheDocument()
			}
		})

		it("should accept valid region formats", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsRegion: "custom",
				awsCustomRegion: "",
				awsUseProfile: true,
			}

			render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			const customRegionInput = screen.getByTestId("custom-region-input")

			// Test various valid formats
			const validRegions = [
				"us-west-3",
				"eu-central-2",
				"ap-southeast-4",
				"sa-east-2",
				"ca-west-1",
				"me-south-2",
				"af-south-1",
			]

			for (const validRegion of validRegions) {
				fireEvent.change(customRegionInput, { target: { value: validRegion } })

				// Should update the field
				expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsCustomRegion", validRegion)

				// Should not show any error
				expect(
					screen.queryByText("settings:providers.awsCustomRegion.validation.format"),
				).not.toBeInTheDocument()
				expect(
					screen.queryByText("settings:providers.awsCustomRegion.validation.required"),
				).not.toBeInTheDocument()
			}
		})

		it("should preserve custom region value when switching between regions", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsRegion: "custom",
				awsCustomRegion: "us-west-3",
				awsUseProfile: true,
			}

			const { rerender } = render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Custom region input should be visible with the value
			let customRegionInput = screen.getByTestId("custom-region-input") as HTMLInputElement
			expect(customRegionInput.value).toBe("us-west-3")

			// Switch to a standard region by calling the onValueChange directly
			if ((window as any).__selectOnValueChange) {
				;(window as any).__selectOnValueChange("us-east-1")
			}

			// Update the configuration
			apiConfiguration.awsRegion = "us-east-1"
			rerender(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Custom region input should be hidden
			expect(screen.queryByTestId("custom-region-input")).not.toBeInTheDocument()

			// Switch back to custom region
			if ((window as any).__selectOnValueChange) {
				;(window as any).__selectOnValueChange("custom")
			}

			// Update the configuration
			apiConfiguration.awsRegion = "custom"
			rerender(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Custom region input should be visible again with the preserved value
			customRegionInput = screen.getByTestId("custom-region-input") as HTMLInputElement
			expect(customRegionInput.value).toBe("us-west-3")
		})

		it("should validate existing custom region when switching back to custom", () => {
			const apiConfiguration: Partial<ProviderSettings> = {
				awsRegion: "us-east-1",
				awsCustomRegion: "invalid-region", // Invalid format
				awsUseProfile: true,
			}

			const { rerender } = render(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Switch to custom region
			if ((window as any).__selectOnValueChange) {
				;(window as any).__selectOnValueChange("custom")
			}

			// Update the configuration
			apiConfiguration.awsRegion = "custom"
			rerender(
				<Bedrock
					apiConfiguration={apiConfiguration as ProviderSettings}
					setApiConfigurationField={mockSetApiConfigurationField}
				/>,
			)

			// Should show validation error for the existing invalid value
			expect(screen.getByText("settings:providers.awsCustomRegion.validation.format")).toBeInTheDocument()
		})
	})
})
