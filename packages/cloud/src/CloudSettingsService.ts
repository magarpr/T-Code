import * as vscode from "vscode"
import EventEmitter from "events"

import {
	ORGANIZATION_ALLOW_ALL,
	OrganizationAllowList,
	OrganizationSettings,
	organizationSettingsSchema,
} from "@roo-code/types"

import { getRooCodeApiUrl } from "./config"
import type { AuthService, AuthState } from "./auth"
import { RefreshTimer } from "./RefreshTimer"
import type { SettingsService } from "./SettingsService"

const ORGANIZATION_SETTINGS_CACHE_KEY = "organization-settings"
const MAX_FETCH_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second

export interface SettingsServiceEvents {
	"settings-updated": [
		data: {
			settings: OrganizationSettings
			previousSettings: OrganizationSettings | undefined
		},
	]
}

export class CloudSettingsService extends EventEmitter<SettingsServiceEvents> implements SettingsService {
	private context: vscode.ExtensionContext
	private authService: AuthService
	private settings: OrganizationSettings | undefined = undefined
	private timer: RefreshTimer
	private log: (...args: unknown[]) => void

	constructor(context: vscode.ExtensionContext, authService: AuthService, log?: (...args: unknown[]) => void) {
		super()

		this.context = context
		this.authService = authService
		this.log = log || console.log

		this.timer = new RefreshTimer({
			callback: async () => {
				return await this.fetchSettings()
			},
			successInterval: 30000,
			initialBackoffMs: 1000,
			maxBackoffMs: 30000,
		})
	}

	public initialize(): void {
		this.loadCachedSettings()

		// Clear cached settings if we have missed a log out.
		if (this.authService.getState() == "logged-out" && this.settings) {
			this.removeSettings()
		}

		this.authService.on("auth-state-changed", (data: { state: AuthState; previousState: AuthState }) => {
			if (data.state === "active-session") {
				this.timer.start()
			} else if (data.previousState === "active-session") {
				this.timer.stop()

				if (data.state === "logged-out") {
					this.removeSettings()
				}
			}
		})

		if (this.authService.hasActiveSession()) {
			this.timer.start()
		}
	}

	/**
	 * Performs network diagnostics to help debug connectivity issues
	 */
	private async performNetworkDiagnostics(url: string): Promise<void> {
		this.log("[cloud-settings] Performing network diagnostics...")

		// Check if we're in a proxy environment
		const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy
		const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy
		const noProxy = process.env.NO_PROXY || process.env.no_proxy

		if (httpProxy || httpsProxy) {
			this.log("  Proxy configuration detected:")
			if (httpProxy) this.log(`    HTTP_PROXY: ${httpProxy}`)
			if (httpsProxy) this.log(`    HTTPS_PROXY: ${httpsProxy}`)
			if (noProxy) this.log(`    NO_PROXY: ${noProxy}`)
		}

		// Log Node.js version (can affect fetch behavior)
		this.log(`  Node.js version: ${process.version}`)

		// Log VSCode version
		this.log(`  VSCode version: ${vscode.version}`)

		// Try to parse the URL to check components
		try {
			const parsedUrl = new URL(url)
			this.log(`  URL components:`)
			this.log(`    Protocol: ${parsedUrl.protocol}`)
			this.log(`    Hostname: ${parsedUrl.hostname}`)
			this.log(`    Port: ${parsedUrl.port || "(default)"}`)
			this.log(`    Path: ${parsedUrl.pathname}`)
		} catch (e) {
			this.log(`  Failed to parse URL: ${e}`)
		}
	}

	/**
	 * Attempts to fetch with retry logic and enhanced error handling
	 */
	private async fetchWithRetry(url: string, options: RequestInit, retryCount: number = 0): Promise<Response> {
		try {
			const response = await fetch(url, options)
			return response
		} catch (error) {
			if (retryCount >= MAX_FETCH_RETRIES) {
				throw error
			}

			const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount)
			this.log(
				`[cloud-settings] Fetch failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_FETCH_RETRIES})`,
			)

			// Wait before retrying
			await new Promise((resolve) => setTimeout(resolve, delay))

			return this.fetchWithRetry(url, options, retryCount + 1)
		}
	}

	private async fetchSettings(): Promise<boolean> {
		const token = this.authService.getSessionToken()

		if (!token) {
			return false
		}

		const apiUrl = getRooCodeApiUrl()
		const fullUrl = `${apiUrl}/api/organization-settings`

		try {
			this.log(`[cloud-settings] Attempting to fetch from: ${fullUrl}`)

			const response = await this.fetchWithRetry(fullUrl, {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})

			if (!response.ok) {
				this.log(
					"[cloud-settings] Failed to fetch organization settings:",
					response.status,
					response.statusText,
				)
				return false
			}

			const data = await response.json()
			const result = organizationSettingsSchema.safeParse(data)

			if (!result.success) {
				this.log("[cloud-settings] Invalid organization settings format:", result.error)
				return false
			}

			const newSettings = result.data

			if (!this.settings || this.settings.version !== newSettings.version) {
				const previousSettings = this.settings
				this.settings = newSettings
				await this.cacheSettings()

				this.emit("settings-updated", {
					settings: this.settings,
					previousSettings,
				})
			}

			return true
		} catch (error) {
			// Enhanced error logging with more details
			if (error instanceof Error) {
				this.log("[cloud-settings] Error fetching organization settings:")
				this.log("  Error name:", error.name)
				this.log("  Error message:", error.message)

				// Check for specific error types
				if (error.message.includes("fetch failed")) {
					this.log("  This appears to be a network connectivity issue.")
					this.log("  Possible causes:")
					this.log("    - Network proxy configuration")
					this.log("    - Firewall blocking the request")
					this.log("    - DNS resolution issues")
					this.log("    - VSCode extension host network restrictions")
					this.log(`  Target URL: ${fullUrl}`)

					// Perform additional network diagnostics
					await this.performNetworkDiagnostics(fullUrl)

					// Log additional error details if available
					if ("cause" in error && error.cause) {
						this.log("  Underlying cause:", error.cause)
					}
				}

				// Log stack trace for debugging
				if (error.stack) {
					this.log("  Stack trace:", error.stack)
				}
			} else {
				this.log("[cloud-settings] Unknown error type:", error)
			}

			return false
		}
	}

	private async cacheSettings(): Promise<void> {
		await this.context.globalState.update(ORGANIZATION_SETTINGS_CACHE_KEY, this.settings)
	}

	private loadCachedSettings(): void {
		this.settings = this.context.globalState.get<OrganizationSettings>(ORGANIZATION_SETTINGS_CACHE_KEY)
	}

	public getAllowList(): OrganizationAllowList {
		return this.settings?.allowList || ORGANIZATION_ALLOW_ALL
	}

	public getSettings(): OrganizationSettings | undefined {
		return this.settings
	}

	private async removeSettings(): Promise<void> {
		this.settings = undefined
		await this.cacheSettings()
	}

	public dispose(): void {
		this.removeAllListeners()
		this.timer.stop()
	}
}
