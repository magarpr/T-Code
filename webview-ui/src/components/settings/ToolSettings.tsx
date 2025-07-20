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

// Import the constants from shared/tools.ts
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

// Tool groups configuration
const TOOL_GROUPS: Record<string, { tools: readonly string[] }> = {
	read: {
		tools: [
			"read_file",
			"fetch_instructions",
			"search_files",
			"list_files",
			"list_code_definition_names",
			"codebase_search",
		],
	},
	edit: {
		tools: ["apply_diff", "write_to_file", "insert_content", "search_and_replace"],
	},
	browser: {
		tools: ["browser_action"],
	},
	command: {
		tools: ["execute_command"],
	},
	mcp: {
		tools: ["use_mcp_tool", "access_mcp_resource"],
	},
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

	// Get all available tools dynamically from the global tools configuration
	const allTools = useMemo(() => {
		const tools = new Set<string>()

		// Add all tools from tool groups
		Object.values(TOOL_GROUPS).forEach((group) => {
			group.tools.forEach((tool) => tools.add(tool))
		})

		// Add always available tools
		ALWAYS_AVAILABLE_TOOLS.forEach((tool) => tools.add(tool))

		// Convert to array and sort alphabetically
		return Array.from(tools).sort((a, b) => {
			const nameA = TOOL_DISPLAY_NAMES[a as keyof typeof TOOL_DISPLAY_NAMES] || a
			const nameB = TOOL_DISPLAY_NAMES[b as keyof typeof TOOL_DISPLAY_NAMES] || b
			return nameA.localeCompare(nameB)
		})
	}, [])

	// Separate tools into disableable and always-available
	const disableableTools = useMemo(() => {
		return allTools.filter((tool) => !ALWAYS_AVAILABLE_TOOLS.includes(tool as any))
	}, [allTools])

	const alwaysAvailableTools = useMemo(() => {
		return allTools.filter((tool) => ALWAYS_AVAILABLE_TOOLS.includes(tool as any))
	}, [allTools])

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
					{/* Disableable tools */}
					{disableableTools.map((tool) => (
						<VSCodeCheckbox
							key={tool}
							checked={isToolEnabled(tool)}
							onChange={(e: any) => handleToolToggle(tool, e.target.checked)}>
							<span className="text-sm">
								{TOOL_DISPLAY_NAMES[tool as keyof typeof TOOL_DISPLAY_NAMES] || tool}
							</span>
						</VSCodeCheckbox>
					))}

					{/* Separator */}
					{alwaysAvailableTools.length > 0 && (
						<div className="border-t border-vscode-panel-border my-3 pt-3">
							<div className="text-vscode-descriptionForeground text-xs mb-2">
								{t("settings:tools.alwaysAvailable")}
							</div>
						</div>
					)}

					{/* Always available tools (disabled checkboxes) */}
					{alwaysAvailableTools.map((tool) => (
						<VSCodeCheckbox key={tool} checked={true} disabled={true}>
							<span className="text-sm opacity-75">
								{TOOL_DISPLAY_NAMES[tool as keyof typeof TOOL_DISPLAY_NAMES] || tool}
							</span>
						</VSCodeCheckbox>
					))}
				</div>

				<div className="text-vscode-descriptionForeground text-xs mt-3">{t("settings:tools.note")}</div>
			</Section>
		</div>
	)
}
