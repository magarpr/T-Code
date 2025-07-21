// npx vitest src/core/tools/__tests__/readFileTool.deduplication.spec.ts

import { describe, it, expect, beforeEach, vi } from "vitest"
import { readFileTool } from "../readFileTool"
import { Task } from "../../task/Task"
import type { ProviderSettings } from "@roo-code/types"
import type { ApiMessage } from "../../task-persistence/apiMessages"
import { TelemetryService } from "@roo-code/telemetry"

// Mock dependencies
vi.mock("delay", () => ({
	__esModule: true,
	default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../environment/getEnvironmentDetails", () => ({
	getEnvironmentDetails: vi.fn().mockResolvedValue(""),
}))

vi.mock("../../ignore/RooIgnoreController")

vi.mock("fs/promises", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, any>
	return {
		...actual,
		mkdir: vi.fn().mockResolvedValue(undefined),
		writeFile: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn().mockResolvedValue("[]"),
		access: vi.fn().mockResolvedValue(undefined),
	}
})

vi.mock("fs", () => ({
	existsSync: vi.fn().mockReturnValue(true),
	readFileSync: vi.fn().mockReturnValue("test file content"),
}))

vi.mock("isbinaryfile", () => ({
	isBinaryFile: vi.fn().mockResolvedValue(false),
}))

vi.mock("../../../integrations/misc/line-counter", () => ({
	countFileLines: vi.fn().mockResolvedValue(10),
}))

vi.mock("../../../integrations/misc/extract-text", () => ({
	extractTextFromFile: vi.fn().mockResolvedValue("1 | test content\n2 | more content"),
	addLineNumbers: vi.fn((content) => content),
	getSupportedBinaryFormats: vi.fn().mockReturnValue([".pdf", ".docx"]),
}))

describe("readFileTool deduplication", () => {
	let task: Task
	let mockProvider: any
	let mockApiConfig: ProviderSettings
	let mockBlock: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any

	beforeEach(() => {
		// Initialize TelemetryService if not already initialized
		if (!TelemetryService.hasInstance()) {
			TelemetryService.createInstance([])
		}

		// Setup mock provider
		mockProvider = {
			context: {
				globalStorageUri: { fsPath: "/test/storage" },
			},
			postStateToWebview: vi.fn().mockResolvedValue(undefined),
			postMessageToWebview: vi.fn().mockResolvedValue(undefined),
			updateTaskHistory: vi.fn().mockResolvedValue(undefined),
			getState: vi.fn().mockResolvedValue({}),
		}

		// Setup mock API configuration
		mockApiConfig = {
			apiProvider: "anthropic",
			apiModelId: "claude-3-5-sonnet-20241022",
			apiKey: "test-api-key",
		}

		// Create task instance
		task = new Task({
			provider: mockProvider,
			apiConfiguration: mockApiConfig,
			task: "test task",
			startTask: false,
		})

		// Add spy on deduplicateReadFileHistory
		vi.spyOn(task, "deduplicateReadFileHistory")

		// Setup existing conversation history with duplicate read_file entries
		task.apiConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "old content of app.ts" },
					{ type: "text", text: "metadata" },
				],
				ts: Date.now() - 60 * 60 * 1000, // 1 hour ago
			},
			{
				role: "assistant",
				content: [{ type: "text", text: "I see the file content." }],
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "existing content of app.ts" },
					{ type: "text", text: "metadata" },
				],
				ts: Date.now() - 5 * 60 * 1000, // 5 minutes ago
			},
		] as ApiMessage[]

		// Mock tool use block
		mockBlock = {
			partial: false,
			params: {
				args: `<file><path>src/app.ts</path></file>`,
			},
		}

		// Mock callbacks
		mockAskApproval = vi.fn().mockResolvedValue({
			response: "yesButtonClicked",
			text: undefined,
			images: undefined,
		})
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn()

		// Mock task methods
		task.ask = mockAskApproval
		task.say = vi.fn().mockResolvedValue(undefined)
		task.recordToolError = vi.fn()
		task.sayAndCreateMissingParamError = vi.fn()
		task.fileContextTracker = {
			trackFileContext: vi.fn().mockResolvedValue(undefined),
		} as any
		task.rooIgnoreController = {
			validateAccess: vi.fn().mockReturnValue(true),
		} as any
	})

	it("should call deduplicateReadFileHistory after successful read_file operation", async () => {
		await readFileTool(task, mockBlock, mockAskApproval, mockHandleError, mockPushToolResult, mockRemoveClosingTag)

		// Verify deduplication was called
		expect(task.deduplicateReadFileHistory).toHaveBeenCalledTimes(1)

		// Verify the file was read successfully
		expect(mockPushToolResult).toHaveBeenCalled()
		const result = mockPushToolResult.mock.calls[0][0]
		expect(result).toContain("<files>")
		expect(result).toContain("<file><path>src/app.ts</path>")
		expect(result).toContain("</files>")
	})

	it("should deduplicate history correctly after read_file", async () => {
		await readFileTool(task, mockBlock, mockAskApproval, mockHandleError, mockPushToolResult, mockRemoveClosingTag)

		// Check that older entry had its content removed
		const firstMessage = task.apiConversationHistory[0]
		expect(firstMessage.content).toHaveLength(2) // Content was removed
		expect(firstMessage.content[0]).toEqual({ type: "text", text: "[read_file for src/app.ts]" })
		expect(firstMessage.content[1]).toEqual({ type: "text", text: "metadata" })

		// Check that existing entry is still intact
		const thirdMessage = task.apiConversationHistory[2]
		expect(thirdMessage.content).toHaveLength(3) // Content preserved
		expect(thirdMessage.content[1]).toEqual({ type: "text", text: "existing content of app.ts" })
	})

	it("should not call deduplicateReadFileHistory when read_file is denied", async () => {
		// Mock denial response
		mockAskApproval.mockResolvedValue({
			response: "noButtonClicked",
			text: "User denied",
			images: undefined,
		})

		await readFileTool(task, mockBlock, mockAskApproval, mockHandleError, mockPushToolResult, mockRemoveClosingTag)

		// Verify deduplication was NOT called
		expect(task.deduplicateReadFileHistory).not.toHaveBeenCalled()

		// Verify the result shows denial
		expect(mockPushToolResult).toHaveBeenCalled()
		const result = mockPushToolResult.mock.calls[0][0]
		expect(result).toContain("Denied by user")
	})

	it("should not call deduplicateReadFileHistory when read_file has an error", async () => {
		// Mock RooIgnore validation failure
		task.rooIgnoreController!.validateAccess = vi.fn().mockReturnValue(false)

		await readFileTool(task, mockBlock, mockAskApproval, mockHandleError, mockPushToolResult, mockRemoveClosingTag)

		// Verify deduplication was NOT called
		expect(task.deduplicateReadFileHistory).not.toHaveBeenCalled()
	})

	it("should call deduplicateReadFileHistory for multiple approved files", async () => {
		// Mock block with multiple files
		mockBlock.params.args = `
			<file><path>src/app.ts</path></file>
			<file><path>src/utils.ts</path></file>
		`

		// Mock batch approval
		mockAskApproval.mockResolvedValue({
			response: "yesButtonClicked",
			text: undefined,
			images: undefined,
		})

		await readFileTool(task, mockBlock, mockAskApproval, mockHandleError, mockPushToolResult, mockRemoveClosingTag)

		// Verify deduplication was called once after all files were processed
		expect(task.deduplicateReadFileHistory).toHaveBeenCalledTimes(1)

		// Verify both files were read
		const result = mockPushToolResult.mock.calls[0][0]
		expect(result).toContain("<file><path>src/app.ts</path>")
		expect(result).toContain("<file><path>src/utils.ts</path>")
	})

	it("should call deduplicateReadFileHistory when some files are approved in batch", async () => {
		// Mock block with multiple files
		mockBlock.params.args = `
			<file><path>src/app.ts</path></file>
			<file><path>src/utils.ts</path></file>
		`

		// Mock the batch approval to simulate the webview's response
		// We need to intercept the ask call to get the actual keys used
		let actualKeys: string[] = []
		mockAskApproval.mockImplementation(async (type: string, message: string) => {
			if (type === "tool") {
				const parsed = JSON.parse(message)
				if (parsed.batchFiles) {
					actualKeys = parsed.batchFiles.map((f: any) => f.key)
				}
			}
			// Return individual permissions with correct keys
			return {
				response: "objectResponse",
				text: JSON.stringify({
					[actualKeys[0]]: true, // Approve first file
					[actualKeys[1]]: false, // Deny second file
				}),
				images: undefined,
			}
		})

		await readFileTool(task, mockBlock, mockAskApproval, mockHandleError, mockPushToolResult, mockRemoveClosingTag)

		// Verify deduplication was called since at least one file was approved
		expect(task.deduplicateReadFileHistory).toHaveBeenCalledTimes(1)
	})

	it("should not call deduplicateReadFileHistory when all files are denied in batch", async () => {
		// Mock block with multiple files
		mockBlock.params.args = `
			<file><path>src/app.ts</path></file>
			<file><path>src/utils.ts</path></file>
		`

		// Mock batch denial
		mockAskApproval.mockResolvedValue({
			response: "noButtonClicked",
			text: "All files denied",
			images: undefined,
		})

		await readFileTool(task, mockBlock, mockAskApproval, mockHandleError, mockPushToolResult, mockRemoveClosingTag)

		// Verify deduplication was NOT called
		expect(task.deduplicateReadFileHistory).not.toHaveBeenCalled()
	})
})
