// npx vitest core/webview/__tests__/WebPreviewProvider.spec.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { WebPreviewProvider } from "../WebPreviewProvider"
import { EventEmitter } from "events"

// Mock vscode module
vi.mock("vscode", () => ({
	window: {
		createWebviewPanel: vi.fn(),
		showErrorMessage: vi.fn(),
		showInformationMessage: vi.fn(),
	},
	ViewColumn: {
		Two: 2,
	},
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path })),
		joinPath: vi.fn((uri: any, ...paths: string[]) => ({
			fsPath: [uri.fsPath, ...paths].join("/"),
		})),
	},
	Webview: vi.fn(),
	WebviewPanel: vi.fn(),
	WebviewView: vi.fn(),
	EventEmitter: vi.fn(() => ({
		fire: vi.fn(),
		event: vi.fn(),
	})),
	Disposable: {
		from: vi.fn(),
	},
}))

// Mock fs module
vi.mock("fs/promises", () => ({
	readFile: vi.fn().mockResolvedValue("<html><body>Test</body></html>"),
}))

// Mock getUri and getNonce
vi.mock("../getUri", () => ({
	getUri: vi.fn((webview: any, extensionUri: any, pathList: string[]) => {
		return `vscode-resource://${pathList.join("/")}`
	}),
}))

vi.mock("../getNonce", () => ({
	getNonce: vi.fn(() => "test-nonce-12345"),
}))

describe("WebPreviewProvider", () => {
	let provider: WebPreviewProvider
	let mockWebview: any
	let mockWebviewView: any
	let mockContext: any
	let mockOutputChannel: any
	let mockContextProxy: any
	let mockClineProvider: any

	beforeEach(() => {
		// Setup mock webview
		mockWebview = {
			html: "",
			options: {},
			onDidReceiveMessage: vi.fn(),
			postMessage: vi.fn(),
			asWebviewUri: vi.fn((uri: any) => uri),
			cspSource: "vscode-resource:",
		}

		// Setup mock webview view
		mockWebviewView = {
			webview: mockWebview,
			onDidDispose: vi.fn(),
			onDidChangeViewState: vi.fn(),
			onDidChangeVisibility: vi.fn(),
			visible: true,
		}

		// Setup mock context
		mockContext = {
			extensionUri: { fsPath: "/test/extension" },
			subscriptions: [],
		}

		// Setup mock output channel
		mockOutputChannel = {
			appendLine: vi.fn(),
		}

		// Setup mock context proxy
		mockContextProxy = {
			extensionUri: { fsPath: "/test/extension" },
		}

		// Setup mock cline provider
		mockClineProvider = {
			postMessageToWebview: vi.fn(),
		}

		// Create provider instance
		provider = new WebPreviewProvider(mockContext, mockOutputChannel, mockContextProxy, mockClineProvider)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("resolveWebviewView", () => {
		it("should set webview options and HTML content", async () => {
			await provider.resolveWebviewView(mockWebviewView)

			expect(mockWebview.options).toEqual({
				enableScripts: true,
				localResourceRoots: [mockContextProxy.extensionUri],
			})
			expect(mockWebview.html).toContain("<!DOCTYPE html>")
			expect(mockWebview.html).toContain('<div id="root"></div>')
			expect(mockWebview.html).toContain("webPreview.js")
		})

		it("should set up message listener", async () => {
			await provider.resolveWebviewView(mockWebviewView)

			expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled()
		})

		it("should set up visibility change listener", async () => {
			await provider.resolveWebviewView(mockWebviewView)

			expect(mockWebviewView.onDidChangeViewState).toHaveBeenCalled()
		})

		it("should set up disposal listener", async () => {
			await provider.resolveWebviewView(mockWebviewView)

			expect(mockWebviewView.onDidDispose).toHaveBeenCalled()
		})
	})

	describe("postMessageToWebview", () => {
		it("should post message to webview when view exists", async () => {
			await provider.resolveWebviewView(mockWebviewView)
			const message = { type: "webPreviewNavigate" as const, url: "https://example.com" }

			await provider.postMessageToWebview(message)

			expect(mockWebview.postMessage).toHaveBeenCalledWith(message)
		})

		it("should not throw when view does not exist", async () => {
			const message = { type: "webPreviewNavigate" as const, url: "https://example.com" }

			await expect(provider.postMessageToWebview(message)).resolves.not.toThrow()
		})
	})

	describe("handleWebviewMessage", () => {
		it("should handle webPreviewReady message", async () => {
			await provider.resolveWebviewView(mockWebviewView)

			// Get the message handler
			const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0]

			// Simulate webPreviewReady message
			await messageHandler({ type: "webPreviewReady" })

			expect(mockWebview.postMessage).toHaveBeenCalledWith({
				type: "webPreviewConfig",
				config: {
					defaultUrl: "http://localhost:3000",
					enableDeviceSimulation: true,
				},
			})
		})

		it("should handle webPreviewNavigate message", async () => {
			await provider.resolveWebviewView(mockWebviewView)

			const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0]
			const url = "https://example.com"

			await messageHandler({ type: "webPreviewNavigate", url })

			// Should log navigation
			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Navigating to: ${url}`))
		})

		it("should handle webPreviewElementSelected message", async () => {
			await provider.resolveWebviewView(mockWebviewView)

			const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0]
			const element = {
				html: "<div>Test</div>",
				css: "",
				selector: "div",
				xpath: "/html/body/div",
				position: { x: 10, y: 20, width: 100, height: 40 },
			}

			// Set up event listener
			let emittedElement: any
			provider.on("elementSelected", (el) => {
				emittedElement = el
			})

			await messageHandler({ type: "webPreviewElementSelected", element })

			// Should emit element selected event
			expect(emittedElement).toEqual(element)

			// Should send to cline provider
			expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "webPreviewElementContext",
				context: expect.stringContaining("Selected Element Context"),
			})
		})

		it("should handle webPreviewError message", async () => {
			await provider.resolveWebviewView(mockWebviewView)

			const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0]
			const error = "Failed to load page"

			await messageHandler({ type: "webPreviewError", error })

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(`Web Preview Error: ${error}`)
		})
	})

	describe("navigateToUrl", () => {
		it("should send navigation message to webview", async () => {
			await provider.resolveWebviewView(mockWebviewView)
			const url = "https://example.com"

			await provider.navigateToUrl(url)

			expect(mockWebview.postMessage).toHaveBeenCalledWith({
				type: "webPreviewNavigate",
				url,
			})
		})
	})

	describe("setDeviceMode", () => {
		it("should send device mode message to webview", async () => {
			await provider.resolveWebviewView(mockWebviewView)
			const device = "iPhone 14"

			await provider.setDeviceMode(device)

			expect(mockWebview.postMessage).toHaveBeenCalledWith({
				type: "webPreviewSetDevice",
				device,
			})
		})
	})

	describe("getSelectedElement", () => {
		it("should return selected element after selection", async () => {
			await provider.resolveWebviewView(mockWebviewView)

			const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0]
			const element = {
				html: "<button>Click me</button>",
				css: "",
				selector: "button",
				xpath: "/html/body/button",
				position: { x: 10, y: 20, width: 100, height: 40 },
			}

			await messageHandler({ type: "webPreviewElementSelected", element })

			const selected = provider.getSelectedElement()
			expect(selected).toEqual(element)
		})

		it("should return undefined when no element selected", () => {
			const selected = provider.getSelectedElement()
			expect(selected).toBeUndefined()
		})
	})

	describe("dispose", () => {
		it("should dispose webview when provider is disposed", async () => {
			// Create a mock panel instead of view for disposal test
			const mockPanel = {
				...mockWebviewView,
				dispose: vi.fn(),
			}

			await provider.resolveWebviewView(mockPanel)

			await provider.dispose()

			expect(mockPanel.dispose).toHaveBeenCalled()
		})

		it("should handle dispose when no view exists", async () => {
			await expect(provider.dispose()).resolves.not.toThrow()
		})
	})

	describe("getHtmlContent", () => {
		it("should generate correct HTML with CSP and nonce", async () => {
			await provider.resolveWebviewView(mockWebviewView)

			const html = mockWebview.html

			expect(html).toContain("<!DOCTYPE html>")
			expect(html).toContain('<div id="root"></div>')
			expect(html).toContain("webPreview.js")
			expect(html).toContain("test-nonce-12345")
			expect(html).toContain("Content-Security-Policy")
			expect(html).toContain("frame-src https: http:")
		})
	})
})
