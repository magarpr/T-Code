import React from "react"
import type { HistoryItem } from "@roo-code/types"
import { formatDate } from "@/utils/format"
import { DeleteButton } from "./DeleteButton"
import { FavoriteButton } from "./FavoriteButton"
import { RenameButton } from "./RenameButton"
import { cn } from "@/lib/utils"

export interface TaskItemHeaderProps {
	item: HistoryItem
	isSelectionMode: boolean
	onDelete?: (taskId: string) => void
	onToggleFavorite?: (taskId: string) => void
	onRename?: (taskId: string, newName: string) => void
}

const TaskItemHeader: React.FC<TaskItemHeaderProps> = ({
	item,
	isSelectionMode,
	onDelete,
	onToggleFavorite,
	onRename,
}) => {
	const displayName = item.customName || item.task

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
				{item.isFavorite && (
					<span className="codicon codicon-star-full text-yellow-400 text-xs" title="Favorited" />
				)}
			</div>

			{/* Action Buttons */}
			{!isSelectionMode && (
				<div className="flex flex-row gap-0 items-center opacity-20 group-hover:opacity-50 hover:opacity-100">
					{onToggleFavorite && (
						<FavoriteButton
							isFavorite={item.isFavorite || false}
							onToggleFavorite={() => onToggleFavorite(item.id)}
						/>
					)}
					{onRename && (
						<RenameButton currentName={displayName} onRename={(newName) => onRename(item.id, newName)} />
					)}
					{onDelete && <DeleteButton itemId={item.id} onDelete={onDelete} />}
				</div>
			)}
		</div>
	)
}

export default TaskItemHeader
