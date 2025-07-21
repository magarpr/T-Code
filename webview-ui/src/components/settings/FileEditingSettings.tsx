import { HTMLAttributes } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { FileEdit } from "lucide-react"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

type FileEditingSettingsProps = HTMLAttributes<HTMLDivElement> & {
	diffViewAutoFocus?: boolean
	setCachedStateField: SetCachedStateField<"diffViewAutoFocus">
}

export const FileEditingSettings = ({ diffViewAutoFocus, setCachedStateField, ...props }: FileEditingSettingsProps) => {
	const { t } = useAppTranslation()
	return (
		<div {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<FileEdit className="w-4" />
					<div>{t("settings:sections.fileEditing")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div>
					<VSCodeCheckbox
						checked={diffViewAutoFocus}
						onChange={(e: any) => {
							setCachedStateField("diffViewAutoFocus", e.target.checked)
						}}>
						<span className="font-medium">{t("settings:fileEditing.diffViewAutoFocus.label")}</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						{t("settings:fileEditing.diffViewAutoFocus.description")}
					</div>
				</div>
			</Section>
		</div>
	)
}
