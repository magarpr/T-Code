import { HTMLAttributes } from "react"
import { FlaskConical } from "lucide-react"

import type { Experiments } from "@roo-code/types"

import { EXPERIMENT_IDS, experimentConfigsMap } from "@roo/experiments"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { cn } from "@src/lib/utils"
import { Input } from "@src/components/ui"

import { SetExperimentEnabled, SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { ExperimentalFeature } from "./ExperimentalFeature"

type ExperimentalSettingsProps = HTMLAttributes<HTMLDivElement> & {
	experiments: Experiments
	setExperimentEnabled: SetExperimentEnabled
	readFileDeduplicationCacheMinutes?: number
	setCachedStateField?: SetCachedStateField<"readFileDeduplicationCacheMinutes">
}

export const ExperimentalSettings = ({
	experiments,
	setExperimentEnabled,
	readFileDeduplicationCacheMinutes,
	setCachedStateField,
	className,
	...props
}: ExperimentalSettingsProps) => {
	const { t } = useAppTranslation()

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<FlaskConical className="w-4" />
					<div>{t("settings:sections.experimental")}</div>
				</div>
			</SectionHeader>

			<Section>
				{Object.entries(experimentConfigsMap)
					.filter(([key]) => key in EXPERIMENT_IDS)
					.map((config) => {
						if (config[0] === "MULTI_FILE_APPLY_DIFF") {
							return (
								<ExperimentalFeature
									key={config[0]}
									experimentKey={config[0]}
									enabled={experiments[EXPERIMENT_IDS.MULTI_FILE_APPLY_DIFF] ?? false}
									onChange={(enabled) =>
										setExperimentEnabled(EXPERIMENT_IDS.MULTI_FILE_APPLY_DIFF, enabled)
									}
								/>
							)
						}
						return (
							<ExperimentalFeature
								key={config[0]}
								experimentKey={config[0]}
								enabled={experiments[EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS]] ?? false}
								onChange={(enabled) =>
									setExperimentEnabled(
										EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS],
										enabled,
									)
								}
							/>
						)
					})}

				{/* Show cache time setting when READ_FILE_DEDUPLICATION is enabled */}
				{experiments[EXPERIMENT_IDS.READ_FILE_DEDUPLICATION] && (
					<div className="mt-4 pl-8">
						<div className="flex flex-col gap-2">
							<span className="font-medium text-sm">
								{t("settings:experimental.READ_FILE_DEDUPLICATION.cacheTimeLabel")}
							</span>
							<div className="flex items-center gap-4">
								<Input
									type="number"
									pattern="[0-9]*"
									className="w-24 bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border px-2 py-1 rounded text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
									value={readFileDeduplicationCacheMinutes ?? 5}
									min={0}
									onChange={(e) => {
										const newValue = parseInt(e.target.value, 10)
										if (!isNaN(newValue) && newValue >= 0 && setCachedStateField) {
											setCachedStateField("readFileDeduplicationCacheMinutes", newValue)
										}
									}}
									onClick={(e) => e.currentTarget.select()}
									data-testid="read-file-deduplication-cache-minutes-input"
								/>
								<span className="text-sm">
									{t("settings:experimental.READ_FILE_DEDUPLICATION.minutes")}
								</span>
							</div>
							<div className="text-vscode-descriptionForeground text-xs mt-1">
								{t("settings:experimental.READ_FILE_DEDUPLICATION.cacheTimeDescription")}
							</div>
						</div>
					</div>
				)}
			</Section>
		</div>
	)
}
