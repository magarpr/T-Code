import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { Wrench } from "lucide-react"
import { HTMLAttributes, useMemo } from "react"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { toolNames } from "@roo-code/types"

import { Section } from "./Section"
import { SectionHeader } from "./SectionHeader"
import { SetCachedStateField } from "./types"

type ToolSettingsProps = HTMLAttributes<HTMLDivElement> & {
	disabledTools?: string[]
	setCachedStateField: SetCachedStateField<"disabledTools">
}

export const ToolSettings = ({ disabledTools = [], setCachedStateField, ...props }: ToolSettingsProps) => {
	const { t } = useAppTranslation()

	const handleToolToggle = (toolName: string, enabled: boolean) => {
		if (enabled) {
			// Remove from disabled tools
			setCachedStateField(
				"disabledTools",
				disabledTools.filter((tool) => tool !== toolName),
			)
		} else {
			// Add to disabled tools
			setCachedStateField("disabledTools", [...disabledTools, toolName])
		}
	}

	const isToolEnabled = (toolName: string) => !disabledTools.includes(toolName)

	// Get all available tools dynamically from packages/types/src/tool.ts
	const allTools = useMemo(() => {
		// Use the toolNames array from @roo-code/types and sort alphabetically by translated names
		return [...toolNames].sort((a, b) => {
			const nameA = t(`settings:tools.names.${a}`) || a
			const nameB = t(`settings:tools.names.${b}`) || b
			return nameA.localeCompare(nameB)
		})
	}, [t])

	return (
		<div {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<Wrench className="w-4" />
					<div>{t("settings:sections.tools")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div className="text-vscode-descriptionForeground text-sm mb-3">{t("settings:tools.description")}</div>

				<div className="space-y-2">
					{/* All tools can be toggled */}
					{allTools.map((tool) => (
						<VSCodeCheckbox
							key={tool}
							checked={isToolEnabled(tool)}
							onChange={(e: any) => handleToolToggle(tool, e.target.checked)}>
							<span className="text-sm">{t(`settings:tools.names.${tool}`) || tool}</span>
						</VSCodeCheckbox>
					))}
				</div>
			</Section>
		</div>
	)
}
