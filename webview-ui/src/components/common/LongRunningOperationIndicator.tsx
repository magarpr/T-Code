import React, { useEffect, useState } from "react"
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"

interface LongRunningOperationIndicatorProps {
	isRunning: boolean
	operationName?: string
	elapsedTime?: number
	estimatedTime?: number
	showCancel?: boolean
	onCancel?: () => void
}

export const LongRunningOperationIndicator: React.FC<LongRunningOperationIndicatorProps> = ({
	isRunning,
	operationName = "Operation",
	elapsedTime,
	estimatedTime,
	showCancel = true,
	onCancel,
}) => {
	const [seconds, setSeconds] = useState(0)

	useEffect(() => {
		if (!isRunning) {
			setSeconds(0)
			return
		}

		const interval = setInterval(() => {
			setSeconds((prev) => prev + 1)
		}, 1000)

		return () => clearInterval(interval)
	}, [isRunning])

	if (!isRunning) {
		return null
	}

	const formatTime = (totalSeconds: number): string => {
		const minutes = Math.floor(totalSeconds / 60)
		const secs = totalSeconds % 60
		if (minutes > 0) {
			return `${minutes}m ${secs}s`
		}
		return `${secs}s`
	}

	const displayTime = elapsedTime !== undefined ? elapsedTime : seconds

	return (
		<div className="long-running-operation-indicator flex items-center gap-3 p-3 my-2 bg-vscode-editor-background border border-vscode-panel-border rounded">
			<VSCodeProgressRing />
			<div className="flex-1">
				<div className="text-vscode-foreground font-medium">{operationName} in progress...</div>
				<div className="text-vscode-descriptionForeground text-sm mt-1">
					Elapsed: {formatTime(displayTime)}
					{estimatedTime && <span className="ml-3">Estimated: {formatTime(estimatedTime)}</span>}
				</div>
			</div>
			{showCancel && onCancel && (
				<button
					onClick={onCancel}
					className="px-3 py-1 text-sm bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground rounded"
					aria-label="Cancel operation">
					Cancel
				</button>
			)}
		</div>
	)
}

// Hook to track long-running operations
export const useLongRunningOperation = (threshold: number = 3000) => {
	const [isLongRunning, setIsLongRunning] = useState(false)
	const [startTime, setStartTime] = useState<number | null>(null)

	const start = () => {
		setStartTime(Date.now())
		setTimeout(() => {
			setIsLongRunning(true)
		}, threshold)
	}

	const stop = () => {
		setIsLongRunning(false)
		setStartTime(null)
	}

	const elapsedTime = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0

	return {
		isLongRunning,
		elapsedTime,
		start,
		stop,
	}
}
