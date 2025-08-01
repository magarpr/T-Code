import type { TelemetryEvent, QueuedTelemetryEvent, TelemetryQueueState } from "@roo-code/types"
import { TelemetryEventName } from "@roo-code/types"
import { ContextProxy } from "../../../src/core/config/ContextProxy"

export class TelemetryQueueManager {
	private static instance: TelemetryQueueManager
	private queue: QueuedTelemetryEvent[] = []
	private isProcessing = false
	private maxQueueSize = 1000
	private maxRetries = 5
	private baseRetryDelay = 1000 // 1 second
	private maxEventAge = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
	private batchSize = 50
	private processCallback?: (events: QueuedTelemetryEvent[]) => Promise<void>
	private log: (...args: unknown[]) => void

	private constructor() {
		this.log = console.log // Default logger
	}

	public static getInstance(): TelemetryQueueManager {
		if (!TelemetryQueueManager.instance) {
			TelemetryQueueManager.instance = new TelemetryQueueManager()
		}
		return TelemetryQueueManager.instance
	}

	/**
	 * Set the callback function to process events
	 */
	public setProcessCallback(callback: (events: QueuedTelemetryEvent[]) => Promise<void>): void {
		this.processCallback = callback
	}

	/**
	 * Add an event to the queue
	 */
	public async addToQueue(event: TelemetryEvent, priority: "high" | "normal" = "normal"): Promise<void> {
		const queuedEvent: QueuedTelemetryEvent = {
			id: crypto.randomUUID(),
			event,
			timestamp: Date.now(),
			retryCount: 0,
			priority,
		}

		// Load queue from storage
		await this.loadQueueFromStorage()

		// Add new event
		this.queue.push(queuedEvent)

		// Sort by priority (high priority first) and then by timestamp
		this.queue.sort((a, b) => {
			if (a.priority !== b.priority) {
				return a.priority === "high" ? -1 : 1
			}
			return a.timestamp - b.timestamp
		})

		// Enforce queue size limit (FIFO after priority sorting)
		if (this.queue.length > this.maxQueueSize) {
			// Remove oldest normal priority events first
			const normalPriorityEvents = this.queue.filter((e) => e.priority === "normal")
			const highPriorityEvents = this.queue.filter((e) => e.priority === "high")

			if (normalPriorityEvents.length > 0) {
				const eventsToRemove = this.queue.length - this.maxQueueSize
				this.queue = [...highPriorityEvents, ...normalPriorityEvents.slice(eventsToRemove)]
			} else {
				// If all events are high priority, remove oldest ones
				this.queue = this.queue.slice(this.queue.length - this.maxQueueSize)
			}
		}

		// Save updated queue
		await this.saveQueueToStorage()
	}

	/**
	 * Process queued events
	 */
	public async processQueue(): Promise<void> {
		if (this.isProcessing || !this.processCallback) {
			return
		}

		this.isProcessing = true

		try {
			// Load queue from storage
			await this.loadQueueFromStorage()

			// Clean up expired events
			await this.clearExpiredEvents()

			// Get events ready for processing
			const now = Date.now()
			const eventsToProcess = this.queue
				.filter((event) => {
					if (event.retryCount >= this.maxRetries) {
						return false
					}

					if (event.lastRetryTimestamp) {
						const backoffDelay = this.calculateBackoffDelay(event.retryCount)
						return now - event.lastRetryTimestamp >= backoffDelay
					}

					return true
				})
				.slice(0, this.batchSize)

			if (eventsToProcess.length === 0) {
				return
			}

			// Process batch
			await this.processBatch(eventsToProcess)

			// Update metadata
			await this.updateMetadata()
		} finally {
			this.isProcessing = false
		}
	}

	/**
	 * Process a batch of events
	 */
	private async processBatch(events: QueuedTelemetryEvent[]): Promise<void> {
		if (!this.processCallback) {
			return
		}

		try {
			// Call the process callback
			await this.processCallback(events)

			// Remove successfully processed events from queue
			const processedIds = new Set(events.map((e) => e.id))
			this.queue = this.queue.filter((e) => !processedIds.has(e.id))

			// Save updated queue
			await this.saveQueueToStorage()
		} catch (error) {
			// Update retry information for failed events
			const now = Date.now()
			events.forEach((event) => {
				const queuedEvent = this.queue.find((e) => e.id === event.id)
				if (queuedEvent) {
					queuedEvent.retryCount++
					queuedEvent.lastRetryTimestamp = now
				}
			})

			// Save updated queue with retry information
			await this.saveQueueToStorage()

			throw error
		}
	}

	/**
	 * Calculate exponential backoff delay
	 */
	private calculateBackoffDelay(retryCount: number): number {
		return this.baseRetryDelay * Math.pow(2, retryCount)
	}

	/**
	 * Set the logger function
	 */
	public setLogger(logger: (...args: unknown[]) => void): void {
		this.log = logger
	}

	/**
	 * Load queue from storage
	 */
	private async loadQueueFromStorage(): Promise<void> {
		try {
			const contextProxy = ContextProxy.instance
			const storedQueue = contextProxy.getGlobalState("telemetryQueue")

			if (storedQueue && Array.isArray(storedQueue)) {
				// Add validation for queue size to prevent memory issues
				if (storedQueue.length > this.maxQueueSize * 2) {
					this.log("[TelemetryQueueManager] Queue size exceeds safety limit, truncating to max size")
					this.queue = (storedQueue as QueuedTelemetryEvent[]).slice(-this.maxQueueSize)
				} else {
					this.queue = storedQueue as QueuedTelemetryEvent[]
				}
			}
		} catch (error) {
			this.log("[TelemetryQueueManager] Error loading queue from storage:", error)
			this.queue = []
		}
	}

	/**
	 * Save queue to storage
	 */
	private async saveQueueToStorage(): Promise<void> {
		try {
			const contextProxy = ContextProxy.instance
			await contextProxy.updateGlobalState("telemetryQueue", this.queue)
		} catch (error) {
			this.log("[TelemetryQueueManager] Error saving queue to storage:", error)
		}
	}

	/**
	 * Clear events older than maxEventAge
	 */
	private async clearExpiredEvents(): Promise<void> {
		const now = Date.now()
		const originalLength = this.queue.length

		this.queue = this.queue.filter((event) => {
			return now - event.timestamp < this.maxEventAge
		})

		if (this.queue.length < originalLength) {
			await this.saveQueueToStorage()
		}
	}

	/**
	 * Update queue metadata
	 */
	private async updateMetadata(): Promise<void> {
		try {
			const contextProxy = ContextProxy.instance
			const metadata: TelemetryQueueState = {
				events: this.queue,
				lastProcessedTimestamp: Date.now(),
			}
			await contextProxy.updateGlobalState("telemetryQueueMetadata", metadata)
		} catch (error) {
			this.log("[TelemetryQueueManager] Error updating metadata:", error)
		}
	}

	/**
	 * Get queue size
	 */
	public getQueueSize(): number {
		return this.queue.length
	}

	/**
	 * Clear the entire queue
	 */
	public async clearQueue(): Promise<void> {
		this.queue = []
		await this.saveQueueToStorage()
		await this.updateMetadata()
	}

	/**
	 * Check if an event is an error event
	 */
	public isErrorEvent(eventName: TelemetryEventName): boolean {
		return [
			TelemetryEventName.SCHEMA_VALIDATION_ERROR,
			TelemetryEventName.DIFF_APPLICATION_ERROR,
			TelemetryEventName.SHELL_INTEGRATION_ERROR,
			TelemetryEventName.CONSECUTIVE_MISTAKE_ERROR,
			TelemetryEventName.CODE_INDEX_ERROR,
		].includes(eventName)
	}

	/**
	 * Get queue statistics
	 */
	public async getQueueStats(): Promise<{
		totalEvents: number
		highPriorityEvents: number
		normalPriorityEvents: number
		retriedEvents: number
		oldestEventAge: number | null
	}> {
		await this.loadQueueFromStorage()

		const now = Date.now()
		const highPriorityEvents = this.queue.filter((e) => e.priority === "high").length
		const normalPriorityEvents = this.queue.filter((e) => e.priority === "normal").length
		const retriedEvents = this.queue.filter((e) => e.retryCount > 0).length
		const oldestEvent = this.queue.length > 0 ? Math.min(...this.queue.map((e) => e.timestamp)) : null
		const oldestEventAge = oldestEvent ? now - oldestEvent : null

		return {
			totalEvents: this.queue.length,
			highPriorityEvents,
			normalPriorityEvents,
			retriedEvents,
			oldestEventAge,
		}
	}
}
