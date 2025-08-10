import type { ClineProvider } from "../../../core/webview/ClineProvider"
import { McpHub } from "../McpHub"
import { vi, describe, it, expect, beforeEach } from "vitest"
import fs from "fs/promises"

// Minimal VSCode and FS mocks to keep constructor side-effects inert
vi.mock("vscode", () => ({
	workspace: {
		createFileSystemWatcher: vi.fn().mockReturnValue({
			onDidChange: vi.fn(),
			onDidCreate: vi.fn(),
			onDidDelete: vi.fn(),
			dispose: vi.fn(),
		}),
		onDidChangeWorkspaceFolders: vi.fn(),
		workspaceFolders: [],
	},
	window: {
		showErrorMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
	},
	Disposable: {
		from: vi.fn(),
	},
}))

vi.mock("fs/promises", () => ({
	default: {
		access: vi.fn().mockResolvedValue(undefined),
		writeFile: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn().mockResolvedValue("{}"),
		unlink: vi.fn().mockResolvedValue(undefined),
		rename: vi.fn().mockResolvedValue(undefined),
		lstat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
		mkdir: vi.fn().mockResolvedValue(undefined),
	},
	access: vi.fn().mockResolvedValue(undefined),
	writeFile: vi.fn().mockResolvedValue(undefined),
	readFile: vi.fn().mockResolvedValue("{}"),
	unlink: vi.fn().mockResolvedValue(undefined),
	rename: vi.fn().mockResolvedValue(undefined),
	lstat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
	mkdir: vi.fn().mockResolvedValue(undefined),
}))

describe("McpHub transient-retry and readiness", () => {
	let mcpHub: McpHub
	let mockProvider: Partial<ClineProvider>

	beforeEach(() => {
		vi.clearAllMocks()

		// Prevent constructor from kicking off async initialization that races our injected connections
		vi.spyOn(McpHub.prototype as any, "initializeGlobalMcpServers").mockResolvedValue(undefined as any)
		vi.spyOn(McpHub.prototype as any, "initializeProjectMcpServers").mockResolvedValue(undefined as any)

		mockProvider = {
			ensureSettingsDirectoryExists: vi.fn().mockResolvedValue("/mock/settings/path"),
			ensureMcpServersDirectoryExists: vi.fn().mockResolvedValue("/mock/settings/path"),
			postMessageToWebview: vi.fn().mockResolvedValue(undefined),
			getState: vi.fn().mockResolvedValue({ mcpEnabled: true }),
			context: {
				subscriptions: [],
				workspaceState: {} as any,
				globalState: {} as any,
				secrets: {} as any,
				extensionUri: { fsPath: "/test/path" } as any,
				extensionPath: "/test/path",
				asAbsolutePath: (p: string) => p,
				globalStorageUri: { fsPath: "/test/global" } as any,
				globalStoragePath: "/test/global",
				extension: {
					packageJSON: { version: "1.0.0" },
				} as any,
			} as any,
		}

		// Keep global config empty so constructor does not attempt to connect anything
		vi.mocked(fs.readFile).mockResolvedValue("{}")

		mcpHub = new McpHub(mockProvider as ClineProvider)
	})

	it("retries once on transient -32000 'Connection closed' for tools/call", async () => {
		// Prepare a connected connection
		const firstError: any = new Error("Connection closed")
		firstError.code = -32000

		const request = vi
			.fn()
			// First call: throw transient
			.mockRejectedValueOnce(firstError)
			// Second call: succeed
			.mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }] })

		// Inject a connected connection directly
		;(mcpHub as any).connections = [
			{
				type: "connected",
				server: {
					name: "retry-server",
					config: JSON.stringify({ type: "stdio", command: "node", timeout: 60 }),
					status: "connected",
					source: "global",
					errorHistory: [],
				},
				client: { request } as any,
				transport: {} as any,
			},
		]

		const result = await mcpHub.callTool("retry-server", "do_something", { a: 1 })
		expect(result).toBeTruthy()
		expect(request).toHaveBeenCalledTimes(2)
	})

	it("retries once on transient -32000 'Connection closed' for resources/read", async () => {
		const firstError: any = new Error("Connection closed before response")
		firstError.code = -32000

		const request = vi
			.fn()
			.mockRejectedValueOnce(firstError)
			.mockResolvedValueOnce({ contents: [{ type: "text", text: "resource" }] })

		;(mcpHub as any).connections = [
			{
				type: "connected",
				server: {
					name: "retry-server",
					config: JSON.stringify({ type: "stdio", command: "node", timeout: 60 }),
					status: "connected",
					source: "global",
					errorHistory: [],
				},
				client: { request } as any,
				transport: {} as any,
			},
		]

		const result = await mcpHub.readResource("retry-server", "file:///tmp/x.txt")
		expect(result).toBeTruthy()
		expect(request).toHaveBeenCalledTimes(2)
	})

	it("waits for server to become connected before first tool call", async () => {
		// Start 'connecting' and then flip to 'connected' shortly after
		const request = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] })

		const connection: any = {
			type: "connected",
			server: {
				name: "slow-server",
				config: JSON.stringify({ type: "stdio", command: "node", timeout: 60 }),
				status: "connecting",
				source: "global",
				errorHistory: [],
			},
			client: { request },
			transport: {},
		}

		;(mcpHub as any).connections = [connection]

		// Flip status to 'connected' after 100ms
		setTimeout(() => {
			connection.server.status = "connected"
		}, 100)

		const start = Date.now()
		const result = await mcpHub.callTool("slow-server", "ping", {})
		const elapsed = Date.now() - start

		expect(result).toBeTruthy()
		expect(request).toHaveBeenCalledTimes(1)
		// Should have waited at least ~100ms before making the request
		expect(elapsed).toBeGreaterThanOrEqual(90)
	})
})
