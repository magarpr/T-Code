import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { Wrench } from "lucide-react"
import { HTMLAttributes, useMemo } from "react"

import { useAppTranslation } from "@/i18n/TranslationContext"

import { Section } from "./Section"
import { SectionHeader } from "./SectionHeader"
import { SetCachedStateField } from "./types"

type ToolSettingsProps = HTMLAttributes<HTMLDivElement> & {
	disabledTools?: string[]
	setCachedStateField: SetCachedStateField<"disabledTools">
}

// Tool display names mapping
const TOOL_DISPLAY_NAMES: Record<string, string> = {
	execute_command: "Run commands",
	read_file: "Read files",
	fetch_instructions: "Fetch instructions",
	write_to_file: "Write files",
	apply_diff: "Apply changes",
	search_files: "Search files",
	list_files: "List files",
	list_code_definition_names: "List definitions",
	browser_action: "Use a browser",
	use_mcp_tool: "Use MCP tools",
	access_mcp_resource: "Access MCP resources",
	ask_followup_question: "Ask questions",
	attempt_completion: "Complete tasks",
	switch_mode: "Switch modes",
	new_task: "Create new task",
	insert_content: "Insert content",
	search_and_replace: "Search and replace",
	codebase_search: "Codebase search",
	update_todo_list: "Update todo list",
}

// Tools that are always available and cannot be disabled
const ALWAYS_AVAILABLE_TOOLS = [
	"ask_followup_question",
	"attempt_completion",
	"switch_mode",
	"new_task",
	"update_todo_list",
]

// Tool groups for better organization
const TOOL_GROUPS = {
	"File Operations": [
		"read_file",
		"write_to_file",
		"search_files",
		"list_files",
		"list_code_definition_names",
		"codebase_search",
	],
	"Code Editing": ["apply_diff", "insert_content", "search_and_replace"],
	System: ["execute_command", "browser_action"],
	MCP: ["use_mcp_tool", "access_mcp_resource"],
	Other: ["fetch_instructions"],
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

	const toolGroups = useMemo(() => {
		return Object.entries(TOOL_GROUPS).map(([groupName, tools]) => ({
			name: groupName,
			tools: tools.filter((tool) => !ALWAYS_AVAILABLE_TOOLS.includes(tool)),
		}))
	}, [])

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

				<div className="space-y-4">
					{toolGroups.map(({ name, tools }) => (
						<div key={name}>
							<h4 className="font-medium mb-2">{name}</h4>
							<div className="space-y-1 pl-3">
								{tools.map((tool) => (
									<VSCodeCheckbox
										key={tool}
										checked={isToolEnabled(tool)}
										onChange={(e: any) => handleToolToggle(tool, e.target.checked)}>
										<span className="text-sm">{TOOL_DISPLAY_NAMES[tool] || tool}</span>
									</VSCodeCheckbox>
								))}
							</div>
						</div>
					))}
				</div>

				<div className="text-vscode-descriptionForeground text-xs mt-3">{t("settings:tools.note")}</div>
			</Section>
		</div>
	)
}
