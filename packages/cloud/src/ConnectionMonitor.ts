import { EventEmitter } from "events"
import { getRooCodeApiUrl } from "./Config"

export class ConnectionMonitor extends EventEmitter {
	private isOnline = true
	private checkInterval: NodeJS.Timeout | null = null
	private readonly healthCheckEndpoint = "/api/health"
	private readonly defaultCheckInterval = 30000 // 30 seconds

	constructor() {
		super()
	}

	/**
	 * Check if the connection to the API is available
	 */
	public async checkConnection(): Promise<boolean> {
		try {
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

			const response = await fetch(`${getRooCodeApiUrl()}${this.healthCheckEndpoint}`, {
				method: "GET",
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			const wasOffline = !this.isOnline
			this.isOnline = response.ok

			// Emit event if connection status changed from offline to online
			if (wasOffline && this.isOnline) {
				this.emit("connection-restored")
			}

			return this.isOnline
		} catch (_error) {
			const wasOnline = this.isOnline
			this.isOnline = false

			// Emit event if connection status changed from online to offline
			if (wasOnline && !this.isOnline) {
				this.emit("connection-lost")
			}

			return false
		}
	}

	/**
	 * Get current connection status
	 */
	public getConnectionStatus(): boolean {
		return this.isOnline
	}

	/**
	 * Register a callback for when connection is restored
	 */
	public onConnectionRestored(callback: () => void): void {
		this.on("connection-restored", callback)
	}

	/**
	 * Register a callback for when connection is lost
	 */
	public onConnectionLost(callback: () => void): void {
		this.on("connection-lost", callback)
	}

	/**
	 * Start monitoring the connection
	 */
	public startMonitoring(intervalMs: number = this.defaultCheckInterval): void {
		// Stop any existing monitoring
		this.stopMonitoring()

		// Initial check
		this.checkConnection()

		// Set up periodic checks
		this.checkInterval = setInterval(() => {
			this.checkConnection()
		}, intervalMs)
	}

	/**
	 * Stop monitoring the connection
	 */
	public stopMonitoring(): void {
		if (this.checkInterval) {
			clearInterval(this.checkInterval)
			this.checkInterval = null
		}
	}

	/**
	 * Clean up resources
	 */
	public dispose(): void {
		this.stopMonitoring()
		this.removeAllListeners()
	}
}
