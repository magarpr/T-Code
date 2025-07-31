import { describe, it, expect } from "vitest"
import { providerSettingsSchema } from "../provider-settings.js"

describe("Provider Settings - Enterprise Network Configuration", () => {
	describe("Connection Keep-Alive Settings", () => {
		it("should accept valid connectionKeepAliveEnabled values", () => {
			const validConfigs = [
				{ apiProvider: "anthropic", connectionKeepAliveEnabled: true },
				{ apiProvider: "anthropic", connectionKeepAliveEnabled: false },
				{ apiProvider: "anthropic", connectionKeepAliveEnabled: undefined }, // Should use default
				{ apiProvider: "anthropic" }, // Should use default
			]

			validConfigs.forEach((config) => {
				const result = providerSettingsSchema.safeParse(config)
				expect(result.success).toBe(true)
				if (result.success) {
					expect(result.data.connectionKeepAliveEnabled).toBe(
						config.connectionKeepAliveEnabled ?? true, // Default value
					)
				}
			})
		})

		it("should accept valid connectionKeepAliveInterval values", () => {
			const validConfigs = [
				{ apiProvider: "anthropic", connectionKeepAliveInterval: 5000 }, // Minimum
				{ apiProvider: "anthropic", connectionKeepAliveInterval: 30000 }, // Default
				{ apiProvider: "anthropic", connectionKeepAliveInterval: 60000 }, // Custom
				{ apiProvider: "anthropic", connectionKeepAliveInterval: 300000 }, // Maximum
				{ apiProvider: "anthropic", connectionKeepAliveInterval: undefined }, // Should use default
				{ apiProvider: "anthropic" }, // Should use default
			]

			validConfigs.forEach((config) => {
				const result = providerSettingsSchema.safeParse(config)
				expect(result.success).toBe(true)
				if (result.success) {
					expect(result.data.connectionKeepAliveInterval).toBe(
						config.connectionKeepAliveInterval ?? 30000, // Default value
					)
				}
			})
		})

		it("should reject invalid connectionKeepAliveInterval values", () => {
			const invalidConfigs = [
				{ apiProvider: "anthropic", connectionKeepAliveInterval: 4999 }, // Below minimum
				{ apiProvider: "anthropic", connectionKeepAliveInterval: 300001 }, // Above maximum
				{ apiProvider: "anthropic", connectionKeepAliveInterval: -1000 }, // Negative
				{ apiProvider: "anthropic", connectionKeepAliveInterval: 0 }, // Zero
			]

			invalidConfigs.forEach((config) => {
				const result = providerSettingsSchema.safeParse(config)
				expect(result.success).toBe(false)
			})
		})
	})

	describe("Connection Retry Settings", () => {
		it("should accept valid connectionRetryEnabled values", () => {
			const validConfigs = [
				{ apiProvider: "anthropic", connectionRetryEnabled: true },
				{ apiProvider: "anthropic", connectionRetryEnabled: false },
				{ apiProvider: "anthropic", connectionRetryEnabled: undefined }, // Should use default
				{ apiProvider: "anthropic" }, // Should use default
			]

			validConfigs.forEach((config) => {
				const result = providerSettingsSchema.safeParse(config)
				expect(result.success).toBe(true)
				if (result.success) {
					expect(result.data.connectionRetryEnabled).toBe(
						config.connectionRetryEnabled ?? true, // Default value
					)
				}
			})
		})

		it("should accept valid connectionMaxRetries values", () => {
			const validConfigs = [
				{ apiProvider: "anthropic", connectionMaxRetries: 0 }, // Minimum (no retries)
				{ apiProvider: "anthropic", connectionMaxRetries: 3 }, // Default
				{ apiProvider: "anthropic", connectionMaxRetries: 5 }, // Custom
				{ apiProvider: "anthropic", connectionMaxRetries: 10 }, // Maximum
				{ apiProvider: "anthropic", connectionMaxRetries: undefined }, // Should use default
				{ apiProvider: "anthropic" }, // Should use default
			]

			validConfigs.forEach((config) => {
				const result = providerSettingsSchema.safeParse(config)
				expect(result.success).toBe(true)
				if (result.success) {
					expect(result.data.connectionMaxRetries).toBe(
						config.connectionMaxRetries ?? 3, // Default value
					)
				}
			})
		})

		it("should reject invalid connectionMaxRetries values", () => {
			const invalidConfigs = [
				{ apiProvider: "anthropic", connectionMaxRetries: -1 }, // Below minimum
				{ apiProvider: "anthropic", connectionMaxRetries: 11 }, // Above maximum
			]

			invalidConfigs.forEach((config) => {
				const result = providerSettingsSchema.safeParse(config)
				expect(result.success).toBe(false)
			})
		})

		it("should accept valid connectionRetryBaseDelay values", () => {
			const validConfigs = [
				{ apiProvider: "anthropic", connectionRetryBaseDelay: 1000 }, // Minimum
				{ apiProvider: "anthropic", connectionRetryBaseDelay: 2000 }, // Default
				{ apiProvider: "anthropic", connectionRetryBaseDelay: 5000 }, // Custom
				{ apiProvider: "anthropic", connectionRetryBaseDelay: 30000 }, // Maximum
				{ apiProvider: "anthropic", connectionRetryBaseDelay: undefined }, // Should use default
				{ apiProvider: "anthropic" }, // Should use default
			]

			validConfigs.forEach((config) => {
				const result = providerSettingsSchema.safeParse(config)
				expect(result.success).toBe(true)
				if (result.success) {
					expect(result.data.connectionRetryBaseDelay).toBe(
						config.connectionRetryBaseDelay ?? 2000, // Default value
					)
				}
			})
		})

		it("should reject invalid connectionRetryBaseDelay values", () => {
			const invalidConfigs = [
				{ apiProvider: "anthropic", connectionRetryBaseDelay: 999 }, // Below minimum
				{ apiProvider: "anthropic", connectionRetryBaseDelay: 30001 }, // Above maximum
				{ apiProvider: "anthropic", connectionRetryBaseDelay: -500 }, // Negative
				{ apiProvider: "anthropic", connectionRetryBaseDelay: 0 }, // Zero
			]

			invalidConfigs.forEach((config) => {
				const result = providerSettingsSchema.safeParse(config)
				expect(result.success).toBe(false)
			})
		})
	})

	describe("Complete Enterprise Configuration", () => {
		it("should accept a complete enterprise network configuration", () => {
			const enterpriseConfig = {
				apiProvider: "anthropic" as const,
				apiKey: "test-key",
				connectionKeepAliveEnabled: true,
				connectionKeepAliveInterval: 60000, // 1 minute
				connectionRetryEnabled: true,
				connectionMaxRetries: 5,
				connectionRetryBaseDelay: 3000, // 3 seconds
			}

			const result = providerSettingsSchema.safeParse(enterpriseConfig)
			expect(result.success).toBe(true)

			if (result.success) {
				expect(result.data.connectionKeepAliveEnabled).toBe(true)
				expect(result.data.connectionKeepAliveInterval).toBe(60000)
				expect(result.data.connectionRetryEnabled).toBe(true)
				expect(result.data.connectionMaxRetries).toBe(5)
				expect(result.data.connectionRetryBaseDelay).toBe(3000)
			}
		})

		it("should work with minimal configuration (using defaults)", () => {
			const minimalConfig = {
				apiProvider: "anthropic" as const,
				apiKey: "test-key",
			}

			const result = providerSettingsSchema.safeParse(minimalConfig)
			expect(result.success).toBe(true)

			if (result.success) {
				// Should use default values
				expect(result.data.connectionKeepAliveEnabled).toBe(true)
				expect(result.data.connectionKeepAliveInterval).toBe(30000)
				expect(result.data.connectionRetryEnabled).toBe(true)
				expect(result.data.connectionMaxRetries).toBe(3)
				expect(result.data.connectionRetryBaseDelay).toBe(2000)
			}
		})

		it("should work with disabled enterprise features", () => {
			const disabledConfig = {
				apiProvider: "anthropic" as const,
				apiKey: "test-key",
				connectionKeepAliveEnabled: false,
				connectionRetryEnabled: false,
				connectionMaxRetries: 0,
			}

			const result = providerSettingsSchema.safeParse(disabledConfig)
			expect(result.success).toBe(true)

			if (result.success) {
				expect(result.data.connectionKeepAliveEnabled).toBe(false)
				expect(result.data.connectionRetryEnabled).toBe(false)
				expect(result.data.connectionMaxRetries).toBe(0)
			}
		})
	})

	describe("Backward Compatibility", () => {
		it("should not break existing configurations without enterprise settings", () => {
			const existingConfig = {
				apiProvider: "anthropic" as const,
				apiKey: "test-key",
				apiModelId: "claude-3-5-sonnet-20241022",
				modelMaxTokens: 4096,
			}

			const result = providerSettingsSchema.safeParse(existingConfig)
			expect(result.success).toBe(true)

			if (result.success) {
				// Should have all original fields
				expect(result.data.apiProvider).toBe("anthropic")
				expect(result.data.apiKey).toBe("test-key")
				expect(result.data.apiModelId).toBe("claude-3-5-sonnet-20241022")
				expect(result.data.modelMaxTokens).toBe(4096)

				// Should have default enterprise settings
				expect(result.data.connectionKeepAliveEnabled).toBe(true)
				expect(result.data.connectionKeepAliveInterval).toBe(30000)
				expect(result.data.connectionRetryEnabled).toBe(true)
				expect(result.data.connectionMaxRetries).toBe(3)
				expect(result.data.connectionRetryBaseDelay).toBe(2000)
			}
		})
	})
})
