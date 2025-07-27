// npx vitest core/tools/__tests__/newTaskTool.spec.ts

import type { AskApproval, HandleError } from "../../../shared/tools"

// Mock other modules first - these are hoisted to the top
vi.mock("../../../shared/modes", () => ({
	getModeBySlug: vi.fn(),
	defaultModeSlug: "ask",
}))

vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		toolError: vi.fn((msg: string) => `Tool Error: ${msg}`),
	},
}))

// Define a minimal type for the resolved value
type MockClineInstance = { taskId: string }

// Mock dependencies after modules are mocked
const mockAskApproval = vi.fn<AskApproval>()
const mockHandleError = vi.fn<HandleError>()
const mockPushToolResult = vi.fn()
const mockRemoveClosingTag = vi.fn((_name: string, value: string | undefined) => value ?? "")
const mockInitClineWithTask = vi.fn<() => Promise<MockClineInstance>>().mockResolvedValue({ taskId: "mock-subtask-id" })
const mockEmit = vi.fn()
const mockRecordToolError = vi.fn()
const mockSayAndCreateMissingParamError = vi.fn()

// Mock the Cline instance and its methods/properties
const mockCline = {
	ask: vi.fn(),
	sayAndCreateMissingParamError: mockSayAndCreateMissingParamError,
	emit: mockEmit,
	recordToolError: mockRecordToolError,
	consecutiveMistakeCount: 0,
	isPaused: false,
	pausedModeSlug: "ask",
	providerRef: {
		deref: vi.fn(() => ({
			getState: vi.fn(() => ({ customModes: [], mode: "ask" })),
			handleModeSwitch: vi.fn(),
			initClineWithTask: mockInitClineWithTask,
		})),
	},
}

// Import the function to test AFTER mocks are set up
import { newTaskTool } from "../newTaskTool"
import type { ToolUse } from "../../../shared/tools"
import { getModeBySlug } from "../../../shared/modes"

describe("newTaskTool", () => {
	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks()
		mockAskApproval.mockResolvedValue(true) // Default to approved
		vi.mocked(getModeBySlug).mockReturnValue({
			slug: "code",
			name: "Code Mode",
			roleDefinition: "Test role definition",
			groups: ["command", "read", "edit"],
		}) // Default valid mode
		mockCline.consecutiveMistakeCount = 0
		mockCline.isPaused = false
	})

	it("should correctly un-escape \\\\@ to \\@ in the message passed to the new task", async () => {
		const block: ToolUse = {
			type: "tool_use", // Add required 'type' property
			name: "new_task", // Correct property name
			params: {
				mode: "code",
				message: "Review this: \\\\@file1.txt and also \\\\\\\\@file2.txt", // Input with \\@ and \\\\@
			},
			partial: false,
		}

		await newTaskTool(
			mockCline as any, // Use 'as any' for simplicity in mocking complex type
			block,
			mockAskApproval, // Now correctly typed
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		// Verify askApproval was called
		expect(mockAskApproval).toHaveBeenCalled()

		// Verify the message passed to initClineWithTask reflects the code's behavior in unit tests
		expect(mockInitClineWithTask).toHaveBeenCalledWith(
			"Review this: \\@file1.txt and also \\\\\\@file2.txt", // Unit Test Expectation: \\@ -> \@, \\\\@ -> \\\\@
			undefined,
			mockCline,
			{ todos: undefined },
		)

		// Verify side effects
		expect(mockCline.emit).toHaveBeenCalledWith("taskSpawned", expect.any(String)) // Assuming initCline returns a mock task ID
		expect(mockCline.isPaused).toBe(true)
		expect(mockCline.emit).toHaveBeenCalledWith("taskPaused")
		expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("Successfully created new task"))
	})

	it("should not un-escape single escaped \@", async () => {
		const block: ToolUse = {
			type: "tool_use", // Add required 'type' property
			name: "new_task", // Correct property name
			params: {
				mode: "code",
				message: "This is already unescaped: \\@file1.txt",
			},
			partial: false,
		}

		await newTaskTool(
			mockCline as any,
			block,
			mockAskApproval, // Now correctly typed
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockInitClineWithTask).toHaveBeenCalledWith(
			"This is already unescaped: \\@file1.txt", // Expected: \@ remains \@
			undefined,
			mockCline,
			{ todos: undefined },
		)
	})

	it("should not un-escape non-escaped @", async () => {
		const block: ToolUse = {
			type: "tool_use", // Add required 'type' property
			name: "new_task", // Correct property name
			params: {
				mode: "code",
				message: "A normal mention @file1.txt",
			},
			partial: false,
		}

		await newTaskTool(
			mockCline as any,
			block,
			mockAskApproval, // Now correctly typed
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockInitClineWithTask).toHaveBeenCalledWith(
			"A normal mention @file1.txt", // Expected: @ remains @
			undefined,
			mockCline,
			{ todos: undefined },
		)
	})

	it("should handle mixed escaping scenarios", async () => {
		const block: ToolUse = {
			type: "tool_use", // Add required 'type' property
			name: "new_task", // Correct property name
			params: {
				mode: "code",
				message: "Mix: @file0.txt, \\@file1.txt, \\\\@file2.txt, \\\\\\\\@file3.txt",
			},
			partial: false,
		}

		await newTaskTool(
			mockCline as any,
			block,
			mockAskApproval, // Now correctly typed
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockInitClineWithTask).toHaveBeenCalledWith(
			"Mix: @file0.txt, \\@file1.txt, \\@file2.txt, \\\\\\@file3.txt", // Unit Test Expectation: @->@, \@->\@, \\@->\@, \\\\@->\\\\@
			undefined,
			mockCline,
			{ todos: undefined },
		)
	})

	it("should pass todos parameter to initClineWithTask when provided", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "new_task",
			params: {
				mode: "code",
				message: "Implement a new feature",
				todos: "[x] Design the architecture\n[-] Write the code\n[ ] Add tests\n[ ] Update documentation",
			},
			partial: false,
		}

		await newTaskTool(
			mockCline as any,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockInitClineWithTask).toHaveBeenCalledWith("Implement a new feature", undefined, mockCline, {
			todos: "[x] Design the architecture\n[-] Write the code\n[ ] Add tests\n[ ] Update documentation",
		})
	})

	it("should handle todos parameter with various markdown checklist formats", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "new_task",
			params: {
				mode: "code",
				message: "Complex task",
				todos: "[X] Completed uppercase\n[~] Alternative in-progress\n[ ] Pending with extra spaces\n[x]No space after bracket",
			},
			partial: false,
		}

		await newTaskTool(
			mockCline as any,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockInitClineWithTask).toHaveBeenCalledWith("Complex task", undefined, mockCline, {
			todos: "[X] Completed uppercase\n[~] Alternative in-progress\n[ ] Pending with extra spaces\n[x]No space after bracket",
		})
	})

	it("should work without todos parameter (backward compatibility)", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "new_task",
			params: {
				mode: "code",
				message: "Task without todos",
			},
			partial: false,
		}

		await newTaskTool(
			mockCline as any,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		// Should be called without the todos in options
		expect(mockInitClineWithTask).toHaveBeenCalledWith("Task without todos", undefined, mockCline, {})
	})

	it("should handle empty todos parameter", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "new_task",
			params: {
				mode: "code",
				message: "Task with empty todos",
				todos: "",
			},
			partial: false,
		}

		await newTaskTool(
			mockCline as any,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		// Empty string should still be passed
		expect(mockInitClineWithTask).toHaveBeenCalledWith("Task with empty todos", undefined, mockCline, { todos: "" })
	})

	it("should handle todos with special characters and escaping", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "new_task",
			params: {
				mode: "code",
				message: "Task with special todos",
				todos: "[x] Handle \\@mentions in todos\n[ ] Support | pipes and \\\\ backslashes\n[-] Test \"quotes\" and 'apostrophes'",
			},
			partial: false,
		}

		await newTaskTool(
			mockCline as any,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockInitClineWithTask).toHaveBeenCalledWith("Task with special todos", undefined, mockCline, {
			todos: "[x] Handle \\@mentions in todos\n[ ] Support | pipes and \\\\ backslashes\n[-] Test \"quotes\" and 'apostrophes'",
		})
	})

	// Add more tests for error handling (missing params, invalid mode, approval denied) if needed
})
