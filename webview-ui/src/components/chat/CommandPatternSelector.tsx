import React, { useState } from "react"
import { Check, ChevronDown, Info, X } from "lucide-react"
import { cn } from "../../lib/utils"
import { useTranslation, Trans } from "react-i18next"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { StandardTooltip } from "../ui/standard-tooltip"

interface CommandPatternSelectorProps {
	command: string
	allowedCommands: string[]
	deniedCommands: string[]
	onAllowCommandChange: (command: string) => void
	onDenyCommandChange: (command: string) => void
}

export const CommandPatternSelector: React.FC<CommandPatternSelectorProps> = ({
	command,
	allowedCommands,
	deniedCommands,
	onAllowCommandChange,
	onDenyCommandChange,
}) => {
	const { t } = useTranslation()
	const [isExpanded, setIsExpanded] = useState(false)
	const [editedCommand, setEditedCommand] = useState(command)

	const getCommandStatus = (cmd: string): "allowed" | "denied" | "none" => {
		if (allowedCommands.includes(cmd)) return "allowed"
		if (deniedCommands.includes(cmd)) return "denied"
		return "none"
	}

	const currentStatus = getCommandStatus(editedCommand)

	return (
		<div className="border-t border-vscode-panel-border bg-vscode-sideBar-background/30">
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="flex items-center gap-2 w-full px-3 py-2 text-xs text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-list-hoverBackground transition-all"
				aria-expanded={isExpanded}
				aria-label={t(
					isExpanded ? "chat:commandExecution.collapseManagement" : "chat:commandExecution.expandManagement",
				)}>
				<ChevronDown
					className={cn("size-3 transition-transform duration-200", {
						"rotate-0": isExpanded,
						"-rotate-90": !isExpanded,
					})}
				/>
				<span className="font-medium">{t("chat:commandExecution.manageCommands")}</span>
				<StandardTooltip
					content={
						<Trans
							i18nKey="chat:commandExecution.commandManagementDescription"
							components={{
								settingsLink: (
									<VSCodeLink
										href="#"
										onClick={(e) => {
											e.preventDefault()
											window.postMessage(
												{
													type: "action",
													action: "settingsButtonClicked",
													values: { section: "autoApprove" },
												},
												"*",
											)
										}}
										className="inline"
									/>
								),
							}}
						/>
					}>
					<Info className="size-3 ml-1" />
				</StandardTooltip>
			</button>

			{isExpanded && (
				<div className="px-3 pb-3">
					<div className="ml-5 flex items-center gap-2">
						<div className="flex-1">
							<input
								type="text"
								value={editedCommand}
								onChange={(e) => setEditedCommand(e.target.value)}
								className="font-mono text-xs bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded px-2 py-1 w-full focus:outline-none focus:border-vscode-focusBorder"
								placeholder={command}
							/>
						</div>
						<div className="flex items-center gap-1">
							<button
								className={cn("p-1 rounded transition-all", {
									"bg-green-500/20 text-green-500 hover:bg-green-500/30": currentStatus === "allowed",
									"text-vscode-descriptionForeground hover:text-green-500 hover:bg-green-500/10":
										currentStatus !== "allowed",
								})}
								onClick={() => onAllowCommandChange(editedCommand)}
								aria-label={t(
									currentStatus === "allowed"
										? "chat:commandExecution.removeFromAllowed"
										: "chat:commandExecution.addToAllowed",
								)}>
								<Check className="size-3.5" />
							</button>
							<button
								className={cn("p-1 rounded transition-all", {
									"bg-red-500/20 text-red-500 hover:bg-red-500/30": currentStatus === "denied",
									"text-vscode-descriptionForeground hover:text-red-500 hover:bg-red-500/10":
										currentStatus !== "denied",
								})}
								onClick={() => onDenyCommandChange(editedCommand)}
								aria-label={t(
									currentStatus === "denied"
										? "chat:commandExecution.removeFromDenied"
										: "chat:commandExecution.addToDenied",
								)}>
								<X className="size-3.5" />
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
