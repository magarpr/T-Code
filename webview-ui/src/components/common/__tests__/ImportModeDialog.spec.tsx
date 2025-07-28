import React from "react"
import { render, screen, fireEvent } from "@/utils/test-utils"
import { describe, test, expect, vi } from "vitest"
import { ImportModeDialog } from "../ImportModeDialog"

// Mock the translation hook
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("ImportModeDialog", () => {
	test("renders nothing when not open", () => {
		const { container } = render(<ImportModeDialog isOpen={false} onClose={vi.fn()} onImport={vi.fn()} />)

		expect(container.firstChild).toBeNull()
	})

	test("renders dialog when open", () => {
		render(<ImportModeDialog isOpen={true} onClose={vi.fn()} onImport={vi.fn()} />)

		expect(screen.getByText("prompts:modes.importMode")).toBeInTheDocument()
		expect(screen.getByText("prompts:importMode.selectLevel")).toBeInTheDocument()
	})

	test("project option is selected by default", () => {
		render(<ImportModeDialog isOpen={true} onClose={vi.fn()} onImport={vi.fn()} />)

		const projectRadio = screen.getByLabelText(/prompts:importMode.project.label/)
		const globalRadio = screen.getByLabelText(/prompts:importMode.global.label/)

		expect(projectRadio).toBeChecked()
		expect(globalRadio).not.toBeChecked()
	})

	test("can switch between project and global options", () => {
		render(<ImportModeDialog isOpen={true} onClose={vi.fn()} onImport={vi.fn()} />)

		const projectRadio = screen.getByLabelText(/prompts:importMode.project.label/)
		const globalRadio = screen.getByLabelText(/prompts:importMode.global.label/)

		// Initially project is selected
		expect(projectRadio).toBeChecked()
		expect(globalRadio).not.toBeChecked()

		// Click global
		fireEvent.click(globalRadio)

		// Now global should be selected
		expect(projectRadio).not.toBeChecked()
		expect(globalRadio).toBeChecked()
	})

	test("cancel button calls onClose", () => {
		const onClose = vi.fn()
		render(<ImportModeDialog isOpen={true} onClose={onClose} onImport={vi.fn()} />)

		const cancelButton = screen.getByText("prompts:createModeDialog.buttons.cancel")
		fireEvent.click(cancelButton)

		expect(onClose).toHaveBeenCalledTimes(1)
	})

	test("import button calls onImport with selected source", () => {
		const onImport = vi.fn()
		render(<ImportModeDialog isOpen={true} onClose={vi.fn()} onImport={onImport} />)

		// Select global
		const globalRadio = screen.getByLabelText(/prompts:importMode.global.label/)
		fireEvent.click(globalRadio)

		// Click import
		const importButton = screen.getByText("prompts:importMode.import")
		fireEvent.click(importButton)

		expect(onImport).toHaveBeenCalledWith("global")
	})

	test("import button calls onImport with project by default", () => {
		const onImport = vi.fn()
		render(<ImportModeDialog isOpen={true} onClose={vi.fn()} onImport={onImport} />)

		// Click import without changing selection
		const importButton = screen.getByText("prompts:importMode.import")
		fireEvent.click(importButton)

		expect(onImport).toHaveBeenCalledWith("project")
	})

	test("import button is disabled when isImporting is true", () => {
		render(<ImportModeDialog isOpen={true} onClose={vi.fn()} onImport={vi.fn()} isImporting={true} />)

		const importButton = screen.getByText("prompts:importMode.importing")
		expect(importButton).toBeDisabled()
	})

	test("shows importing text when isImporting is true", () => {
		render(<ImportModeDialog isOpen={true} onClose={vi.fn()} onImport={vi.fn()} isImporting={true} />)

		expect(screen.getByText("prompts:importMode.importing")).toBeInTheDocument()
		expect(screen.queryByText("prompts:importMode.import")).not.toBeInTheDocument()
	})

	test("displays project and global descriptions", () => {
		render(<ImportModeDialog isOpen={true} onClose={vi.fn()} onImport={vi.fn()} />)

		expect(screen.getByText("prompts:importMode.project.description")).toBeInTheDocument()
		expect(screen.getByText("prompts:importMode.global.description")).toBeInTheDocument()
	})
})
