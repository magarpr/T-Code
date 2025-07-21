// npx vitest src/components/settings/__tests__/FileEditingOptions.spec.tsx

import { render, screen, fireEvent } from "@/utils/test-utils"
import { FileEditingOptions } from "../FileEditingOptions"

// Mock VSCode components
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeCheckbox: ({ children, checked, onChange, "data-testid": dataTestId }: any) => (
		<label>
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange && onChange({ target: { checked: e.target.checked } })}
				data-testid={dataTestId}
			/>
			{children}
		</label>
	),
}))

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
	FileEdit: () => <span data-testid="file-edit-icon">FileEdit Icon</span>,
}))

// Mock the vscode module
const mockPostMessage = vi.fn()
vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: () => mockPostMessage(),
	},
}))

describe("FileEditingOptions", () => {
	let mockSetCachedStateField: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.clearAllMocks()
		mockSetCachedStateField = vi.fn()
	})

	const renderFileEditingOptions = (props = {}) => {
		const defaultProps = {
			autoCloseRooTabs: false,
			autoCloseAllRooTabs: false,
			setCachedStateField: mockSetCachedStateField,
			...props,
		}

		render(<FileEditingOptions {...defaultProps} />)
	}

	it("renders the component with correct title and icon", () => {
		renderFileEditingOptions()

		expect(screen.getByText("settings:fileEditing.title")).toBeInTheDocument()
		expect(screen.getByText("settings:fileEditing.description")).toBeInTheDocument()
		expect(screen.getByTestId("file-edit-icon")).toBeInTheDocument()
	})

	it("displays both checkboxes with correct labels", () => {
		renderFileEditingOptions()

		expect(screen.getByText("settings:fileEditing.autoCloseRooTabs.label")).toBeInTheDocument()
		expect(screen.getByText("settings:fileEditing.autoCloseRooTabs.description")).toBeInTheDocument()
		expect(screen.getByText("settings:fileEditing.autoCloseAllRooTabs.label")).toBeInTheDocument()
		expect(screen.getByText("settings:fileEditing.autoCloseAllRooTabs.description")).toBeInTheDocument()
	})

	it("does not display the info message when both options are false", () => {
		renderFileEditingOptions({
			autoCloseRooTabs: false,
			autoCloseAllRooTabs: false,
		})

		expect(screen.queryByText("settings:fileEditing.tabClosingInfo")).not.toBeInTheDocument()
	})

	it("displays the info message when autoCloseRooTabs is true", () => {
		renderFileEditingOptions({
			autoCloseRooTabs: true,
			autoCloseAllRooTabs: false,
		})

		expect(screen.getByText("settings:fileEditing.tabClosingInfo")).toBeInTheDocument()
	})

	it("displays the info message when autoCloseAllRooTabs is true", () => {
		renderFileEditingOptions({
			autoCloseRooTabs: false,
			autoCloseAllRooTabs: true,
		})

		expect(screen.getByText("settings:fileEditing.tabClosingInfo")).toBeInTheDocument()
	})

	it("reflects the correct initial state from props", () => {
		renderFileEditingOptions({
			autoCloseRooTabs: true,
			autoCloseAllRooTabs: false,
		})

		const autoCloseCheckbox = screen.getByTestId("auto-close-roo-tabs-checkbox")
		const autoCloseAllCheckbox = screen.getByTestId("auto-close-all-roo-tabs-checkbox")

		expect(autoCloseCheckbox).toBeChecked()
		expect(autoCloseAllCheckbox).not.toBeChecked()
	})

	it("calls setCachedStateField when autoCloseRooTabs checkbox is toggled", () => {
		renderFileEditingOptions({
			autoCloseRooTabs: false,
			autoCloseAllRooTabs: false,
		})

		const autoCloseCheckbox = screen.getByTestId("auto-close-roo-tabs-checkbox")

		fireEvent.click(autoCloseCheckbox)

		expect(mockSetCachedStateField).toHaveBeenCalledWith("autoCloseRooTabs", true)
	})

	it("calls setCachedStateField when autoCloseAllRooTabs checkbox is toggled", () => {
		renderFileEditingOptions({
			autoCloseRooTabs: false,
			autoCloseAllRooTabs: false,
		})

		const autoCloseAllCheckbox = screen.getByTestId("auto-close-all-roo-tabs-checkbox")

		fireEvent.click(autoCloseAllCheckbox)

		expect(mockSetCachedStateField).toHaveBeenCalledWith("autoCloseAllRooTabs", true)
	})

	it("handles multiple toggles correctly", () => {
		renderFileEditingOptions({
			autoCloseRooTabs: false,
			autoCloseAllRooTabs: false,
		})

		const autoCloseCheckbox = screen.getByTestId("auto-close-roo-tabs-checkbox")
		const autoCloseAllCheckbox = screen.getByTestId("auto-close-all-roo-tabs-checkbox")

		// Toggle autoCloseRooTabs on
		fireEvent.click(autoCloseCheckbox)
		expect(mockSetCachedStateField).toHaveBeenCalledWith("autoCloseRooTabs", true)

		// Toggle autoCloseAllRooTabs on
		fireEvent.click(autoCloseAllCheckbox)
		expect(mockSetCachedStateField).toHaveBeenCalledWith("autoCloseAllRooTabs", true)

		// Toggle autoCloseRooTabs off (simulating it was already checked)
		// Note: Since we're not re-rendering with updated props, we need to manually set the checked state
		// In a real scenario, the parent component would re-render with updated props
		expect(mockSetCachedStateField).toHaveBeenCalledTimes(2)
	})

	it("renders with proper styling classes", () => {
		renderFileEditingOptions()

		// Check for the space-y-4 class on the container
		const checkboxContainer = screen.getByTestId("auto-close-roo-tabs-checkbox").closest(".space-y-4")
		expect(checkboxContainer).toBeInTheDocument()

		// Check for description styling
		const descriptions = screen.getAllByText(/settings:fileEditing.*description/)
		descriptions.forEach((desc) => {
			expect(desc).toHaveClass("text-vscode-descriptionForeground", "text-sm")
		})
	})

	it("passes additional HTML attributes to the root element", () => {
		const { container } = render(
			<FileEditingOptions
				autoCloseRooTabs={false}
				autoCloseAllRooTabs={false}
				setCachedStateField={vi.fn()}
				className="custom-class"
				data-custom="test"
			/>,
		)

		// The root element is the first div
		const rootElement = container.firstChild as HTMLElement
		expect(rootElement).toHaveClass("custom-class")
		expect(rootElement).toHaveAttribute("data-custom", "test")
	})
})
