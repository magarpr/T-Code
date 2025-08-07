import { describe, it, expect, vi, beforeEach } from "vitest"
import { getNewTaskDescription } from "../new-task"
import { ToolArgs } from "../types"

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(),
		})),
	},
}))

import * as vscode from "vscode"

describe("getNewTaskDescription", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should show todos as optional when VSCode setting is disabled", () => {
		const mockConfig = {
			get: vi.fn().mockReturnValue(false),
		}
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any)

		const args: ToolArgs = {
			cwd: "/test",
			supportsComputerUse: false,
			experiments: {},
		}

		const description = getNewTaskDescription(args)

		// Check that todos is marked as optional
		expect(description).toContain("todos: (optional)")
		expect(description).toContain("optional initial todo list")

		// Should not contain any mention of required
		expect(description).not.toContain("todos: (required)")

		// Verify VSCode configuration was checked
		expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith("roo-cline")
		expect(mockConfig.get).toHaveBeenCalledWith("newTaskRequireTodos", false)
	})

	it("should show todos as required when VSCode setting is enabled", () => {
		const mockConfig = {
			get: vi.fn().mockReturnValue(true),
		}
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any)

		const args: ToolArgs = {
			cwd: "/test",
			supportsComputerUse: false,
			experiments: {},
		}

		const description = getNewTaskDescription(args)

		// Check that todos is marked as required
		expect(description).toContain("todos: (required)")
		expect(description).toContain("and initial todo list")

		// Should not contain any mention of optional for todos
		expect(description).not.toContain("todos: (optional)")
		expect(description).not.toContain("optional initial todo list")

		// Verify VSCode configuration was checked
		expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith("roo-cline")
		expect(mockConfig.get).toHaveBeenCalledWith("newTaskRequireTodos", false)
	})

	it("should default to optional when VSCode setting returns undefined", () => {
		const mockConfig = {
			get: vi.fn().mockReturnValue(undefined),
		}
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any)

		const args: ToolArgs = {
			cwd: "/test",
			supportsComputerUse: false,
			experiments: {},
		}

		const description = getNewTaskDescription(args)

		// Check that todos is marked as optional by default
		expect(description).toContain("todos: (optional)")
		expect(description).toContain("optional initial todo list")
	})

	it("should always include the example with todos", () => {
		// Test with setting off
		const mockConfigOff = {
			get: vi.fn().mockReturnValue(false),
		}
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfigOff as any)

		const args: ToolArgs = {
			cwd: "/test",
			supportsComputerUse: false,
			experiments: {},
		}

		const descriptionOff = getNewTaskDescription(args)

		// Test with setting on
		const mockConfigOn = {
			get: vi.fn().mockReturnValue(true),
		}
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfigOn as any)

		const descriptionOn = getNewTaskDescription(args)

		// Both should include the example with todos
		const examplePattern = /<todos>\s*\[\s*\]\s*Set up auth middleware/s
		expect(descriptionOff).toMatch(examplePattern)
		expect(descriptionOn).toMatch(examplePattern)
	})
})
