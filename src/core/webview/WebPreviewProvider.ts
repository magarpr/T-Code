import * as vscode from "vscode"
import * as path from "path"
import { EventEmitter } from "events"

import { Package } from "../../shared/package"
import { ExtensionMessage } from "../../shared/ExtensionMessage"
import { WebviewMessage } from "../../shared/WebviewMessage"
import { ClineProvider } from "./ClineProvider"
import { ContextProxy } from "../config/ContextProxy"
import { getNonce } from "./getNonce"
import { getUri } from "./getUri"

export interface WebPreviewElement {
	html: string
	css: string
	xpath: string
	selector: string
	position: {
		x: number
		y: number
		width: number
		height: number
	}
	computedStyles?: Record<string, string>
	attributes?: Record<string, string>
}

export type WebPreviewProviderEvents = {
	elementSelected: [element: WebPreviewElement]
}

export class WebPreviewProvider extends EventEmitter<WebPreviewProviderEvents> implements vscode.WebviewViewProvider {
	public static readonly viewId = `${Package.name}.WebPreviewProvider`
	private view?: vscode.WebviewView | vscode.WebviewPanel
	private disposables: vscode.Disposable[] = []
	private webviewDisposables: vscode.Disposable[] = []
	private currentUrl?: string
	private selectedElement?: WebPreviewElement

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
		private readonly contextProxy: ContextProxy,
		private readonly clineProvider: ClineProvider,
	) {
		super()
		this.log("WebPreviewProvider instantiated")
	}

	async resolveWebviewView(webviewView: vscode.WebviewView | vscode.WebviewPanel) {
		this.log("Resolving web preview view")
		this.view = webviewView

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.contextProxy.extensionUri],
		}

		webviewView.webview.html = this.getHtmlContent(webviewView.webview)
		this.setWebviewMessageListener(webviewView.webview)

		// Listen for visibility changes
		if ("onDidChangeViewState" in webviewView) {
			const viewStateDisposable = webviewView.onDidChangeViewState(() => {
				if (this.view?.visible) {
					this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
				}
			})
			this.webviewDisposables.push(viewStateDisposable)
		} else if ("onDidChangeVisibility" in webviewView) {
			const visibilityDisposable = webviewView.onDidChangeVisibility(() => {
				if (this.view?.visible) {
					this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
				}
			})
			this.webviewDisposables.push(visibilityDisposable)
		}

		// Handle disposal
		webviewView.onDidDispose(
			async () => {
				this.clearWebviewResources()
			},
			null,
			this.disposables,
		)

		this.log("Web preview view resolved")
	}

	private clearWebviewResources() {
		while (this.webviewDisposables.length) {
			const x = this.webviewDisposables.pop()
			if (x) {
				x.dispose()
			}
		}
	}

	async dispose() {
		this.log("Disposing WebPreviewProvider...")

		if (this.view && "dispose" in this.view) {
			this.view.dispose()
			this.log("Disposed webview")
		}

		this.clearWebviewResources()

		while (this.disposables.length) {
			const x = this.disposables.pop()
			if (x) {
				x.dispose()
			}
		}

		this.log("Disposed all disposables")
	}

	public async postMessageToWebview(message: ExtensionMessage) {
		await this.view?.webview.postMessage(message)
	}

	private setWebviewMessageListener(webview: vscode.Webview) {
		const onReceiveMessage = async (message: WebviewMessage) => {
			switch (message.type) {
				case "webPreviewReady":
					this.log("Web preview ready")
					// Send initial configuration
					await this.postMessageToWebview({
						type: "webPreviewConfig",
						config: {
							defaultUrl: "http://localhost:3000",
							enableDeviceSimulation: true,
						},
					})
					break

				case "webPreviewNavigate":
					if (message.url) {
						this.currentUrl = message.url
						this.log(`Navigating to: ${message.url}`)
					}
					break

				case "webPreviewElementSelected":
					if (message.element) {
						this.selectedElement = message.element as WebPreviewElement
						this.emit("elementSelected", this.selectedElement)

						// Send element context to Cline
						await this.sendElementContextToCline(this.selectedElement)
					}
					break

				case "webPreviewError":
					this.log(`Web preview error: ${message.error}`)
					vscode.window.showErrorMessage(`Web Preview Error: ${message.error}`)
					break
			}
		}

		const messageDisposable = webview.onDidReceiveMessage(onReceiveMessage)
		this.webviewDisposables.push(messageDisposable)
	}

	private async sendElementContextToCline(element: WebPreviewElement) {
		// Format element context for AI
		const context = this.formatElementContext(element)

		// Send to Cline provider
		await this.clineProvider.postMessageToWebview({
			type: "webPreviewElementContext",
			context,
		})
	}

	private formatElementContext(element: WebPreviewElement): string {
		let context = "Selected Element Context:\n\n"

		// HTML structure
		context += `HTML:\n${element.html}\n\n`

		// CSS selector
		context += `CSS Selector: ${element.selector}\n`
		context += `XPath: ${element.xpath}\n\n`

		// Position
		context += `Position: ${element.position.x}px, ${element.position.y}px\n`
		context += `Size: ${element.position.width}px × ${element.position.height}px\n\n`

		// Computed styles (if available)
		if (element.computedStyles) {
			context += "Key Styles:\n"
			const importantStyles = ["display", "position", "width", "height", "color", "background-color", "font-size"]
			for (const style of importantStyles) {
				if (element.computedStyles[style]) {
					context += `  ${style}: ${element.computedStyles[style]}\n`
				}
			}
			context += "\n"
		}

		// Attributes
		if (element.attributes) {
			context += "Attributes:\n"
			for (const [key, value] of Object.entries(element.attributes)) {
				context += `  ${key}: ${value}\n`
			}
		}

		return context
	}

	private getHtmlContent(webview: vscode.Webview): string {
		const scriptUri = getUri(webview, this.contextProxy.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"webPreview.js",
		])
		const stylesUri = getUri(webview, this.contextProxy.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"index.css",
		])
		const codiconsUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "codicons", "codicon.css"])

		const nonce = getNonce()

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: http: data:; media-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}'; frame-src https: http:; connect-src https: http: ws: wss:;">
				<link rel="stylesheet" type="text/css" href="${stylesUri}">
				<link href="${codiconsUri}" rel="stylesheet" />
				<title>Web Preview</title>
			</head>
			<body>
				<div id="root"></div>
				<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
			</body>
			</html>
		`
	}

	public async navigateToUrl(url: string) {
		this.currentUrl = url
		await this.postMessageToWebview({
			type: "webPreviewNavigate",
			url,
		})
	}

	public async setDeviceMode(device: string) {
		await this.postMessageToWebview({
			type: "webPreviewSetDevice",
			device,
		})
	}

	public getSelectedElement(): WebPreviewElement | undefined {
		return this.selectedElement
	}

	private log(message: string) {
		this.outputChannel.appendLine(`[WebPreview] ${message}`)
		console.log(`[WebPreview] ${message}`)
	}
}
