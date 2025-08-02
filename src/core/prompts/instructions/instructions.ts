import { createMCPServerInstructions } from "./create-mcp-server"
import { createModeInstructions } from "./create-mode"
import { McpHub } from "../../../services/mcp/McpHub"
import { DiffStrategy } from "../../../shared/tools"
import * as vscode from "vscode"

interface InstructionsDetail {
	mcpHub?: McpHub
	diffStrategy?: DiffStrategy
	context?: vscode.ExtensionContext
	enableMcpServerCreation?: boolean
}

export async function fetchInstructions(text: string, detail: InstructionsDetail): Promise<string> {
	switch (text) {
		case "create_mcp_server": {
			// Check if MCP server creation is enabled
			if (detail.enableMcpServerCreation === false) {
				return "MCP server creation is currently disabled. This feature can be enabled in the settings."
			}
			return await createMCPServerInstructions(detail.mcpHub, detail.diffStrategy)
		}
		case "create_mode": {
			return await createModeInstructions(detail.context)
		}
		default: {
			return ""
		}
	}
}
