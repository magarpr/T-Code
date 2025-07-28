import { HTMLAttributes } from "react"
import { Palette } from "lucide-react"

import type { Experiments } from "@roo-code/types"

import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { EXPERIMENT_IDS } from "@roo/experiments"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { cn } from "@src/lib/utils"

import { SetExperimentEnabled } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

type UISettingsProps = HTMLAttributes<HTMLDivElement> & {
	experiments: Experiments
	setExperimentEnabled: SetExperimentEnabled
}

export const UISettings = ({ experiments, setExperimentEnabled, className, ...props }: UISettingsProps) => {
	const { t } = useAppTranslation()

	// For now, we'll only handle the enhance prompt button through experiments
	// Other UI settings will be added later when backend support is implemented
	const showEnhancePromptButton = experiments[EXPERIMENT_IDS.SHOW_ENHANCE_PROMPT_BUTTON] ?? true

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader description={t("settings:ui.description")}>
				<div className="flex items-center gap-2">
					<Palette className="w-4" />
					<div>{t("settings:sections.ui")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div>
					<VSCodeCheckbox
						checked={showEnhancePromptButton}
						onChange={(e: any) =>
							setExperimentEnabled(EXPERIMENT_IDS.SHOW_ENHANCE_PROMPT_BUTTON, e.target.checked)
						}
						data-testid="show-enhance-prompt-button-checkbox">
						<span className="font-medium">{t("settings:ui.showEnhancePromptButton.label")}</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
						{t("settings:ui.showEnhancePromptButton.description")}
					</div>
				</div>

				<div className="opacity-50 pointer-events-none">
					<VSCodeCheckbox checked={true} disabled={true} data-testid="show-codebase-indexing-checkbox">
						<span className="font-medium">{t("settings:ui.showCodebaseIndexing.label")}</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
						{t("settings:ui.showCodebaseIndexing.description")}
					</div>
				</div>

				<div className="opacity-50 pointer-events-none">
					<VSCodeCheckbox checked={true} disabled={true} data-testid="show-add-images-to-prompt-checkbox">
						<span className="font-medium">{t("settings:ui.showAddImagesToPrompt.label")}</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
						{t("settings:ui.showAddImagesToPrompt.description")}
					</div>
				</div>

				<div className="opacity-50 pointer-events-none">
					<VSCodeCheckbox checked={true} disabled={true} data-testid="show-api-configuration-checkbox">
						<span className="font-medium">{t("settings:ui.showApiConfiguration.label")}</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
						{t("settings:ui.showApiConfiguration.description")}
					</div>
				</div>

				<div className="opacity-50 pointer-events-none">
					<VSCodeCheckbox checked={true} disabled={true} data-testid="show-auto-approve-checkbox">
						<span className="font-medium">{t("settings:ui.showAutoApprove.label")}</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
						{t("settings:ui.showAutoApprove.description")}
					</div>
				</div>

				<div className="opacity-50 pointer-events-none">
					<VSCodeCheckbox checked={true} disabled={true} data-testid="show-helper-text-checkbox">
						<span className="font-medium">{t("settings:ui.showHelperText.label")}</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
						{t("settings:ui.showHelperText.description")}
					</div>
				</div>

				<div className="opacity-50 pointer-events-none">
					<VSCodeCheckbox checked={true} disabled={true} data-testid="show-send-button-checkbox">
						<span className="font-medium">{t("settings:ui.showSendButton.label")}</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						{t("settings:ui.showSendButton.description")}
					</div>
				</div>

				<div className="text-vscode-descriptionForeground text-sm mt-4 p-3 bg-vscode-editor-background rounded">
					<span className="codicon codicon-info mr-2"></span>
					{t("settings:ui.comingSoon")}
				</div>
			</Section>
		</div>
	)
}
