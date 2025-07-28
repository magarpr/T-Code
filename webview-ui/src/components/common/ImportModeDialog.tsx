import React from "react"
import { Button } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"

interface ImportModeDialogProps {
	isOpen: boolean
	onClose: () => void
	onImport: (source: "global" | "project") => void
	isImporting?: boolean
}

export const ImportModeDialog: React.FC<ImportModeDialogProps> = ({
	isOpen,
	onClose,
	onImport,
	isImporting = false,
}) => {
	const { t } = useAppTranslation()

	if (!isOpen) return null

	const handleImport = () => {
		const selectedLevel = (document.querySelector('input[name="importLevel"]:checked') as HTMLInputElement)
			?.value as "global" | "project"
		onImport(selectedLevel || "project")
	}

	return (
		<div className="fixed inset-0 flex items-center justify-center bg-black/50 z-[1000]">
			<div className="bg-vscode-editor-background border border-vscode-editor-lineHighlightBorder rounded-lg shadow-lg p-6 max-w-md w-full">
				<h3 className="text-lg font-semibold mb-4">{t("prompts:modes.importMode")}</h3>
				<p className="text-sm text-vscode-descriptionForeground mb-4">{t("prompts:importMode.selectLevel")}</p>
				<div className="space-y-3 mb-6">
					<label className="flex items-start gap-2 cursor-pointer">
						<input type="radio" name="importLevel" value="project" className="mt-1" defaultChecked />
						<div>
							<div className="font-medium">{t("prompts:importMode.project.label")}</div>
							<div className="text-xs text-vscode-descriptionForeground">
								{t("prompts:importMode.project.description")}
							</div>
						</div>
					</label>
					<label className="flex items-start gap-2 cursor-pointer">
						<input type="radio" name="importLevel" value="global" className="mt-1" />
						<div>
							<div className="font-medium">{t("prompts:importMode.global.label")}</div>
							<div className="text-xs text-vscode-descriptionForeground">
								{t("prompts:importMode.global.description")}
							</div>
						</div>
					</label>
				</div>
				<div className="flex justify-end gap-2">
					<Button variant="secondary" onClick={onClose}>
						{t("prompts:createModeDialog.buttons.cancel")}
					</Button>
					<Button variant="default" onClick={handleImport} disabled={isImporting}>
						{isImporting ? t("prompts:importMode.importing") : t("prompts:importMode.import")}
					</Button>
				</div>
			</div>
		</div>
	)
}
