import * as vscode from "vscode"
import * as path from "path"
import { getNonce } from "./getNonce"
import { getUri } from "./getUri"
import { ClineProvider } from "./ClineProvider"
import { ExtensionMessage } from "../../shared/ExtensionMessage"
import { WebviewMessage } from "../../shared/WebviewMessage"

export interface ElementContext {
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

export interface PreviewState {
	url?: string
	isLoading: boolean
	selectedElement?: ElementContext
	viewportSize: { width: number; height: number }
	deviceMode: "desktop" | "tablet" | "mobile" | "custom"
}

export class WebPreviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewId = "roo-code.webPreview"
	private _view?: vscode.WebviewView
	private _extensionUri: vscode.Uri
	private _clineProvider?: ClineProvider
	private _state: PreviewState = {
		isLoading: false,
		viewportSize: { width: 1200, height: 800 },
		deviceMode: "desktop",
	}

	// Common device presets
	private readonly devicePresets = {
		desktop: { width: 1200, height: 800, name: "Desktop" },
		tablet: { width: 768, height: 1024, name: "Tablet" },
		mobile: { width: 375, height: 667, name: "Mobile" },
	}

	constructor(private readonly _context: vscode.ExtensionContext) {
		this._extensionUri = _context.extensionUri
	}

	public setClineProvider(provider: ClineProvider) {
		this._clineProvider = provider
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		}

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
			switch (message.type) {
				case "elementSelected":
					await this._handleElementSelection(message.elementContext)
					break
				case "navigateToUrl":
					await this._handleNavigation(message.url!)
					break
				case "setViewportSize":
					this._handleViewportResize(message.width!, message.height!)
					break
				case "setDeviceMode":
					this._handleDeviceModeChange(message.deviceMode as PreviewState["deviceMode"])
					break
				case "refreshPreview":
					await this._refreshPreview()
					break
			}
		})

		// Handle visibility changes
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				this._updateWebview()
			}
		})

		// Handle disposal
		webviewView.onDidDispose(() => {
			this._view = undefined
		})
	}

	private async _handleElementSelection(elementContext: ElementContext) {
		this._state.selectedElement = elementContext

		// Send element context to Cline
		if (this._clineProvider) {
			const contextMessage = this._formatElementContext(elementContext)
			await this._clineProvider.postMessageToWebview({
				type: "webPreviewElementSelected",
				elementContext: contextMessage,
			})
		}

		this._updateWebview()
	}

	private _formatElementContext(context: ElementContext): string {
		const lines = [
			"Selected Element Context:",
			`- HTML: ${context.html}`,
			`- CSS Selector: ${context.selector}`,
			`- XPath: ${context.xpath}`,
			`- Position: ${context.position.x}x${context.position.y} (${context.position.width}x${context.position.height})`,
		]

		if (context.attributes && Object.keys(context.attributes).length > 0) {
			lines.push(`- Attributes: ${JSON.stringify(context.attributes, null, 2)}`)
		}

		if (context.computedStyles && Object.keys(context.computedStyles).length > 0) {
			const importantStyles = ["display", "position", "width", "height", "color", "background-color", "font-size"]
			const styles = importantStyles
				.filter((style) => context.computedStyles![style])
				.map((style) => `${style}: ${context.computedStyles![style]}`)
			if (styles.length > 0) {
				lines.push(`- Key Styles: ${styles.join(", ")}`)
			}
		}

		return lines.join("\n")
	}

	private async _handleNavigation(url: string) {
		this._state.url = url
		this._state.isLoading = true
		this._updateWebview()

		// Simulate loading completion after a delay
		setTimeout(() => {
			this._state.isLoading = false
			this._updateWebview()
		}, 1000)
	}

	private _handleViewportResize(width: number, height: number) {
		this._state.viewportSize = { width, height }
		this._state.deviceMode = "custom"
		this._updateWebview()
	}

	private _handleDeviceModeChange(mode: PreviewState["deviceMode"]) {
		this._state.deviceMode = mode
		if (mode !== "custom" && this.devicePresets[mode]) {
			const preset = this.devicePresets[mode]
			this._state.viewportSize = { width: preset.width, height: preset.height }
		}
		this._updateWebview()
	}

	private async _refreshPreview() {
		if (this._state.url) {
			await this._handleNavigation(this._state.url)
		}
	}

	private _updateWebview() {
		if (this._view) {
			this._view.webview.postMessage({
				type: "updateState",
				state: this._state,
			})
		}
	}

	public async openUrl(url: string) {
		this._state.url = url
		await this._handleNavigation(url)

		// Show the preview panel
		if (this._view) {
			this._view.show(true)
		}
	}

	public getSelectedElementContext(): ElementContext | undefined {
		return this._state.selectedElement
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = getUri(webview, this._extensionUri, ["webview-ui", "build", "assets", "webPreview.js"])
		const styleUri = getUri(webview, this._extensionUri, ["webview-ui", "build", "assets", "index.css"])
		const codiconsUri = getUri(webview, this._extensionUri, ["assets", "codicons", "codicon.css"])
		const nonce = getNonce()

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none';
					style-src ${webview.cspSource} 'unsafe-inline';
					script-src 'nonce-${nonce}';
					font-src ${webview.cspSource};
					frame-src http: https: file:;
					img-src ${webview.cspSource} https: http: data:;
					connect-src http: https: ws: wss:;">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleUri}" rel="stylesheet">
				<link href="${codiconsUri}" rel="stylesheet">
				<title>Web Preview</title>
			</head>
			<body>
				<div id="root"></div>
				<script nonce="${nonce}">
					const vscode = acquireVsCodeApi();
					window.vscode = vscode;
				</script>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`
	}
}
