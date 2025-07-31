// Test to validate XcodeBuildMCP marketplace integration
import { describe, it, expect } from "vitest"
import { mcpMarketplaceItemSchema, type McpMarketplaceItem } from "@roo-code/types"

describe("XcodeBuildMCP Marketplace Integration", () => {
	const xcodeBuildMcpConfig: McpMarketplaceItem = {
		id: "xcodebuildmcp",
		name: "XcodeBuildMCP",
		description:
			"A comprehensive Model Context Protocol server that provides Xcode-related tools for building, testing, and managing iOS/macOS projects, simulators, and devices.",
		author: "Cameron Cooke",
		authorUrl: "https://github.com/cameroncooke",
		url: "https://github.com/cameroncooke/XcodeBuildMCP",
		tags: ["xcode", "ios", "macos", "swift", "simulator", "device", "build", "test"],
		prerequisites: ["Xcode 16.x or later", "Node.js 18.x or later", "macOS"],
		content: JSON.stringify({
			command: "npx",
			args: ["-y", "xcodebuildmcp@latest"],
		}),
		parameters: [
			{
				name: "Enable Incremental Builds",
				key: "INCREMENTAL_BUILDS_ENABLED",
				placeholder: "true",
				optional: true,
			},
			{
				name: "Disable Sentry Telemetry",
				key: "SENTRY_DISABLED",
				placeholder: "true",
				optional: true,
			},
		],
	}

	it("should validate XcodeBuildMCP configuration against marketplace schema", () => {
		expect(() => mcpMarketplaceItemSchema.parse(xcodeBuildMcpConfig)).not.toThrow()

		const validated = mcpMarketplaceItemSchema.parse(xcodeBuildMcpConfig)
		expect(validated.id).toBe("xcodebuildmcp")
		expect(validated.name).toBe("XcodeBuildMCP")
		expect(validated.url).toBe("https://github.com/cameroncooke/XcodeBuildMCP")
		expect(validated.parameters).toHaveLength(2)
	})

	it("should have valid URL fields", () => {
		const validated = mcpMarketplaceItemSchema.parse(xcodeBuildMcpConfig)
		expect(validated.url).toMatch(/^https:\/\//)
		expect(validated.authorUrl).toMatch(/^https:\/\//)
	})

	it("should have proper parameter configuration", () => {
		const validated = mcpMarketplaceItemSchema.parse(xcodeBuildMcpConfig)

		// Check incremental builds parameter
		const incrementalParam = validated.parameters?.find((p) => p.key === "INCREMENTAL_BUILDS_ENABLED")
		expect(incrementalParam).toBeDefined()
		expect(incrementalParam?.optional).toBe(true)
		expect(incrementalParam?.name).toBe("Enable Incremental Builds")

		// Check sentry parameter
		const sentryParam = validated.parameters?.find((p) => p.key === "SENTRY_DISABLED")
		expect(sentryParam).toBeDefined()
		expect(sentryParam?.optional).toBe(true)
		expect(sentryParam?.name).toBe("Disable Sentry Telemetry")
	})

	it("should have valid content configuration", () => {
		const validated = mcpMarketplaceItemSchema.parse(xcodeBuildMcpConfig)
		const contentObj = JSON.parse(validated.content as string)

		expect(contentObj.command).toBe("npx")
		expect(contentObj.args).toEqual(["-y", "xcodebuildmcp@latest"])
	})

	it("should have appropriate tags for Xcode development", () => {
		const validated = mcpMarketplaceItemSchema.parse(xcodeBuildMcpConfig)

		expect(validated.tags).toContain("xcode")
		expect(validated.tags).toContain("ios")
		expect(validated.tags).toContain("macos")
		expect(validated.tags).toContain("swift")
		expect(validated.tags).toContain("simulator")
		expect(validated.tags).toContain("device")
		expect(validated.tags).toContain("build")
		expect(validated.tags).toContain("test")
	})

	it("should have proper prerequisites", () => {
		const validated = mcpMarketplaceItemSchema.parse(xcodeBuildMcpConfig)

		expect(validated.prerequisites).toContain("Xcode 16.x or later")
		expect(validated.prerequisites).toContain("Node.js 18.x or later")
		expect(validated.prerequisites).toContain("macOS")
	})
})
