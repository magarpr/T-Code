import axios, { AxiosRequestConfig } from "axios"
import * as yaml from "yaml"
import { z } from "zod"
import { getRooCodeApiUrl } from "@roo-code/cloud"
import type { MarketplaceItem, MarketplaceItemType } from "@roo-code/types"
import { modeMarketplaceItemSchema, mcpMarketplaceItemSchema } from "@roo-code/types"

// Response schemas for YAML API responses
const modeMarketplaceResponse = z.object({
	items: z.array(modeMarketplaceItemSchema),
})

const mcpMarketplaceResponse = z.object({
	items: z.array(mcpMarketplaceItemSchema),
})

export class RemoteConfigLoader {
	private apiBaseUrl: string
	private cache: Map<string, { data: MarketplaceItem[]; timestamp: number }> = new Map()
	private cacheDuration = 5 * 60 * 1000 // 5 minutes

	constructor() {
		this.apiBaseUrl = getRooCodeApiUrl()
	}

	private getProxyConfig(): Partial<AxiosRequestConfig> {
		// Check for proxy environment variables
		const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy
		const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy
		const noProxy = process.env.NO_PROXY || process.env.no_proxy

		// Check if the API URL should bypass proxy
		if (noProxy) {
			const noProxyList = noProxy.split(",").map((host) => host.trim())
			const apiUrl = new URL(this.apiBaseUrl)
			const shouldBypassProxy = noProxyList.some((host) => {
				if (host === "*") return true
				if (host.startsWith(".")) return apiUrl.hostname.endsWith(host)
				return apiUrl.hostname === host || apiUrl.hostname.endsWith("." + host)
			})
			if (shouldBypassProxy) return {}
		}

		// Use axios built-in proxy support
		const apiUrl = new URL(this.apiBaseUrl)
		const proxyUrl = apiUrl.protocol === "https:" ? httpsProxy : httpProxy

		if (proxyUrl) {
			try {
				const proxy = new URL(proxyUrl)
				return {
					proxy: {
						protocol: proxy.protocol.slice(0, -1), // Remove trailing ':'
						host: proxy.hostname,
						port: parseInt(proxy.port) || (proxy.protocol === "https:" ? 443 : 80),
						...(proxy.username && { auth: { username: proxy.username, password: proxy.password || "" } }),
					},
				}
			} catch (error) {
				console.warn("Invalid proxy URL format:", proxyUrl)
			}
		}

		return {}
	}

	async loadAllItems(hideMarketplaceMcps = false): Promise<MarketplaceItem[]> {
		const items: MarketplaceItem[] = []

		const modesPromise = this.fetchModes()
		const mcpsPromise = hideMarketplaceMcps ? Promise.resolve([]) : this.fetchMcps()

		const [modes, mcps] = await Promise.all([modesPromise, mcpsPromise])

		items.push(...modes, ...mcps)
		return items
	}

	private async fetchModes(): Promise<MarketplaceItem[]> {
		const cacheKey = "modes"
		const cached = this.getFromCache(cacheKey)
		if (cached) return cached

		const data = await this.fetchWithRetry<string>(`${this.apiBaseUrl}/api/marketplace/modes`)

		// Parse and validate YAML response
		const yamlData = yaml.parse(data)
		const validated = modeMarketplaceResponse.parse(yamlData)

		const items: MarketplaceItem[] = validated.items.map((item) => ({
			type: "mode" as const,
			...item,
		}))

		this.setCache(cacheKey, items)
		return items
	}

	private async fetchMcps(): Promise<MarketplaceItem[]> {
		const cacheKey = "mcps"
		const cached = this.getFromCache(cacheKey)
		if (cached) return cached

		const data = await this.fetchWithRetry<string>(`${this.apiBaseUrl}/api/marketplace/mcps`)

		// Parse and validate YAML response
		const yamlData = yaml.parse(data)
		const validated = mcpMarketplaceResponse.parse(yamlData)

		const items: MarketplaceItem[] = validated.items.map((item) => ({
			type: "mcp" as const,
			...item,
		}))

		this.setCache(cacheKey, items)
		return items
	}

	private async fetchWithRetry<T>(url: string, maxRetries = 3): Promise<T> {
		let lastError: Error

		for (let i = 0; i < maxRetries; i++) {
			try {
				const proxyConfig = this.getProxyConfig()
				const config: AxiosRequestConfig = {
					timeout: 15000, // Increased timeout for corporate networks
					headers: {
						Accept: "application/json",
						"Content-Type": "application/json",
						"User-Agent": "Roo-Code-Extension/1.0",
					},
					// Add proxy configuration
					...proxyConfig,
					// Additional network resilience options
					maxRedirects: 5,
					validateStatus: (status) => status < 500, // Accept 4xx errors but retry 5xx
				}

				const response = await axios.get(url, config)

				// Handle non-2xx responses gracefully
				if (response.status >= 400) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`)
				}

				return response.data as T
			} catch (error) {
				lastError = error as Error

				// Enhanced error categorization for better retry logic
				const isNetworkError = this.isNetworkError(error)
				const isRetryableError = this.isRetryableError(error)

				// Don't retry on non-retryable errors (like 404, 401, etc.)
				if (!isRetryableError && i === 0) {
					// For non-retryable errors, throw immediately with enhanced message
					throw this.enhanceError(error as Error)
				}

				if (i < maxRetries - 1 && (isNetworkError || isRetryableError)) {
					// Progressive backoff: 2s, 4s, 8s for network issues
					const baseDelay = isNetworkError ? 2000 : 1000
					const delay = Math.pow(2, i) * baseDelay
					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}

		throw this.enhanceError(lastError!)
	}

	private isNetworkError(error: any): boolean {
		if (!error) return false

		const networkErrorCodes = [
			"ECONNRESET",
			"ECONNREFUSED",
			"ENOTFOUND",
			"ENETUNREACH",
			"ETIMEDOUT",
			"ECONNABORTED",
			"EHOSTUNREACH",
			"EPIPE",
		]

		return (
			networkErrorCodes.includes(error.code) ||
			error.message?.includes("socket hang up") ||
			error.message?.includes("timeout") ||
			error.message?.includes("network")
		)
	}

	private isRetryableError(error: any): boolean {
		if (!error) return false

		// Retry on network errors
		if (this.isNetworkError(error)) return true

		// Retry on 5xx server errors
		if (error.response?.status >= 500) return true

		// Retry on specific axios errors
		if (error.code === "ECONNABORTED") return true

		return false
	}

	private enhanceError(error: Error): Error {
		const originalMessage = error.message || "Unknown error"

		// Provide user-friendly error messages for common network issues
		if (originalMessage.includes("socket hang up")) {
			return new Error(
				"Network connection was interrupted while loading marketplace data. " +
					"This may be due to corporate proxy settings or network restrictions. " +
					"Please check your network configuration or try again later.",
			)
		}

		if (originalMessage.includes("ENOTFOUND") || originalMessage.includes("getaddrinfo")) {
			return new Error(
				"Unable to resolve marketplace server address. " +
					"Please check your internet connection and DNS settings.",
			)
		}

		if (originalMessage.includes("ECONNREFUSED")) {
			return new Error(
				"Connection to marketplace server was refused. " + "The service may be temporarily unavailable.",
			)
		}

		if (originalMessage.includes("timeout")) {
			return new Error(
				"Request to marketplace server timed out. " +
					"This may be due to slow network conditions or corporate firewall settings.",
			)
		}

		if (originalMessage.includes("ECONNRESET")) {
			return new Error(
				"Connection to marketplace server was reset. " +
					"This often occurs in corporate networks with strict proxy policies.",
			)
		}

		// For HTTP errors, provide more context
		if (originalMessage.includes("HTTP 4")) {
			return new Error(
				"Marketplace server returned a client error. " + "The requested resource may not be available.",
			)
		}

		if (originalMessage.includes("HTTP 5")) {
			return new Error("Marketplace server is experiencing issues. " + "Please try again later.")
		}

		// Return enhanced error with original message for debugging
		return new Error(
			`Failed to load marketplace data: ${originalMessage}. ` +
				"If you are behind a corporate firewall, please ensure proxy settings are configured correctly.",
		)
	}

	async getItem(id: string, type: MarketplaceItemType): Promise<MarketplaceItem | null> {
		const items = await this.loadAllItems()
		return items.find((item) => item.id === id && item.type === type) || null
	}

	private getFromCache(key: string): MarketplaceItem[] | null {
		const cached = this.cache.get(key)
		if (!cached) return null

		const now = Date.now()
		if (now - cached.timestamp > this.cacheDuration) {
			this.cache.delete(key)
			return null
		}

		return cached.data
	}

	private setCache(key: string, data: MarketplaceItem[]): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now(),
		})
	}

	clearCache(): void {
		this.cache.clear()
	}
}
