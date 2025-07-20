import * as vscode from "vscode"
import { WebPreviewProvider, ElementContext, WebPreviewMessage } from "../core/webview/WebPreviewProvider"
import { ClineProvider } from "../core/webview/ClineProvider"
import { ExtensionMessage } from "../shared/ExtensionMessage"

// Mock dependencies
vitest.mock("vscode")
vitest.mock("../core/webview/getNonce", () => ({
	getNonce: vitest.fn().mockReturnValue("test-nonce"),
}))
vitest.mock("../core/webview/getUri", () => ({
	getUri: vitest.fn().mockReturnValue("test-uri"),
}))

describe("WebPreviewProvider", () => {
	let mockContext: vscode.ExtensionContext
	let mockOutputChannel: vscode.OutputChannel
	let mockWebview: vscode.Webview
	let mockWebviewView: vscode.WebviewView
	let mockClineProvider: ClineProvider
	let provider: WebPreviewProvider

	beforeEach(() => {
		vitest.clearAllMocks()

		// Mock output channel
		mockOutputChannel = {
			appendLine: vitest.fn(),
			append: vitest.fn(),
			clear: vitest.fn(),
			show: vitest.fn(),
			hide: vitest.fn(),
			dispose: vitest.fn(),
		} as unknown as vscode.OutputChannel

		// Mock extension context
		mockContext = {
			extensionUri: { fsPath: "/mock/extension" },
			subscriptions: [],
		} as unknown as vscode.ExtensionContext

		// Mock webview
		mockWebview = {
			options: {},
			html: "",
			postMessage: vitest.fn().mockResolvedValue(undefined),
			onDidReceiveMessage: vitest.fn().mockReturnValue({ dispose: vitest.fn() }),
			cspSource: "test-csp-source",
		} as unknown as vscode.Webview

		// Mock webview view
		mockWebviewView = {
			webview: mockWebview,
			onDidDispose: vitest.fn().mockReturnValue({ dispose: vitest.fn() }),
		} as unknown as vscode.WebviewView

		// Mock ClineProvider
		mockClineProvider = {
			postMessageToWebview: vitest.fn().mockResolvedValue(undefined),
		} as unknown as ClineProvider

		// Create provider instance
		provider = new WebPreviewProvider(mockContext, mockOutputChannel)
	})

	describe("resolveWebviewView", () => {
		it("should set up webview with correct options", async () => {
			await provider.resolveWebviewView(mockWebviewView, {} as any, {} as any)

			expect(mockWebview.options).toEqual({
				enableScripts: true,
				localResourceRoots: [mockContext.extensionUri],
			})
		})

		it("should set HTML content with preview controls", async () => {
			await provider.resolveWebviewView(mockWebviewView, {} as any, {} as any)

			expect(mockWebview.html).toContain("urlInput")
			expect(mockWebview.html).toContain("deviceSelector")
			expect(mockWebview.html).toContain("toggleInspector")
			expect(mockWebview.html).toContain("preview")
		})

		it("should register message handler", async () => {
			await provider.resolveWebviewView(mockWebviewView, {} as any, {} as any)

			expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled()
		})
	})

	describe("handleWebviewMessage", () => {
		beforeEach(async () => {
			provider.setClineProvider(mockClineProvider)
			await provider.resolveWebviewView(mockWebviewView, {} as any, {} as any)
		})

		it("should handle elementSelected message", async () => {
			const elementContext: ElementContext = {
				html: "<div>Test</div>",
				css: ".test { color: red; }",
				position: { x: 10, y: 20, width: 100, height: 50 },
				selector: ".test",
				xpath: "//div[@class='test']",
			}

			const message: WebPreviewMessage = {
				type: "elementSelected",
				elementContext,
			}

			// Get the message handler
			const messageHandler = vitest.mocked(mockWebview.onDidReceiveMessage).mock.calls[0][0]
			await messageHandler(message)

			// Verify ClineProvider was called with formatted message
			expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "webPreviewElementSelected",
					text: expect.stringContaining("Selected element context"),
					elementContext,
				}),
			)
		})

		it("should handle urlChanged message", async () => {
			const message: WebPreviewMessage = {
				type: "urlChanged",
				url: "https://example.com",
			}

			const messageHandler = vitest.mocked(mockWebview.onDidReceiveMessage).mock.calls[0][0]
			await messageHandler(message)

			// Verify URL was stored
			expect(provider["currentUrl"]).toBe("https://example.com")
		})

		it("should handle error message", async () => {
			const message: WebPreviewMessage = {
				type: "error",
				error: "Test error",
			}

			const messageHandler = vitest.mocked(mockWebview.onDidReceiveMessage).mock.calls[0][0]
			await messageHandler(message)

			// Verify error was logged
			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith("Web Preview Error: Test error")
		})

		it("should handle previewReady message", async () => {
			const message: WebPreviewMessage = {
				type: "previewReady",
			}

			const messageHandler = vitest.mocked(mockWebview.onDidReceiveMessage).mock.calls[0][0]
			await messageHandler(message)

			// Verify ready message was logged
			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith("Web preview ready")
		})
	})

	describe("formatElementContext", () => {
		it("should format element context correctly", () => {
			const context: ElementContext = {
				html: "<div>Test</div>",
				css: ".test { color: red; }",
				position: { x: 10, y: 20, width: 100, height: 50 },
				selector: ".test",
				xpath: "//div[@class='test']",
			}

			const formatted = provider["formatElementContext"](context)

			expect(formatted).toContain("HTML:")
			expect(formatted).toContain("<div>Test</div>")
			expect(formatted).toContain("CSS:")
			expect(formatted).toContain(".test { color: red; }")
			expect(formatted).toContain("Position: 10, 20 (100x50)")
			expect(formatted).toContain("CSS Selector: .test")
			expect(formatted).toContain("XPath: //div[@class='test']")
		})

		it("should handle missing optional fields", () => {
			const context: ElementContext = {
				html: "<div>Test</div>",
				css: "",
				position: { x: 0, y: 0, width: 0, height: 0 },
			}

			const formatted = provider["formatElementContext"](context)

			expect(formatted).toContain("HTML:")
			expect(formatted).not.toContain("CSS Selector:")
			expect(formatted).not.toContain("XPath:")
		})
	})

	describe("loadUrl", () => {
		it("should post loadUrl message to webview", async () => {
			await provider.resolveWebviewView(mockWebviewView, {} as any, {} as any)
			await provider.loadUrl("https://example.com")

			expect(mockWebview.postMessage).toHaveBeenCalledWith({
				type: "loadUrl",
				url: "https://example.com",
			})
		})

		it("should not post message if view is not initialized", async () => {
			await provider.loadUrl("https://example.com")

			expect(mockWebview.postMessage).not.toHaveBeenCalled()
		})
	})

	describe("setViewport", () => {
		it("should post setViewport message to webview", async () => {
			await provider.resolveWebviewView(mockWebviewView, {} as any, {} as any)
			await provider.setViewport(1024, 768)

			expect(mockWebview.postMessage).toHaveBeenCalledWith({
				type: "setViewport",
				width: 1024,
				height: 768,
			})
		})

		it("should not post message if view is not initialized", async () => {
			await provider.setViewport(1024, 768)

			expect(mockWebview.postMessage).not.toHaveBeenCalled()
		})
	})

	describe("getSelectedElementContext", () => {
		it("should return stored element context", async () => {
			const elementContext: ElementContext = {
				html: "<div>Test</div>",
				css: ".test { color: red; }",
				position: { x: 10, y: 20, width: 100, height: 50 },
			}

			provider["selectedElementContext"] = elementContext

			expect(provider.getSelectedElementContext()).toEqual(elementContext)
		})

		it("should return undefined if no context is stored", () => {
			expect(provider.getSelectedElementContext()).toBeUndefined()
		})
	})

	describe("getInstance", () => {
		it("should return the singleton instance", () => {
			const instance = WebPreviewProvider.getInstance()
			expect(instance).toBe(provider)
		})

		it("should return undefined if no instance exists", () => {
			// Create new provider without storing as singleton
			const newProvider = new WebPreviewProvider(mockContext, mockOutputChannel)
			newProvider.dispose()

			expect(WebPreviewProvider.getInstance()).toBeUndefined()
		})
	})

	describe("dispose", () => {
		it("should clean up resources", async () => {
			await provider.resolveWebviewView(mockWebviewView, {} as any, {} as any)

			const disposeSpy = vitest.fn()
			provider["disposables"].push({ dispose: disposeSpy })

			provider.dispose()

			expect(disposeSpy).toHaveBeenCalled()
			expect(provider["view"]).toBeUndefined()
			expect(WebPreviewProvider.getInstance()).toBeUndefined()
		})
	})
})
