// npx vitest core/task/__tests__/Task.deduplicateReadFileHistory.spec.ts

import { describe, it, expect, beforeEach, vi } from "vitest"
import { Task } from "../Task"
import { ClineProvider } from "../../webview/ClineProvider"
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
	}
})

describe("Task.deduplicateReadFileHistory", () => {
	let task: Task
	let mockProvider: any
	let mockApiConfig: ProviderSettings

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
	})

	it("should remove older read_file entries for the same file", () => {
		// Setup conversation history with duplicate read_file entries
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
					{ type: "text", text: "new content of app.ts" },
					{ type: "text", text: "metadata" },
				],
				ts: Date.now() - 5 * 60 * 1000, // 5 minutes ago
			},
		] as ApiMessage[]

		task.deduplicateReadFileHistory()

		// Check that older entry had its content removed
		const firstMessage = task.apiConversationHistory[0]
		expect(firstMessage.content).toHaveLength(2) // Content was removed
		expect(firstMessage.content[0]).toEqual({ type: "text", text: "[read_file for src/app.ts]" })
		expect(firstMessage.content[1]).toEqual({ type: "text", text: "metadata" })

		// Check that newer entry is intact
		const thirdMessage = task.apiConversationHistory[2]
		expect(thirdMessage.content).toHaveLength(3) // Content preserved
		expect(thirdMessage.content[1]).toEqual({ type: "text", text: "new content of app.ts" })
	})

	it("should preserve messages within the 30-minute cache window", () => {
		const currentTime = Date.now()

		task.apiConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "old content" },
					{ type: "text", text: "metadata" },
				],
				ts: currentTime - 20 * 60 * 1000, // 20 minutes ago (within cache window)
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "new content" },
					{ type: "text", text: "metadata" },
				],
				ts: currentTime - 5 * 60 * 1000, // 5 minutes ago
			},
		] as ApiMessage[]

		task.deduplicateReadFileHistory()

		// Both messages should be intact due to cache window
		expect(task.apiConversationHistory[0].content).toHaveLength(3)
		expect(task.apiConversationHistory[1].content).toHaveLength(3)
	})

	it("should handle messages without timestamps", () => {
		task.apiConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "content without timestamp" },
					{ type: "text", text: "metadata" },
				],
				// No ts property
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "newer content" },
					{ type: "text", text: "metadata" },
				],
				ts: Date.now(),
			},
		] as ApiMessage[]

		task.deduplicateReadFileHistory()

		// First message should have content removed (no timestamp means it's old)
		expect(task.apiConversationHistory[0].content).toHaveLength(2)
		expect(task.apiConversationHistory[1].content).toHaveLength(3)
	})

	it("should handle different file paths correctly", () => {
		task.apiConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "app.ts content" },
					{ type: "text", text: "metadata" },
				],
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/utils.ts]" },
					{ type: "text", text: "utils.ts content" },
					{ type: "text", text: "metadata" },
				],
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "newer app.ts content" },
					{ type: "text", text: "metadata" },
				],
			},
		] as ApiMessage[]

		task.deduplicateReadFileHistory()

		// First app.ts should have content removed
		expect(task.apiConversationHistory[0].content).toHaveLength(2)

		// utils.ts should be intact (no duplicate)
		expect(task.apiConversationHistory[1].content).toHaveLength(3)

		// Second app.ts should be intact (most recent)
		expect(task.apiConversationHistory[2].content).toHaveLength(3)
	})

	it("should handle malformed messages gracefully", () => {
		task.apiConversationHistory = [
			{
				role: "user",
				content: "string content instead of array",
			},
			{
				role: "user",
				content: [],
			},
			{
				role: "user",
				content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "..." } }],
			},
			{
				role: "user",
				content: [{ type: "text", text: "Not a read_file message" }],
			},
			{
				role: "assistant",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" }, // Assistant message should be skipped
				],
			},
		] as ApiMessage[]

		// Should not throw
		expect(() => task.deduplicateReadFileHistory()).not.toThrow()

		// All messages should remain unchanged
		expect(task.apiConversationHistory[0].content).toBe("string content instead of array")
		expect(task.apiConversationHistory[1].content).toHaveLength(0)
		expect(task.apiConversationHistory[2].content).toHaveLength(1)
		expect(task.apiConversationHistory[3].content).toHaveLength(1)
		expect(task.apiConversationHistory[4].content).toHaveLength(1)
	})

	it("should handle edge cases in content structure", () => {
		task.apiConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					// Missing second item
				],
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/utils.ts]" },
					{ type: "image", source: { type: "base64", media_type: "image/png", data: "..." } }, // Not text
					{ type: "text", text: "metadata" },
				],
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "content" },
					// Only 2 items instead of expected 3
				],
			},
		] as ApiMessage[]

		// Should handle gracefully without throwing
		expect(() => task.deduplicateReadFileHistory()).not.toThrow()
	})

	it("should match various read_file patterns", () => {
		task.apiConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for path/with spaces/file.ts]" },
					{ type: "text", text: "content 1" },
				],
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for path/with-dashes/file.ts]" },
					{ type: "text", text: "content 2" },
				],
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for ../relative/path/file.ts]" },
					{ type: "text", text: "content 3" },
				],
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for path/with spaces/file.ts]" },
					{ type: "text", text: "newer content 1" },
				],
			},
		] as ApiMessage[]

		task.deduplicateReadFileHistory()

		// First occurrence should have content removed
		expect(task.apiConversationHistory[0].content).toHaveLength(1)

		// Others should be intact
		expect(task.apiConversationHistory[1].content).toHaveLength(2)
		expect(task.apiConversationHistory[2].content).toHaveLength(2)
		expect(task.apiConversationHistory[3].content).toHaveLength(2)
	})

	it("should not match invalid read_file patterns", () => {
		task.apiConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "read_file for src/app.ts" }, // Missing brackets
					{ type: "text", text: "content" },
				],
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file src/app.ts]" }, // Missing "for"
					{ type: "text", text: "content" },
				],
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[write_file for src/app.ts]" }, // Different tool
					{ type: "text", text: "content" },
				],
			},
		] as ApiMessage[]

		const originalHistory = JSON.parse(JSON.stringify(task.apiConversationHistory))
		task.deduplicateReadFileHistory()

		// Nothing should change
		expect(task.apiConversationHistory).toEqual(originalHistory)
	})

	it("should handle empty conversation history", () => {
		task.apiConversationHistory = []

		// Should not throw
		expect(() => task.deduplicateReadFileHistory()).not.toThrow()
		expect(task.apiConversationHistory).toHaveLength(0)
	})

	it("should handle multiple duplicates of the same file", () => {
		task.apiConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "version 1" },
				],
				ts: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "version 2" },
				],
				ts: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "version 3" },
				],
				ts: Date.now() - 40 * 60 * 1000, // 40 minutes ago
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "[read_file for src/app.ts]" },
					{ type: "text", text: "version 4 (latest)" },
				],
				ts: Date.now() - 5 * 60 * 1000, // 5 minutes ago
			},
		] as ApiMessage[]

		task.deduplicateReadFileHistory()

		// First two should have content removed (outside cache window)
		expect(task.apiConversationHistory[0].content).toHaveLength(1)
		expect(task.apiConversationHistory[1].content).toHaveLength(1)

		// Third should be intact (outside cache window but would be removed if not for being older than cache)
		expect(task.apiConversationHistory[2].content).toHaveLength(1)

		// Fourth should be intact (most recent)
		expect(task.apiConversationHistory[3].content).toHaveLength(2)
	})
})
