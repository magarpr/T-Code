import React from "react"
import { FileText } from "lucide-react"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { Input } from "@/components/ui"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

interface FileEditingOptionsProps {
	diffEnabled: boolean
	fileBasedEditing: boolean
	writeDelayMs: number
	setCachedStateField: SetCachedStateField<any>
}

export const FileEditingOptions: React.FC<FileEditingOptionsProps> = ({
	diffEnabled,
	fileBasedEditing,
	writeDelayMs,
	setCachedStateField,
}) => {
	const { t } = useAppTranslation()

	return (
		<div>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<FileText className="w-4" />
					<div>{t("settings:sections.fileEditing")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div className="space-y-4">
					<div>
						<VSCodeCheckbox
							checked={fileBasedEditing}
							onChange={(e: any) => setCachedStateField("fileBasedEditing", e.target.checked)}
							data-testid="file-based-editing-checkbox">
							<span className="font-medium">{t("settings:fileEditing.fileBasedEditingLabel")}</span>
						</VSCodeCheckbox>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							{t("settings:fileEditing.fileBasedEditingDescription")}
						</div>
					</div>

					<div>
						<VSCodeCheckbox
							checked={diffEnabled && !fileBasedEditing}
							onChange={(e: any) => setCachedStateField("diffEnabled", e.target.checked)}
							disabled={fileBasedEditing}
							data-testid="diff-enabled-checkbox">
							<span className="font-medium">{t("settings:fileEditing.diffEnabledLabel")}</span>
						</VSCodeCheckbox>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							{t("settings:fileEditing.diffEnabledDescription")}
						</div>
					</div>

					<div>
						<label className="block font-medium mb-1">{t("settings:fileEditing.writeDelayLabel")}</label>
						<div className="flex items-center gap-2">
							<Input
								type="number"
								value={writeDelayMs}
								onChange={(e: any) => {
									const value = parseInt(e.target.value, 10)
									if (!isNaN(value) && value >= 0) {
										setCachedStateField("writeDelayMs", value)
									}
								}}
								className="w-24"
								min="0"
								step="100"
								data-testid="write-delay-input"
							/>
							<span className="text-vscode-descriptionForeground">ms</span>
						</div>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							{t("settings:fileEditing.writeDelayDescription")}
						</div>
					</div>
				</div>
			</Section>
		</div>
	)
}
