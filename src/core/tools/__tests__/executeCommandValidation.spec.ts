// npx vitest run src/core/tools/__tests__/executeCommandValidation.spec.ts

import { describe, it, expect, beforeEach, vi } from "vitest"
import { executeCommandTool } from "../executeCommandTool"
import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"
import type { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../../shared/tools"

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn().mockReturnValue(0), // Default timeout value
		}),
	},
}))

// Mock the executeCommand function
vi.mock("../executeCommandTool", async () => {
	const actual = await vi.importActual("../executeCommandTool")
	return {
		...actual,
		executeCommand: vi.fn().mockResolvedValue([false, "Command executed successfully"]),
	}
})

// Mock formatResponse
vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		toolError: vi.fn((msg: string) => msg),
		rooIgnoreError: vi.fn((msg: string) => msg),
		toolResult: vi.fn((msg: string) => msg),
	},
}))

describe("executeCommandTool - Command Validation", () => {
	let mockCline: any
	let mockAskApproval: AskApproval
	let mockHandleError: HandleError
	let mockPushToolResult: PushToolResult
	let mockRemoveClosingTag: RemoveClosingTag
	let block: ToolUse
	let mockProvider: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Create a mock provider with getState method
		mockProvider = {
			getState: vi.fn().mockResolvedValue({
				allowedCommands: [],
				deniedCommands: [],
				alwaysAllowExecute: false,
			}),
			postMessageToWebview: vi.fn(),
		}

		// Create mock cline with provider
		mockCline = {
			consecutiveMistakeCount: 0,
			didRejectTool: false,
			recordToolError: vi.fn(),
			say: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			ask: vi.fn(),
			rooIgnoreController: {
				validateCommand: vi.fn().mockReturnValue(null),
			},
			providerRef: {
				deref: vi.fn().mockResolvedValue(mockProvider),
			},
			cwd: "/test/workspace",
			lastMessageTs: Date.now(),
			terminalProcess: undefined,
		}

		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((tag, text) => text || "")

		block = {
			type: "tool_use",
			name: "execute_command",
			params: {
				command: "echo test",
			},
			partial: false,
		}
	})

	describe("Allowed Commands Validation", () => {
		it("should allow command when it matches allowed command exactly", async () => {
			// Setup allowed commands
			mockProvider.getState.mockResolvedValue({
				allowedCommands: ["echo", "ls", "pwd"],
				deniedCommands: [],
				alwaysAllowExecute: false,
			})

			block.params.command = "echo hello world"

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.say).not.toHaveBeenCalledWith("error", expect.any(String))
			expect(mockAskApproval).toHaveBeenCalledWith("command", "echo hello world")
		})

		it("should allow command when it starts with allowed command prefix", async () => {
			mockProvider.getState.mockResolvedValue({
				allowedCommands: ["npm install", "npm test"],
				deniedCommands: [],
				alwaysAllowExecute: false,
			})

			block.params.command = "npm install express"

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.say).not.toHaveBeenCalledWith("error", expect.any(String))
			expect(mockAskApproval).toHaveBeenCalledWith("command", "npm install express")
		})

		it("should reject command not in allowed list", async () => {
			mockProvider.getState.mockResolvedValue({
				allowedCommands: ["echo", "ls"],
				deniedCommands: [],
				alwaysAllowExecute: false,
			})

			block.params.command = "rm -rf /"

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.say).toHaveBeenCalledWith(
				"error",
				"Command 'rm' is not in the allowed commands list. Add it to the allowed commands in settings to execute it.",
			)
			expect(mockPushToolResult).toHaveBeenCalledWith("Command 'rm' is not allowed by user configuration")
			expect(mockAskApproval).not.toHaveBeenCalled()
		})

		it("should allow any command when allowed list is empty", async () => {
			mockProvider.getState.mockResolvedValue({
				allowedCommands: [],
				deniedCommands: [],
				alwaysAllowExecute: false,
			})

			block.params.command = "any-command --with-args"

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.say).not.toHaveBeenCalledWith("error", expect.any(String))
			expect(mockAskApproval).toHaveBeenCalledWith("command", "any-command --with-args")
		})
	})

	describe("Denied Commands Validation", () => {
		it("should reject command in denied list", async () => {
			mockProvider.getState.mockResolvedValue({
				allowedCommands: [],
				deniedCommands: ["rm", "sudo", "chmod"],
				alwaysAllowExecute: false,
			})

			block.params.command = "rm -rf /tmp/test"

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.say).toHaveBeenCalledWith(
				"error",
				"Command 'rm' is in the denied commands list and cannot be executed.",
			)
			expect(mockPushToolResult).toHaveBeenCalledWith("Command 'rm' is denied by user configuration")
			expect(mockAskApproval).not.toHaveBeenCalled()
		})

		it("should reject command that starts with denied prefix", async () => {
			mockProvider.getState.mockResolvedValue({
				allowedCommands: [],
				deniedCommands: ["sudo apt-get"],
				alwaysAllowExecute: false,
			})

			block.params.command = "sudo apt-get update"

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.say).toHaveBeenCalledWith(
				"error",
				"Command 'sudo' is in the denied commands list and cannot be executed.",
			)
			expect(mockPushToolResult).toHaveBeenCalledWith("Command 'sudo' is denied by user configuration")
			expect(mockAskApproval).not.toHaveBeenCalled()
		})

		it("should prioritize denied list over allowed list", async () => {
			mockProvider.getState.mockResolvedValue({
				allowedCommands: ["git"],
				deniedCommands: ["git push --force"],
				alwaysAllowExecute: false,
			})

			block.params.command = "git push --force origin main"

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.say).toHaveBeenCalledWith(
				"error",
				"Command 'git' is in the denied commands list and cannot be executed.",
			)
			expect(mockPushToolResult).toHaveBeenCalledWith("Command 'git' is denied by user configuration")
			expect(mockAskApproval).not.toHaveBeenCalled()
		})
	})

	describe("Always Allow Execute", () => {
		it("should skip validation when alwaysAllowExecute is true", async () => {
			mockProvider.getState.mockResolvedValue({
				allowedCommands: ["echo"],
				deniedCommands: ["rm"],
				alwaysAllowExecute: true,
			})

			block.params.command = "rm -rf /tmp/test"

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.say).not.toHaveBeenCalledWith("error", expect.any(String))
			expect(mockAskApproval).toHaveBeenCalledWith("command", "rm -rf /tmp/test")
		})
	})

	describe("Edge Cases", () => {
		it("should handle commands with leading/trailing whitespace", async () => {
			mockProvider.getState.mockResolvedValue({
				allowedCommands: ["  echo  ", "ls"],
				deniedCommands: [],
				alwaysAllowExecute: false,
			})

			block.params.command = "  echo test  "

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.say).not.toHaveBeenCalledWith("error", expect.any(String))
			expect(mockAskApproval).toHaveBeenCalled()
		})

		it("should handle empty command strings in lists", async () => {
			mockProvider.getState.mockResolvedValue({
				allowedCommands: ["echo", "", "  ", "ls"],
				deniedCommands: ["", "  "],
				alwaysAllowExecute: false,
			})

			block.params.command = "echo test"

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.say).not.toHaveBeenCalledWith("error", expect.any(String))
			expect(mockAskApproval).toHaveBeenCalledWith("command", "echo test")
		})

		it("should handle when provider is not available", async () => {
			mockCline.providerRef.deref.mockResolvedValue(null)

			block.params.command = "echo test"

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Should proceed without validation when provider is not available
			expect(mockCline.say).not.toHaveBeenCalledWith("error", expect.any(String))
			expect(mockAskApproval).toHaveBeenCalledWith("command", "echo test")
		})
	})

	describe("Complex Command Scenarios", () => {
		it("should validate piped commands by first command", async () => {
			mockProvider.getState.mockResolvedValue({
				allowedCommands: ["ls", "grep"],
				deniedCommands: [],
				alwaysAllowExecute: false,
			})

			block.params.command = "ls -la | grep test"

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.say).not.toHaveBeenCalledWith("error", expect.any(String))
			expect(mockAskApproval).toHaveBeenCalledWith("command", "ls -la | grep test")
		})

		it("should validate chained commands by first command", async () => {
			mockProvider.getState.mockResolvedValue({
				allowedCommands: ["cd"],
				deniedCommands: [],
				alwaysAllowExecute: false,
			})

			block.params.command = "cd /tmp && ls -la"

			await executeCommandTool(
				mockCline as unknown as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.say).not.toHaveBeenCalledWith("error", expect.any(String))
			expect(mockAskApproval).toHaveBeenCalledWith("command", "cd /tmp && ls -la")
		})
	})
})
