import React from "react"
import { vscode } from "@/utils/vscode"
import { useAppTranslation } from "@/i18n/TranslationContext"

export const useModeSelectorExportImport = () => {
	const { t } = useAppTranslation()
	const [showImportDialog, setShowImportDialog] = React.useState(false)
	const [isImporting, setIsImporting] = React.useState(false)
	const [exportError, setExportError] = React.useState<string | null>(null)
	const [importError, setImportError] = React.useState<string | null>(null)

	// Handle import/export result messages
	React.useEffect(() => {
		const handler = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "importModeResult") {
				setIsImporting(false)
				setShowImportDialog(false)
				if (!message.success && message.error !== "cancelled") {
					setImportError(message.error || t("prompts:importMode.error"))
					// Clear error after 5 seconds
					setTimeout(() => setImportError(null), 5000)
				}
			} else if (message.type === "exportModeResult") {
				if (!message.success) {
					setExportError(message.error || t("prompts:exportMode.error"))
					// Clear error after 5 seconds
					setTimeout(() => setExportError(null), 5000)
				}
			}
		}

		window.addEventListener("message", handler)
		return () => window.removeEventListener("message", handler)
	}, [t])

	const handleExport = (modeSlug: string) => {
		setExportError(null)
		vscode.postMessage({
			type: "exportMode",
			slug: modeSlug,
		})
	}

	const handleImport = (source: "global" | "project") => {
		setIsImporting(true)
		vscode.postMessage({
			type: "importMode",
			source,
		})
	}

	const openImportDialog = () => {
		setImportError(null)
		setShowImportDialog(true)
	}

	const closeImportDialog = () => {
		setShowImportDialog(false)
	}

	const clearErrors = () => {
		setExportError(null)
		setImportError(null)
	}

	return {
		showImportDialog,
		isImporting,
		exportError,
		importError,
		handleExport,
		handleImport,
		openImportDialog,
		closeImportDialog,
		clearErrors,
	}
}
