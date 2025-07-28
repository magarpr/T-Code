import React, { Component, ReactNode } from "react"

interface Props {
	children: ReactNode
	onError?: () => void
}

interface State {
	hasError: boolean
}

export class DialogErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props)
		this.state = { hasError: false }
	}

	static getDerivedStateFromError(): State {
		return { hasError: true }
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		console.error("Dialog error:", error, errorInfo)
		// Call the onError callback if provided
		this.props.onError?.()
	}

	render() {
		if (this.state.hasError) {
			// Return null to close the dialog content and prevent grey screen
			return null
		}

		return this.props.children
	}
}
