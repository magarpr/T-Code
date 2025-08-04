import { useEffect, useState } from "react"
import { vscode } from "../../../utils/vscode"
import type { ModelInfo } from "@roo-code/types"

export function useBedrockModelCapabilities(customArn?: string): ModelInfo | undefined {
	const [capabilities, setCapabilities] = useState<ModelInfo | undefined>(undefined)

	useEffect(() => {
		if (!customArn) {
			setCapabilities(undefined)
			return
		}

		// Request capabilities from backend
		vscode.postMessage({
			type: "requestBedrockModelCapabilities",
			values: { customArn },
		})

		// Listen for response
		const handler = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "bedrockModelCapabilities" && message.values?.customArn === customArn) {
				if (message.values.modelInfo) {
					setCapabilities(message.values.modelInfo)
				} else if (message.values.error) {
					console.error("Error fetching Bedrock model capabilities:", message.values.error)
					// Keep undefined to fall back to defaults
					setCapabilities(undefined)
				}
			}
		}

		window.addEventListener("message", handler)

		return () => {
			window.removeEventListener("message", handler)
		}
	}, [customArn])

	return capabilities
}
