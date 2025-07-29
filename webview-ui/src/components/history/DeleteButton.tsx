import { useCallback } from "react"

import { Button, StandardTooltip } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"

type DeleteButtonProps = {
	itemId: string
	onDelete?: (taskId: string) => void
}

export const DeleteButton = ({ itemId, onDelete }: DeleteButtonProps) => {
	const { t } = useAppTranslation()
	const { pinnedTasks } = useExtensionState()
	const isPinned = pinnedTasks?.[itemId] || false

	const handleDeleteClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()

			// Prevent deletion of pinned tasks
			if (isPinned) {
				// Show a simple alert for now - we can improve this later
				alert(t("history:pinnedTaskCannotDelete"))
				return
			}

			if (e.shiftKey) {
				vscode.postMessage({ type: "deleteTaskWithId", text: itemId })
			} else if (onDelete) {
				onDelete(itemId)
			}
		},
		[itemId, onDelete, isPinned, t],
	)

	return (
		<StandardTooltip content={t("history:deleteTaskTitle")}>
			<Button
				variant="ghost"
				size="icon"
				data-testid="delete-task-button"
				onClick={handleDeleteClick}
				className="group-hover:opacity-100 opacity-50 transition-opacity">
				<span className="codicon codicon-trash size-4 align-middle text-vscode-descriptionForeground" />
			</Button>
		</StandardTooltip>
	)
}
