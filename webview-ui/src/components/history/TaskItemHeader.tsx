import React from "react"
import type { HistoryItem } from "@roo-code/types"
import { formatDate } from "@/utils/format"
import { DeleteButton } from "./DeleteButton"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { StandardTooltip } from "@/components/ui"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"
import { useAppTranslation } from "@/i18n/TranslationContext"

export interface TaskItemHeaderProps {
	item: HistoryItem
	isSelectionMode: boolean
	onDelete?: (taskId: string) => void
}

const TaskItemHeader: React.FC<TaskItemHeaderProps> = ({ item, isSelectionMode, onDelete }) => {
	const { pinnedTasks, togglePinnedTask } = useExtensionState()
	const { t } = useAppTranslation()
	const isPinned = pinnedTasks?.[item.id] || false

	const handlePinToggle = (e: React.MouseEvent) => {
		e.stopPropagation()
		togglePinnedTask(item.id)
		vscode.postMessage({
			type: "toggleTaskPin",
			text: item.id,
		})
	}
	return (
		<div
			className={cn("flex justify-between items-center", {
				// this is to balance out the margin when we don't have a delete button
				// because the delete button sorta pushes the date up due to its size
				"mb-1": !onDelete,
			})}>
			<div className="flex items-center flex-wrap gap-x-2 text-xs">
				<span className="text-vscode-descriptionForeground font-medium text-sm uppercase">
					{formatDate(item.ts)}
				</span>
			</div>

			{/* Action Buttons */}
			{!isSelectionMode && (
				<div className="flex flex-row gap-0 items-center opacity-20 group-hover:opacity-50 hover:opacity-100">
					<StandardTooltip content={isPinned ? t("history:unpin") : t("history:pin")}>
						<Button
							variant="ghost"
							size="sm"
							onClick={handlePinToggle}
							className={cn("size-5 flex items-center justify-center", {
								"opacity-100 bg-accent": isPinned,
							})}>
							<span className="codicon codicon-pin text-xs opacity-50" />
						</Button>
					</StandardTooltip>
					{onDelete && <DeleteButton itemId={item.id} onDelete={onDelete} />}
				</div>
			)}
		</div>
	)
}

export default TaskItemHeader
