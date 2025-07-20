import * as vscode from "vscode"
import * as path from "path"
import { getNonce } from "./getNonce"
import { getUri } from "./getUri"
import { ClineProvider } from "./ClineProvider"
import { ExtensionMessage } from "../../shared/ExtensionMessage"

export interface ElementContext {
	html: string
	css: string
	position: {
		x: number
		y: number
		width: number
		height: number
	}
	computedStyles?: Record<string, string>
	attributes?: Record<string, string>
	xpath?: string
	selector?: string
}

export interface WebPreviewMessage {
	type: "elementSelected" | "previewReady" | "error" | "urlChanged" | "viewportChanged"
	elementContext?: ElementContext
	url?: string
	viewport?: { width: number; height: number }
	error?: string
}

export class WebPreviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewId = "roo-code.webPreview"
	private static instance?: WebPreviewProvider

	private view?: vscode.WebviewView
	private disposables: vscode.Disposable[] = []
	private currentUrl?: string
	private selectedElementContext?: ElementContext
	private clineProvider?: ClineProvider

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
	) {
		WebPreviewProvider.instance = this
	}

	public static getInstance(): WebPreviewProvider | undefined {
		return WebPreviewProvider.instance
	}

	public setClineProvider(provider: ClineProvider) {
		this.clineProvider = provider
	}

	public async resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this.view = webviewView

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		}

		webviewView.webview.html = this.getHtmlContent(webviewView.webview)

		// Set up message listener
		const messageDisposable = webviewView.webview.onDidReceiveMessage(async (message: WebPreviewMessage) => {
			await this.handleWebviewMessage(message)
		})
		this.disposables.push(messageDisposable)

		// Handle view disposal
		webviewView.onDidDispose(
			() => {
				this.dispose()
			},
			null,
			this.disposables,
		)
	}

	private async handleWebviewMessage(message: WebPreviewMessage) {
		switch (message.type) {
			case "elementSelected":
				if (message.elementContext) {
					this.selectedElementContext = message.elementContext
					await this.sendElementContextToCline(message.elementContext)
				}
				break
			case "urlChanged":
				this.currentUrl = message.url
				break
			case "viewportChanged":
				// Handle viewport changes if needed
				break
			case "error":
				this.outputChannel.appendLine(`Web Preview Error: ${message.error}`)
				break
			case "previewReady":
				this.outputChannel.appendLine("Web preview ready")
				break
		}
	}

	private async sendElementContextToCline(context: ElementContext) {
		if (!this.clineProvider) {
			return
		}

		// Format the element context for the AI
		const contextMessage = this.formatElementContext(context)

		// Send to Cline's chat
		await this.clineProvider.postMessageToWebview({
			type: "webPreviewElementSelected",
			text: contextMessage,
			elementContext: context,
		} as ExtensionMessage)
	}

	private formatElementContext(context: ElementContext): string {
		let message = "Selected element context:\n\n"

		message += `HTML:\n\`\`\`html\n${context.html}\n\`\`\`\n\n`

		if (context.css) {
			message += `CSS:\n\`\`\`css\n${context.css}\n\`\`\`\n\n`
		}

		message += `Position: ${context.position.x}, ${context.position.y} (${context.position.width}x${context.position.height})\n`

		if (context.selector) {
			message += `CSS Selector: ${context.selector}\n`
		}

		if (context.xpath) {
			message += `XPath: ${context.xpath}\n`
		}

		return message
	}

	public async loadUrl(url: string) {
		if (!this.view) {
			return
		}

		this.currentUrl = url
		await this.view.webview.postMessage({
			type: "loadUrl",
			url,
		})
	}

	public async setViewport(width: number, height: number) {
		if (!this.view) {
			return
		}

		await this.view.webview.postMessage({
			type: "setViewport",
			width,
			height,
		})
	}

	public getSelectedElementContext(): ElementContext | undefined {
		return this.selectedElementContext
	}

	private getHtmlContent(webview: vscode.Webview): string {
		const scriptUri = getUri(webview, this.context.extensionUri, [
			"src",
			"core",
			"webview",
			"preview",
			"preview.js",
		])
		const stylesUri = getUri(webview, this.context.extensionUri, [
			"src",
			"core",
			"webview",
			"preview",
			"preview.css",
		])
		const nonce = getNonce()

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http: https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: http: data:;">
	<link href="${stylesUri}" rel="stylesheet">
	<title>Web Preview</title>
</head>
<body>
	<div id="controls">
		<input type="text" id="urlInput" placeholder="Enter URL..." />
		<button id="goButton">Go</button>
		<select id="deviceSelector">
			<option value="responsive">Responsive</option>
			<option value="375x667">iPhone SE</option>
			<option value="390x844">iPhone 12/13</option>
			<option value="768x1024">iPad</option>
			<option value="1280x800">Desktop</option>
			<option value="1920x1080">Full HD</option>
		</select>
		<button id="toggleInspector">🎯 Select Element</button>
	</div>
	<div id="previewContainer">
		<iframe id="preview" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
		<div id="elementOverlay" style="display: none;"></div>
	</div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
	}

	public dispose() {
		WebPreviewProvider.instance = undefined
		while (this.disposables.length) {
			const disposable = this.disposables.pop()
			if (disposable) {
				disposable.dispose()
			}
		}
		this.view = undefined
	}
}
