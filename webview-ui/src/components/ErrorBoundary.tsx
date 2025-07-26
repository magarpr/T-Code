import React, { Component } from "react"
import { telemetryClient } from "@src/utils/TelemetryClient"
import { withTranslation, WithTranslation } from "react-i18next"
import { enhanceErrorWithSourceMaps } from "@src/utils/sourceMapUtils"
import { vscode } from "@src/utils/vscode"

type ErrorProps = {
	children: React.ReactNode
} & WithTranslation

type ErrorState = {
	error?: string
	componentStack?: string | null
	timestamp?: number
	isRecovering?: boolean
}

class ErrorBoundary extends Component<ErrorProps, ErrorState> {
	constructor(props: ErrorProps) {
		super(props)
		this.state = {
			isRecovering: false,
		}
	}

	static getDerivedStateFromError(error: unknown) {
		let errorMessage = ""

		if (error instanceof Error) {
			errorMessage = error.stack ?? error.message
		} else {
			errorMessage = `${error}`
		}

		return {
			error: errorMessage,
			timestamp: Date.now(),
		}
	}

	async componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		const componentStack = errorInfo.componentStack || ""
		const enhancedError = await enhanceErrorWithSourceMaps(error, componentStack)

		telemetryClient.capture("error_boundary_caught_error", {
			error: enhancedError.message,
			stack: enhancedError.sourceMappedStack || enhancedError.stack,
			componentStack: enhancedError.sourceMappedComponentStack || componentStack,
			timestamp: Date.now(),
			errorType: enhancedError.name,
		})

		this.setState({
			error: enhancedError.sourceMappedStack || enhancedError.stack,
			componentStack: enhancedError.sourceMappedComponentStack || componentStack,
		})
	}

	handleRestart = () => {
		this.setState({ isRecovering: true })
		vscode.postMessage({ type: "reloadWindow" })
	}

	handleReportIssue = () => {
		const errorInfo = encodeURIComponent(
			`
**Error:** ${this.state.error || "Unknown error"}
**Timestamp:** ${new Date(this.state.timestamp || Date.now()).toISOString()}
**Version:** ${process.env.PKG_VERSION || "unknown"}
**Platform:** ${navigator.platform}
**User Agent:** ${navigator.userAgent}

**Component Stack:**
\`\`\`
${this.state.componentStack || "Not available"}
\`\`\`
		`.trim(),
		)

		const issueUrl = `https://github.com/RooCodeInc/Roo-Code/issues/new?title=Crash%20Report&body=${errorInfo}`
		window.open(issueUrl, "_blank")
	}

	render() {
		const { t } = this.props

		if (!this.state.error) {
			return this.props.children
		}

		const errorDisplay = this.state.error
		const componentStackDisplay = this.state.componentStack
		const version = process.env.PKG_VERSION || "unknown"
		const isWindows = navigator.platform.toLowerCase().includes("win")

		return (
			<div className="p-4">
				<div className="mb-4 p-4 bg-vscode-editorWidget-background border border-vscode-editorWidget-border rounded">
					<h2 className="text-lg font-bold mt-0 mb-2 text-vscode-errorForeground">
						{t("errorBoundary.title")} (v{version})
					</h2>

					{isWindows && (
						<div className="mb-3 p-2 bg-vscode-inputValidation-warningBackground border border-vscode-inputValidation-warningBorder rounded text-sm">
							<span className="codicon codicon-warning mr-2"></span>
							{t(
								"errorBoundary.windowsNote",
								"This crash occurred on Windows. Your work has been automatically saved.",
							)}
						</div>
					)}

					<p className="mb-4">
						{t(
							"errorBoundary.crashRecoveryText",
							"Don't worry! Your work has been saved and can be recovered.",
						)}
					</p>

					<div className="flex gap-2 mb-4">
						<button
							className="px-4 py-2 bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground rounded"
							onClick={this.handleRestart}
							disabled={this.state.isRecovering}>
							{this.state.isRecovering ? (
								<>
									<span className="codicon codicon-loading codicon-modifier-spin mr-2"></span>
									{t("errorBoundary.restarting", "Restarting...")}
								</>
							) : (
								<>
									<span className="codicon codicon-debug-restart mr-2"></span>
									{t("errorBoundary.restartVSCode", "Restart VS Code")}
								</>
							)}
						</button>

						<button
							className="px-4 py-2 bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground hover:bg-vscode-button-secondaryHoverBackground rounded"
							onClick={this.handleReportIssue}>
							<span className="codicon codicon-github mr-2"></span>
							{t("errorBoundary.reportIssue", "Report Issue")}
						</button>
					</div>
				</div>

				<details className="mb-4">
					<summary className="cursor-pointer font-bold mb-2">
						{t("errorBoundary.technicalDetails", "Technical Details")}
					</summary>

					<div className="mt-2">
						<p className="mb-2">{t("errorBoundary.copyInstructions")}</p>

						<div className="mb-4">
							<h3 className="text-md font-bold mb-1">{t("errorBoundary.errorStack")}</h3>
							<pre className="p-2 border rounded text-sm overflow-auto max-h-64">{errorDisplay}</pre>
						</div>

						{componentStackDisplay && (
							<div>
								<h3 className="text-md font-bold mb-1">{t("errorBoundary.componentStack")}</h3>
								<pre className="p-2 border rounded text-sm overflow-auto max-h-64">
									{componentStackDisplay}
								</pre>
							</div>
						)}
					</div>
				</details>

				<div className="text-sm text-vscode-descriptionForeground">
					<p>
						{t("errorBoundary.helpText", "If the problem persists, please")}{" "}
						<a
							href="https://github.com/RooCodeInc/Roo-Code/issues"
							target="_blank"
							rel="noreferrer"
							className="text-vscode-textLink-foreground hover:text-vscode-textLink-activeForeground underline">
							{t("errorBoundary.githubText")}
						</a>
					</p>
				</div>
			</div>
		)
	}
}

export default withTranslation("common")(ErrorBoundary)
