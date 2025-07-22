import React, { Component, ErrorInfo, ReactNode } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

interface Props {
	children: ReactNode
	fallback?: ReactNode
}

interface State {
	hasError: boolean
	error: Error | null
	errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props)
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
		}
	}

	static getDerivedStateFromError(error: Error): State {
		// Update state so the next render will show the fallback UI
		return {
			hasError: true,
			error,
			errorInfo: null,
		}
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		// Log error details for debugging
		console.error("ErrorBoundary caught an error:", error, errorInfo)

		// Update state with error details
		this.setState({
			error,
			errorInfo,
		})
	}

	handleReset = () => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
		})
	}

	render() {
		if (this.state.hasError) {
			// Custom fallback UI
			if (this.props.fallback) {
				return this.props.fallback
			}

			// Default error UI
			return (
				<div className="error-boundary-container p-4 m-4 bg-vscode-inputValidation-errorBackground border border-vscode-inputValidation-errorBorder rounded">
					<h2 className="text-lg font-semibold mb-2 text-vscode-errorForeground">Something went wrong</h2>
					<p className="text-vscode-foreground mb-4">
						An unexpected error occurred. The application may continue to work, but some features might be
						affected.
					</p>

					{this.state.error && (
						<details className="mb-4">
							<summary className="cursor-pointer text-vscode-textLink-foreground hover:underline">
								Error details
							</summary>
							<pre className="mt-2 p-2 bg-vscode-editor-background rounded text-xs overflow-auto">
								{this.state.error.message}
								{this.state.error.stack && "\n\n" + this.state.error.stack}
							</pre>
						</details>
					)}

					<div className="flex gap-2">
						<VSCodeButton onClick={this.handleReset}>Try Again</VSCodeButton>
						<VSCodeButton appearance="secondary" onClick={() => window.location.reload()}>
							Reload Window
						</VSCodeButton>
					</div>
				</div>
			)
		}

		return this.props.children
	}
}

// Higher-order component for easier usage
export function withErrorBoundary<P extends object>(
	Component: React.ComponentType<P>,
	fallback?: ReactNode,
): React.ComponentType<P> {
	return (props: P) => (
		<ErrorBoundary fallback={fallback}>
			<Component {...props} />
		</ErrorBoundary>
	)
}
