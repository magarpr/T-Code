/* eslint-disable @typescript-eslint/no-explicit-any */

// npx vitest run src/__tests__/TelemetryQueueManager.test.ts

import { TelemetryQueueManager } from "../TelemetryQueueManager"
import { TelemetryEventName } from "@roo-code/types"
import type { QueuedTelemetryEvent, TelemetryEvent } from "@roo-code/types"

// Mock ContextProxy
vi.mock("../../../../src/core/config/ContextProxy", () => ({
	ContextProxy: {
		instance: {
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

describe("TelemetryQueueManager", () => {
	let manager: TelemetryQueueManager
	let mockContextProxy: any

	beforeEach(async () => {
		vi.clearAllMocks()

		// Reset singleton instance
		;(TelemetryQueueManager as any).instance = null

		// Get mock ContextProxy
		const { ContextProxy } = await import("../../../../src/core/config/ContextProxy")
		mockContextProxy = ContextProxy.instance

		// Set up default mock values
		mockContextProxy.getGlobalState.mockReturnValue([])
		mockContextProxy.updateGlobalState.mockResolvedValue(undefined)

		manager = TelemetryQueueManager.getInstance()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("getInstance", () => {
		it("should return the same instance (singleton)", () => {
			const instance1 = TelemetryQueueManager.getInstance()
			const instance2 = TelemetryQueueManager.getInstance()
			expect(instance1).toBe(instance2)
		})
	})

	describe("addToQueue", () => {
		it("should add event to queue with normal priority by default", async () => {
			const event: TelemetryEvent = {
				event: TelemetryEventName.TASK_CREATED,
				properties: { taskId: "test-task" },
			}

			await manager.addToQueue(event)

			// Check that updateGlobalState was called with the queue
			expect(mockContextProxy.updateGlobalState).toHaveBeenCalledWith(
				"telemetryQueue",
				expect.arrayContaining([
					expect.objectContaining({
						event,
						retryCount: 0,
						priority: "normal",
					}),
				]),
			)
		})

		it("should add event with high priority when specified", async () => {
			const event: TelemetryEvent = {
				event: TelemetryEventName.SCHEMA_VALIDATION_ERROR,
				properties: { error: "test error" },
			}

			await manager.addToQueue(event, "high")

			expect(mockContextProxy.updateGlobalState).toHaveBeenCalledWith(
				"telemetryQueue",
				expect.arrayContaining([
					expect.objectContaining({
						event,
						priority: "high",
					}),
				]),
			)
		})

		it("should sort queue by priority and timestamp", async () => {
			// Add normal priority event first
			await manager.addToQueue({
				event: TelemetryEventName.TASK_CREATED,
				properties: { id: 1 },
			})

			// Add high priority event
			await manager.addToQueue(
				{
					event: TelemetryEventName.SCHEMA_VALIDATION_ERROR,
					properties: { id: 2 },
				},
				"high",
			)

			// The high priority event should be first in the queue
			const lastCall =
				mockContextProxy.updateGlobalState.mock.calls[mockContextProxy.updateGlobalState.mock.calls.length - 1]
			expect(lastCall[0]).toBe("telemetryQueue")
			expect(lastCall[1][0].priority).toBe("high")
			expect(lastCall[1][1].priority).toBe("normal")
		})

		it("should enforce queue size limit", async () => {
			// Mock a full queue
			const fullQueue = Array(1000)
				.fill(null)
				.map((_, i) => ({
					id: `id-${i}`,
					timestamp: Date.now() - i * 1000,
					event: { event: TelemetryEventName.TASK_CREATED, properties: {} },
					retryCount: 0,
					priority: "normal" as const,
				}))

			mockContextProxy.getGlobalState.mockReturnValue(fullQueue)

			await manager.addToQueue({
				event: TelemetryEventName.TASK_CREATED,
				properties: { new: true },
			})

			// Should maintain max size
			const lastCall =
				mockContextProxy.updateGlobalState.mock.calls[mockContextProxy.updateGlobalState.mock.calls.length - 1]
			expect(lastCall[1]).toHaveLength(1000)
		})
	})

	describe("processQueue", () => {
		it("should not process without a callback set", async () => {
			const mockQueue: QueuedTelemetryEvent[] = [
				{
					id: "test-1",
					timestamp: Date.now(),
					event: { event: TelemetryEventName.TASK_CREATED, properties: {} },
					retryCount: 0,
					priority: "normal",
				},
			]

			mockContextProxy.getGlobalState.mockReturnValue(mockQueue)

			await manager.processQueue()

			// Should not update the queue
			expect(mockContextProxy.updateGlobalState).not.toHaveBeenCalledWith("telemetryQueue", expect.anything())
		})

		it("should process events with callback", async () => {
			const mockQueue: QueuedTelemetryEvent[] = [
				{
					id: "test-1",
					timestamp: Date.now(),
					event: { event: TelemetryEventName.TASK_CREATED, properties: { id: 1 } },
					retryCount: 0,
					priority: "normal",
				},
				{
					id: "test-2",
					timestamp: Date.now(),
					event: { event: TelemetryEventName.TASK_CREATED, properties: { id: 2 } },
					retryCount: 0,
					priority: "normal",
				},
			]

			mockContextProxy.getGlobalState.mockReturnValue(mockQueue)

			const processCallback = vi.fn().mockResolvedValue(undefined)
			manager.setProcessCallback(processCallback)

			await manager.processQueue()

			// Should call callback with events
			expect(processCallback).toHaveBeenCalledWith(mockQueue)

			// Should clear the queue after successful processing
			expect(mockContextProxy.updateGlobalState).toHaveBeenCalledWith("telemetryQueue", [])
		})

		it("should handle processing failures and update retry count", async () => {
			const mockQueue: QueuedTelemetryEvent[] = [
				{
					id: "test-1",
					timestamp: Date.now(),
					event: { event: TelemetryEventName.TASK_CREATED, properties: {} },
					retryCount: 0,
					priority: "normal",
				},
			]

			mockContextProxy.getGlobalState.mockReturnValue(mockQueue)

			const processCallback = vi.fn().mockRejectedValue(new Error("Process error"))
			manager.setProcessCallback(processCallback)

			await expect(manager.processQueue()).rejects.toThrow("Process error")

			// Should update retry count
			const updateCalls = mockContextProxy.updateGlobalState.mock.calls.filter(
				(call: any[]) => call[0] === "telemetryQueue",
			)
			const lastQueueUpdate = updateCalls[updateCalls.length - 1]
			expect(lastQueueUpdate[1][0].retryCount).toBe(1)
			expect(lastQueueUpdate[1][0].lastRetryTimestamp).toBeDefined()
		})

		it("should skip events that exceeded max retries", async () => {
			const mockQueue: QueuedTelemetryEvent[] = [
				{
					id: "test-1",
					timestamp: Date.now(),
					event: { event: TelemetryEventName.TASK_CREATED, properties: {} },
					retryCount: 5, // Max retries
					priority: "normal",
				},
				{
					id: "test-2",
					timestamp: Date.now(),
					event: { event: TelemetryEventName.TASK_CREATED, properties: {} },
					retryCount: 0,
					priority: "normal",
				},
			]

			mockContextProxy.getGlobalState.mockReturnValue(mockQueue)

			const processCallback = vi.fn().mockResolvedValue(undefined)
			manager.setProcessCallback(processCallback)

			await manager.processQueue()

			// Should only process the second event
			expect(processCallback).toHaveBeenCalledWith([mockQueue[1]])
		})

		it("should respect backoff delay for retried events", async () => {
			const now = Date.now()
			const mockQueue: QueuedTelemetryEvent[] = [
				{
					id: "test-1",
					timestamp: now - 10000,
					event: { event: TelemetryEventName.TASK_CREATED, properties: {} },
					retryCount: 1,
					lastRetryTimestamp: now - 500, // Only 500ms ago, should wait longer
					priority: "normal",
				},
			]

			mockContextProxy.getGlobalState.mockReturnValue(mockQueue)

			const processCallback = vi.fn()
			manager.setProcessCallback(processCallback)

			await manager.processQueue()

			// Should not process the event yet
			expect(processCallback).not.toHaveBeenCalled()
		})

		it("should process events in batches", async () => {
			// Create more events than batch size (50)
			const mockQueue: QueuedTelemetryEvent[] = Array(60)
				.fill(null)
				.map((_, i) => ({
					id: `test-${i}`,
					timestamp: Date.now(),
					event: { event: TelemetryEventName.TASK_CREATED, properties: { id: i } },
					retryCount: 0,
					priority: "normal" as const,
				}))

			mockContextProxy.getGlobalState.mockReturnValue(mockQueue)

			const processCallback = vi.fn().mockResolvedValue(undefined)
			manager.setProcessCallback(processCallback)

			await manager.processQueue()

			// Should only process batch size (50) events
			expect(processCallback).toHaveBeenCalledWith(expect.arrayContaining(mockQueue.slice(0, 50)))
			expect(processCallback.mock.calls[0][0]).toHaveLength(50)
		})
	})

	describe("clearQueue", () => {
		it("should clear queue and update metadata", async () => {
			await manager.clearQueue()

			expect(mockContextProxy.updateGlobalState).toHaveBeenCalledWith("telemetryQueue", [])
			expect(mockContextProxy.updateGlobalState).toHaveBeenCalledWith(
				"telemetryQueueMetadata",
				expect.objectContaining({
					events: [],
					lastProcessedTimestamp: expect.any(Number),
				}),
			)
		})
	})

	describe("getQueueSize", () => {
		it("should return current queue size", () => {
			const size = manager.getQueueSize()
			expect(size).toBe(0)
		})
	})

	describe("isErrorEvent", () => {
		it("should identify error events correctly", () => {
			expect(manager.isErrorEvent(TelemetryEventName.SCHEMA_VALIDATION_ERROR)).toBe(true)
			expect(manager.isErrorEvent(TelemetryEventName.DIFF_APPLICATION_ERROR)).toBe(true)
			expect(manager.isErrorEvent(TelemetryEventName.SHELL_INTEGRATION_ERROR)).toBe(true)
			expect(manager.isErrorEvent(TelemetryEventName.CONSECUTIVE_MISTAKE_ERROR)).toBe(true)
			expect(manager.isErrorEvent(TelemetryEventName.CODE_INDEX_ERROR)).toBe(true)
			expect(manager.isErrorEvent(TelemetryEventName.TASK_CREATED)).toBe(false)
		})
	})

	describe("getQueueStats", () => {
		it("should return queue statistics", async () => {
			const now = Date.now()
			const mockQueue: QueuedTelemetryEvent[] = [
				{
					id: "test-1",
					timestamp: now - 5000,
					event: { event: TelemetryEventName.SCHEMA_VALIDATION_ERROR, properties: {} },
					retryCount: 0,
					priority: "high",
				},
				{
					id: "test-2",
					timestamp: now - 3000,
					event: { event: TelemetryEventName.TASK_CREATED, properties: {} },
					retryCount: 1,
					priority: "normal",
				},
				{
					id: "test-3",
					timestamp: now - 1000,
					event: { event: TelemetryEventName.TASK_CREATED, properties: {} },
					retryCount: 0,
					priority: "normal",
				},
			]

			mockContextProxy.getGlobalState.mockReturnValue(mockQueue)

			const stats = await manager.getQueueStats()

			expect(stats).toEqual({
				totalEvents: 3,
				highPriorityEvents: 1,
				normalPriorityEvents: 2,
				retriedEvents: 1,
				oldestEventAge: expect.any(Number),
			})
			expect(stats.oldestEventAge).toBeGreaterThanOrEqual(5000)
		})

		it("should handle empty queue", async () => {
			mockContextProxy.getGlobalState.mockReturnValue([])

			const stats = await manager.getQueueStats()

			expect(stats).toEqual({
				totalEvents: 0,
				highPriorityEvents: 0,
				normalPriorityEvents: 0,
				retriedEvents: 0,
				oldestEventAge: null,
			})
		})
	})

	describe("expired events cleanup", () => {
		it("should remove events older than 7 days during processing", async () => {
			const now = Date.now()
			const mockQueue: QueuedTelemetryEvent[] = [
				{
					id: "old-event",
					timestamp: now - 8 * 24 * 60 * 60 * 1000, // 8 days old
					event: { event: TelemetryEventName.TASK_CREATED, properties: {} },
					retryCount: 0,
					priority: "normal",
				},
				{
					id: "recent-event",
					timestamp: now - 1 * 24 * 60 * 60 * 1000, // 1 day old
					event: { event: TelemetryEventName.TASK_CREATED, properties: {} },
					retryCount: 0,
					priority: "normal",
				},
			]

			mockContextProxy.getGlobalState.mockReturnValue(mockQueue)

			const processCallback = vi.fn().mockResolvedValue(undefined)
			manager.setProcessCallback(processCallback)

			await manager.processQueue()

			// Should only process the recent event
			expect(processCallback).toHaveBeenCalledWith([mockQueue[1]])

			// Should update queue to remove old event
			const queueUpdateCalls = mockContextProxy.updateGlobalState.mock.calls.filter(
				(call: any[]) => call[0] === "telemetryQueue",
			)
			// Find the call that removes the old event
			const cleanupCall = queueUpdateCalls.find((call: any[]) => !call[1].some((e: any) => e.id === "old-event"))
			expect(cleanupCall).toBeDefined()
		})
	})
})
