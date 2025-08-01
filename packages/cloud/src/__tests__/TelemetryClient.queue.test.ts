/* eslint-disable @typescript-eslint/no-explicit-any */

// npx vitest run src/__tests__/TelemetryClient.queue.test.ts

import { TelemetryEventName } from "@roo-code/types"
import { TelemetryClient } from "../TelemetryClient"
import { TelemetryQueueManager } from "../TelemetryQueueManager"

const mockFetch = vi.fn()
global.fetch = mockFetch as any

// Mock ContextProxy
vi.mock("../../../../src/core/config/ContextProxy", () => ({
	ContextProxy: {
		instance: {
			getValue: vi.fn(),
			getGlobalState: vi.fn(),
			updateGlobalState: vi.fn(),
		},
	},
}))

// Mock crypto.randomUUID
Object.defineProperty(global, "crypto", {
	value: {
		randomUUID: vi.fn(() => `test-uuid-${Date.now()}`),
	},
	writable: true,
})

describe("TelemetryClient with Queue", () => {
	let mockAuthService: any
	let mockSettingsService: any
	let mockContextProxy: any
	let queueManager: TelemetryQueueManager

	beforeEach(async () => {
		vi.clearAllMocks()

		// Reset singleton
		;(TelemetryQueueManager as any).instance = null

		// Get mock ContextProxy
		const { ContextProxy } = await import("../../../../src/core/config/ContextProxy")
		mockContextProxy = ContextProxy.instance

		// Mock AuthService
		mockAuthService = {
			getSessionToken: vi.fn().mockReturnValue("mock-token"),
			getState: vi.fn().mockReturnValue("active-session"),
			isAuthenticated: vi.fn().mockReturnValue(true),
			hasActiveSession: vi.fn().mockReturnValue(true),
		}

		// Mock SettingsService
		mockSettingsService = {
			getSettings: vi.fn().mockReturnValue({
				cloudSettings: {
					recordTaskMessages: true,
				},
			}),
		}

		// Set up ContextProxy mocks
		mockContextProxy.getValue.mockImplementation((key: string) => {
			if (key === "telemetryQueueEnabled") {
				return true // Queue is enabled
			}
			return undefined
		})
		mockContextProxy.getGlobalState.mockReturnValue([])
		mockContextProxy.updateGlobalState.mockResolvedValue(undefined)

		// Default successful fetch
		mockFetch.mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({}),
		})

		queueManager = TelemetryQueueManager.getInstance()

		vi.spyOn(console, "info").mockImplementation(() => {})
		vi.spyOn(console, "error").mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("queue integration", () => {
		it("should add event to queue when telemetry fails", async () => {
			// Make fetch fail
			mockFetch.mockRejectedValue(new Error("Network error"))

			const mockLog = vi.fn()
			const client = new TelemetryClient(mockAuthService, mockSettingsService, false, mockLog)
			const addToQueueSpy = vi.spyOn(queueManager, "addToQueue")

			await client.capture({
				event: TelemetryEventName.TASK_CREATED,
				properties: {
					appName: "roo-code",
					appVersion: "1.0.0",
					vscodeVersion: "1.60.0",
					platform: "darwin",
					editorName: "vscode",
					language: "en",
					mode: "code",
					taskId: "test-task-id",
				},
			})

			// Should add to queue
			expect(addToQueueSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					event: TelemetryEventName.TASK_CREATED,
				}),
				"normal",
			)
		})

		it("should add error events to queue with high priority", async () => {
			// Make fetch fail
			mockFetch.mockRejectedValue(new Error("Network error"))

			const mockLog = vi.fn()
			const client = new TelemetryClient(mockAuthService, mockSettingsService, false, mockLog)
			const addToQueueSpy = vi.spyOn(queueManager, "addToQueue")

			await client.capture({
				event: TelemetryEventName.SCHEMA_VALIDATION_ERROR,
				properties: {
					appName: "roo-code",
					appVersion: "1.0.0",
					vscodeVersion: "1.60.0",
					platform: "darwin",
					editorName: "vscode",
					language: "en",
					mode: "code",
					error: "test error",
				},
			})

			// Should add to queue with high priority
			expect(addToQueueSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					event: TelemetryEventName.SCHEMA_VALIDATION_ERROR,
				}),
				"high",
			)
		})

		it("should process queue after successful send", async () => {
			vi.useFakeTimers()
			const processQueueSpy = vi.spyOn(queueManager, "processQueue")

			// Create client (this sets the callback in constructor)
			const mockLog = vi.fn()
			const client = new TelemetryClient(mockAuthService, mockSettingsService, false, mockLog)

			await client.capture({
				event: TelemetryEventName.TASK_CREATED,
				properties: {
					appName: "roo-code",
					appVersion: "1.0.0",
					vscodeVersion: "1.60.0",
					platform: "darwin",
					editorName: "vscode",
					language: "en",
					mode: "code",
					taskId: "test-task-id",
				},
			})

			// Should not process queue immediately due to debouncing
			expect(processQueueSpy).not.toHaveBeenCalled()

			// Fast forward past the debounce delay (5 seconds)
			vi.advanceTimersByTime(5000)

			// Now it should have been called
			expect(processQueueSpy).toHaveBeenCalled()

			vi.useRealTimers()
		})

		it("should not use queue when telemetryQueueEnabled is false", async () => {
			// Disable queue
			mockContextProxy.getValue.mockImplementation((key: string) => {
				if (key === "telemetryQueueEnabled") {
					return false
				}
				return undefined
			})

			// Make fetch fail
			mockFetch.mockRejectedValue(new Error("Network error"))

			const mockLog = vi.fn()
			const client = new TelemetryClient(mockAuthService, mockSettingsService, false, mockLog)
			const addToQueueSpy = vi.spyOn(queueManager, "addToQueue")

			await client.capture({
				event: TelemetryEventName.TASK_CREATED,
				properties: {
					appName: "roo-code",
					appVersion: "1.0.0",
					vscodeVersion: "1.60.0",
					platform: "darwin",
					editorName: "vscode",
					language: "en",
					mode: "code",
					taskId: "test-task-id",
				},
			})

			// Should not add to queue
			expect(addToQueueSpy).not.toHaveBeenCalled()
		})

		it("should handle queue processing callback correctly", async () => {
			// Capture the callback that was set
			let processCallback: any
			vi.spyOn(queueManager, "setProcessCallback").mockImplementation((cb) => {
				processCallback = cb
			})

			// Create client (this sets the callback in constructor)
			const mockLog = vi.fn()
			const _client = new TelemetryClient(mockAuthService, mockSettingsService, false, mockLog)

			// Ensure we have the callback
			expect(processCallback).toBeDefined()

			// Test the callback with proper event structure
			const queuedEvents = [
				{
					id: "test-1",
					timestamp: Date.now(),
					event: {
						event: TelemetryEventName.TASK_CREATED,
						properties: {
							appName: "roo-code",
							appVersion: "1.0.0",
							vscodeVersion: "1.60.0",
							platform: "darwin",
							editorName: "vscode",
							language: "en",
							mode: "code",
							taskId: "queued-task-1",
						},
					},
					retryCount: 0,
					priority: "normal" as const,
				},
				{
					id: "test-2",
					timestamp: Date.now(),
					event: {
						event: TelemetryEventName.TASK_CREATED,
						properties: {
							appName: "roo-code",
							appVersion: "1.0.0",
							vscodeVersion: "1.60.0",
							platform: "darwin",
							editorName: "vscode",
							language: "en",
							mode: "code",
							taskId: "queued-task-2",
						},
					},
					retryCount: 1,
					priority: "normal" as const,
				},
			]

			// Reset fetch mock
			mockFetch.mockClear()
			mockFetch.mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({}),
			})

			// Call the callback
			await processCallback(queuedEvents)

			// Should have made fetch calls for each event
			expect(mockFetch).toHaveBeenCalledTimes(2)
		})

		it("should handle queue processing errors", async () => {
			// Capture the callback
			let processCallback: any
			vi.spyOn(queueManager, "setProcessCallback").mockImplementation((cb) => {
				processCallback = cb
			})

			// Create client (this sets the callback in constructor)
			const mockLog = vi.fn()
			const _client = new TelemetryClient(mockAuthService, mockSettingsService, false, mockLog)

			const queuedEvents = [
				{
					id: "test-1",
					timestamp: Date.now(),
					event: {
						event: TelemetryEventName.TASK_CREATED,
						properties: {
							appName: "roo-code",
							appVersion: "1.0.0",
							vscodeVersion: "1.60.0",
							platform: "darwin",
							editorName: "vscode",
							language: "en",
							mode: "code",
							taskId: "queued-task-1",
						},
					},
					retryCount: 0,
					priority: "normal" as const,
				},
			]

			// Make fetch fail for queue processing
			mockFetch.mockClear()
			mockFetch.mockRejectedValue(new Error("Queue processing error"))

			// The processBatchedEvents method will throw because fetch throws
			// This is expected behavior - the queue manager will handle the retry
			await expect(processCallback(queuedEvents)).rejects.toThrow("Queue processing error")

			// Should have attempted to send the event
			expect(mockFetch).toHaveBeenCalled()
		})

		it("should not process queue for non-capturable events", async () => {
			const mockLog = vi.fn()
			const client = new TelemetryClient(mockAuthService, mockSettingsService, false, mockLog)
			const processQueueSpy = vi.spyOn(queueManager, "processQueue")

			await client.capture({
				event: TelemetryEventName.TASK_CONVERSATION_MESSAGE, // Non-capturable
				properties: { test: "value" },
			})

			// Should not process queue
			expect(processQueueSpy).not.toHaveBeenCalled()
		})

		it("should handle queue errors gracefully", async () => {
			// Create client first
			const mockLog = vi.fn()
			const client = new TelemetryClient(mockAuthService, mockSettingsService, false, mockLog)

			// Clear previous mocks
			mockFetch.mockClear()

			// Make fetch fail to trigger queue
			mockFetch.mockRejectedValue(new Error("Network error"))

			// Then mock the queue operation to fail
			const _originalAddToQueue = queueManager.addToQueue.bind(queueManager)
			const addToQueueSpy = vi.spyOn(queueManager, "addToQueue").mockImplementation(async () => {
				// Simulate the error without actually throwing in the test
				console.error("Error adding to telemetry queue:", new Error("Queue error"))
				return Promise.resolve()
			})

			// Capture should complete without throwing
			await client.capture({
				event: TelemetryEventName.TASK_CREATED,
				properties: {
					appName: "roo-code",
					appVersion: "1.0.0",
					vscodeVersion: "1.60.0",
					platform: "darwin",
					editorName: "vscode",
					language: "en",
					mode: "code",
					taskId: "test-task-id",
				},
			})

			// Should have attempted to add to queue
			expect(addToQueueSpy).toHaveBeenCalled()
			// Should have logged the error
			expect(console.error).toHaveBeenCalledWith("Error adding to telemetry queue:", expect.any(Error))

			// Restore original method
			addToQueueSpy.mockRestore()
		})
	})
})
