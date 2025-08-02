import { describe, it, expect, vi, beforeEach } from "vitest"
import { fetchInstructions } from "../instructions"
import { createMCPServerInstructions } from "../create-mcp-server"
import { createModeInstructions } from "../create-mode"
import { McpHub } from "../../../../services/mcp/McpHub"
import { DiffStrategy } from "../../../../shared/tools"
import * as vscode from "vscode"

// Mock the imported modules
vi.mock("../create-mcp-server", () => ({
	createMCPServerInstructions: vi.fn(),
}))

vi.mock("../create-mode", () => ({
	createModeInstructions: vi.fn(),
}))

describe("fetchInstructions", () => {
	const mockMcpHub = {} as McpHub
	const mockDiffStrategy = {} as DiffStrategy
	const mockContext = {} as vscode.ExtensionContext

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("create_mcp_server", () => {
		it("should return MCP server instructions when enableMcpServerCreation is true", async () => {
			const mockInstructions = "MCP server creation instructions"
			vi.mocked(createMCPServerInstructions).mockResolvedValue(mockInstructions)

			const result = await fetchInstructions("create_mcp_server", {
				mcpHub: mockMcpHub,
				diffStrategy: mockDiffStrategy,
				enableMcpServerCreation: true,
			})

			expect(result).toBe(mockInstructions)
			expect(createMCPServerInstructions).toHaveBeenCalledWith(mockMcpHub, mockDiffStrategy)
		})

		it("should return MCP server instructions when enableMcpServerCreation is undefined (default true)", async () => {
			const mockInstructions = "MCP server creation instructions"
			vi.mocked(createMCPServerInstructions).mockResolvedValue(mockInstructions)

			const result = await fetchInstructions("create_mcp_server", {
				mcpHub: mockMcpHub,
				diffStrategy: mockDiffStrategy,
				// enableMcpServerCreation is undefined
			})

			expect(result).toBe(mockInstructions)
			expect(createMCPServerInstructions).toHaveBeenCalledWith(mockMcpHub, mockDiffStrategy)
		})

		it("should return disabled message when enableMcpServerCreation is false", async () => {
			const result = await fetchInstructions("create_mcp_server", {
				mcpHub: mockMcpHub,
				diffStrategy: mockDiffStrategy,
				enableMcpServerCreation: false,
			})

			expect(result).toBe(
				"MCP server creation is currently disabled. This feature can be enabled in the settings.",
			)
			expect(createMCPServerInstructions).not.toHaveBeenCalled()
		})
	})

	describe("create_mode", () => {
		it("should return mode creation instructions", async () => {
			const mockInstructions = "Mode creation instructions"
			vi.mocked(createModeInstructions).mockResolvedValue(mockInstructions)

			const result = await fetchInstructions("create_mode", {
				context: mockContext,
			})

			expect(result).toBe(mockInstructions)
			expect(createModeInstructions).toHaveBeenCalledWith(mockContext)
		})

		it("should not be affected by enableMcpServerCreation setting", async () => {
			const mockInstructions = "Mode creation instructions"
			vi.mocked(createModeInstructions).mockResolvedValue(mockInstructions)

			const result = await fetchInstructions("create_mode", {
				context: mockContext,
				enableMcpServerCreation: false,
			})

			expect(result).toBe(mockInstructions)
			expect(createModeInstructions).toHaveBeenCalledWith(mockContext)
		})
	})

	describe("unknown task", () => {
		it("should return empty string for unknown task", async () => {
			const result = await fetchInstructions("unknown_task", {
				mcpHub: mockMcpHub,
				diffStrategy: mockDiffStrategy,
			})

			expect(result).toBe("")
			expect(createMCPServerInstructions).not.toHaveBeenCalled()
			expect(createModeInstructions).not.toHaveBeenCalled()
		})
	})
})
