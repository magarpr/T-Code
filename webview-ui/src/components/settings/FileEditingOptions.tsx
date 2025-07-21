import { HTMLAttributes } from "react"
import { FileEdit } from "lucide-react"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

type FileEditingOptionsProps = HTMLAttributes<HTMLDivElement> & {
	autoCloseRooTabs?: boolean
	autoCloseAllRooTabs?: boolean
	setCachedStateField: SetCachedStateField<"autoCloseRooTabs" | "autoCloseAllRooTabs">
}

export const FileEditingOptions = ({
	autoCloseRooTabs,
	autoCloseAllRooTabs,
	setCachedStateField,
	...props
}: FileEditingOptionsProps) => {
	const { t } = useAppTranslation()

	return (
		<div {...props}>
			<SectionHeader description={t("settings:fileEditing.description")}>
				<div className="flex items-center gap-2">
					<FileEdit className="w-4" />
					<div>{t("settings:sections.fileEditing")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div className="flex flex-col gap-4">
					<div>
						<VSCodeCheckbox
							checked={autoCloseRooTabs}
							onChange={(e: any) => setCachedStateField("autoCloseRooTabs", e.target.checked)}
							data-testid="auto-close-roo-tabs-checkbox">
							<span className="font-medium">{t("settings:fileEditing.autoCloseRooTabs.label")}</span>
						</VSCodeCheckbox>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							{t("settings:fileEditing.autoCloseRooTabs.description")}
						</div>
					</div>

					<div>
						<VSCodeCheckbox
							checked={autoCloseAllRooTabs}
							onChange={(e: any) => setCachedStateField("autoCloseAllRooTabs", e.target.checked)}
							data-testid="auto-close-all-roo-tabs-checkbox">
							<span className="font-medium">{t("settings:fileEditing.autoCloseAllRooTabs.label")}</span>
						</VSCodeCheckbox>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							{t("settings:fileEditing.autoCloseAllRooTabs.description")}
						</div>
					</div>
				</div>
			</Section>
		</div>
	)
}
