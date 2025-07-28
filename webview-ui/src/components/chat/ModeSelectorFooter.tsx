import React from "react"
import { IconButton } from "./IconButton"
import { StandardTooltip } from "@/components/ui"
import { vscode } from "@/utils/vscode"
import { useAppTranslation } from "@/i18n/TranslationContext"

interface ModeSelectorFooterProps {
	selectedMode: string | null
	showSearch: boolean
	instructionText: string
	onExport: () => void
	onImport: () => void
	onClose: () => void
}

export const ModeSelectorFooter: React.FC<ModeSelectorFooterProps> = ({
	selectedMode,
	showSearch,
	instructionText,
	onExport,
	onImport,
	onClose,
}) => {
	const { t } = useAppTranslation()

	const handleMarketplaceClick = () => {
		window.postMessage(
			{
				type: "action",
				action: "marketplaceButtonClicked",
				values: { marketplaceTab: "mode" },
			},
			"*",
		)
		onClose()
	}

	const handleExportClick = () => {
		if (selectedMode) {
			onExport()
		}
		onClose()
	}

	const handleImportClick = () => {
		onImport()
		onClose()
	}

	const handleSettingsClick = () => {
		vscode.postMessage({
			type: "switchTab",
			tab: "modes",
		})
		onClose()
	}

	return (
		<div className="flex flex-row items-center justify-between px-2 py-2 border-t border-vscode-dropdown-border">
			<div className="flex flex-row gap-1">
				<IconButton
					iconClass="codicon-extensions"
					title={t("chat:modeSelector.marketplace")}
					onClick={handleMarketplaceClick}
				/>
				<IconButton
					iconClass="codicon-export"
					title={t("prompts:exportMode.title")}
					onClick={handleExportClick}
				/>
				<IconButton
					iconClass="codicon-import"
					title={t("prompts:modes.importMode")}
					onClick={handleImportClick}
				/>
				<IconButton
					iconClass="codicon-settings-gear"
					title={t("chat:modeSelector.settings")}
					onClick={handleSettingsClick}
				/>
			</div>

			{/* Info icon and title on the right - only show info icon when search bar is visible */}
			<div className="flex items-center gap-1 pr-1">
				{showSearch && (
					<StandardTooltip content={instructionText}>
						<span className="codicon codicon-info text-xs text-vscode-descriptionForeground opacity-70 hover:opacity-100 cursor-help" />
					</StandardTooltip>
				)}
				<h4 className="m-0 font-medium text-sm text-vscode-descriptionForeground">
					{t("chat:modeSelector.title")}
				</h4>
			</div>
		</div>
	)
}
