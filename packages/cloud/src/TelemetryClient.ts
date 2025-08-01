import {
	TelemetryEventName,
	type TelemetryEvent,
	type QueuedTelemetryEvent,
	rooCodeTelemetryEventSchema,
	type ClineMessage,
} from "@roo-code/types"
import { BaseTelemetryClient } from "@roo-code/telemetry"

import { getRooCodeApiUrl } from "./Config"
import type { AuthService } from "./auth"
import type { SettingsService } from "./SettingsService"
import { TelemetryQueueManager } from "./TelemetryQueueManager"
import { ContextProxy } from "../../../src/core/config/ContextProxy"

export class TelemetryClient extends BaseTelemetryClient {
	private queueManager: TelemetryQueueManager
	private isQueueEnabled: boolean = false
	private log: (...args: unknown[]) => void
	private processQueueDebounceTimer: NodeJS.Timeout | null = null
	private processQueueAbortController: AbortController | null = null
	private readonly processQueueDebounceDelay = 5000 // 5 seconds

	constructor(
		private authService: AuthService,
		private settingsService: SettingsService,
		debug = false,
		log?: (...args: unknown[]) => void,
	) {
		super(
			{
				type: "exclude",
				events: [TelemetryEventName.TASK_CONVERSATION_MESSAGE],
			},
			debug,
		)

		this.log = log || console.log

		// Initialize queue manager
		this.queueManager = TelemetryQueueManager.getInstance()
		this.queueManager.setProcessCallback(this.processBatchedEvents.bind(this))
		this.queueManager.setLogger(this.log)

		// Check if queue is enabled
		try {
			this.isQueueEnabled = ContextProxy.instance.getValue("telemetryQueueEnabled") ?? true
		} catch (_error) {
			// Default to enabled if we can't access settings
			this.isQueueEnabled = true
		}
	}

	private async fetch(path: string, options: RequestInit) {
		if (!this.authService.isAuthenticated()) {
			return
		}

		const token = this.authService.getSessionToken()

		if (!token) {
			this.log(`[TelemetryClient#fetch] Unauthorized: No session token available.`)
			return
		}

		const response = await fetch(`${getRooCodeApiUrl()}/api/${path}`, {
			...options,
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		})

		if (!response.ok) {
			this.log(`[TelemetryClient#fetch] ${options.method} ${path} -> ${response.status} ${response.statusText}`)
		}
	}

	public override async capture(event: TelemetryEvent) {
		if (!this.isTelemetryEnabled() || !this.isEventCapturable(event.event)) {
			if (this.debug) {
				console.info(`[TelemetryClient#capture] Skipping event: ${event.event}`)
			}

			return
		}

		const payload = {
			type: event.event,
			properties: await this.getEventProperties(event),
		}

		if (this.debug) {
			console.info(`[TelemetryClient#capture] ${JSON.stringify(payload)}`)
		}

		const result = rooCodeTelemetryEventSchema.safeParse(payload)

		if (!result.success) {
			this.log(
				`[TelemetryClient#capture] Invalid telemetry event: ${result.error.message} - ${JSON.stringify(payload)}`,
			)

			return
		}

		try {
			await this.fetch(`events`, { method: "POST", body: JSON.stringify(result.data) })
			// Process any queued events on successful send if queue is enabled
			if (this.isQueueEnabled) {
				this.debouncedProcessQueue()
			}
		} catch (error) {
			this.log(`[TelemetryClient#capture] Error sending telemetry event: ${error}`)
			// Add to queue for retry if queue is enabled
			if (this.isQueueEnabled) {
				const priority = this.queueManager.isErrorEvent(event.event) ? "high" : "normal"
				await this.queueManager.addToQueue(event, priority)
			}
		}
	}

	/**
	 * Debounced queue processing to avoid excessive calls
	 */
	private debouncedProcessQueue(): void {
		if (this.processQueueDebounceTimer) {
			clearTimeout(this.processQueueDebounceTimer)
		}
		if (this.processQueueAbortController) {
			this.processQueueAbortController.abort()
		}
		this.processQueueAbortController = new AbortController()
		const signal = this.processQueueAbortController.signal

		this.processQueueDebounceTimer = setTimeout(() => {
			if (signal.aborted) {
				return
			}
			this.queueManager.processQueue().catch((error) => {
				this.log(`[TelemetryClient#debouncedProcessQueue] Error processing queue: ${error}`)
			})
		}, this.processQueueDebounceDelay)
	}

	public async backfillMessages(messages: ClineMessage[], taskId: string): Promise<void> {
		if (!this.authService.isAuthenticated()) {
			if (this.debug) {
				console.info(`[TelemetryClient#backfillMessages] Skipping: Not authenticated`)
			}
			return
		}

		const token = this.authService.getSessionToken()

		if (!token) {
			this.log(`[TelemetryClient#backfillMessages] Unauthorized: No session token available.`)
			return
		}

		try {
			const mergedProperties = await this.getEventProperties({
				event: TelemetryEventName.TASK_MESSAGE,
				properties: { taskId },
			})

			const formData = new FormData()
			formData.append("taskId", taskId)
			formData.append("properties", JSON.stringify(mergedProperties))

			formData.append(
				"file",
				new File([JSON.stringify(messages)], "task.json", {
					type: "application/json",
				}),
			)

			if (this.debug) {
				console.info(
					`[TelemetryClient#backfillMessages] Uploading ${messages.length} messages for task ${taskId}`,
				)
			}

			// Custom fetch for multipart - don't set Content-Type header (let browser set it)
			const response = await fetch(`${getRooCodeApiUrl()}/api/events/backfill`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					// Note: No Content-Type header - browser will set multipart/form-data with boundary
				},
				body: formData,
			})

			if (!response.ok) {
				this.log(
					`[TelemetryClient#backfillMessages] POST events/backfill -> ${response.status} ${response.statusText}`,
				)
			} else if (this.debug) {
				console.info(`[TelemetryClient#backfillMessages] Successfully uploaded messages for task ${taskId}`)
			}
		} catch (error) {
			this.log(`[TelemetryClient#backfillMessages] Error uploading messages: ${error}`)
		}
	}

	public override updateTelemetryState(_didUserOptIn: boolean) {}

	public override isTelemetryEnabled(): boolean {
		return true
	}

	protected override isEventCapturable(eventName: TelemetryEventName): boolean {
		// Ensure that this event type is supported by the telemetry client
		if (!super.isEventCapturable(eventName)) {
			return false
		}

		// Only record message telemetry if a cloud account is present and explicitly configured to record messages
		if (eventName === TelemetryEventName.TASK_MESSAGE) {
			return this.settingsService.getSettings()?.cloudSettings?.recordTaskMessages || false
		}

		// Other telemetry types are capturable at this point
		return true
	}

	public override async shutdown() {
		// Clear any pending debounce timer
		if (this.processQueueDebounceTimer) {
			clearTimeout(this.processQueueDebounceTimer)
			this.processQueueDebounceTimer = null
		}
		// Abort any pending operations
		if (this.processQueueAbortController) {
			this.processQueueAbortController.abort()
			this.processQueueAbortController = null
		}

		// Process any remaining queued events before shutdown if queue is enabled
		if (this.isQueueEnabled) {
			try {
				await this.queueManager.processQueue()
			} catch (error) {
				this.log(`[TelemetryClient#shutdown] Error processing queue: ${error}`)
			}
		}
	}

	/**
	 * Process batched events from the queue
	 */
	private async processBatchedEvents(events: QueuedTelemetryEvent[]): Promise<void> {
		if (!this.authService.isAuthenticated()) {
			throw new Error("Not authenticated")
		}

		const token = this.authService.getSessionToken()
		if (!token) {
			throw new Error("No session token available")
		}

		// Process each event individually to maintain compatibility
		for (const queuedEvent of events) {
			try {
				const payload = {
					type: queuedEvent.event.event,
					properties: await this.getEventProperties(queuedEvent.event),
				}

				const result = rooCodeTelemetryEventSchema.safeParse(payload)
				if (!result.success) {
					this.log(`[TelemetryClient#processBatchedEvents] Invalid telemetry event: ${result.error.message}`)
					continue
				}

				await this.fetch(`events`, { method: "POST", body: JSON.stringify(result.data) })
			} catch (error) {
				// Log the error but continue processing other events
				this.log(`[TelemetryClient#processBatchedEvents] Error processing event ${queuedEvent.id}: ${error}`)
				// Re-throw to let the queue manager handle retry logic
				throw error
			}
		}
	}
}
