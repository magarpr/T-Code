import React, { useState } from "react"
import { useTranslation } from "react-i18next"
import { QueuedMessage } from "@roo-code/types"
import { Button } from "@src/components/ui"
import { X, Edit2 } from "lucide-react"

interface QueuedMessagesProps {
	queue: QueuedMessage[]
	onRemove: (index: number) => void
	onUpdate: (index: number, newText: string) => void
}

const QueuedMessages: React.FC<QueuedMessagesProps> = ({ queue, onRemove, onUpdate }) => {
	const { t } = useTranslation("chat")
	const [editingStates, setEditingStates] = useState<Record<string, { isEditing: boolean; value: string }>>({})

	if (queue.length === 0) {
		return null
	}

	const getEditState = (messageId: string, currentText: string) => {
		return editingStates[messageId] || { isEditing: false, value: currentText }
	}

	const setEditState = (messageId: string, isEditing: boolean, value?: string) => {
		setEditingStates((prev) => ({
			...prev,
			[messageId]: { isEditing, value: value ?? prev[messageId]?.value ?? "" },
		}))
	}

	const handleSaveEdit = (index: number, messageId: string, newValue: string) => {
		onUpdate(index, newValue)
		setEditState(messageId, false)
	}

	// Helper function to truncate text with ellipsis
	const truncateText = (text: string, maxLength: number = 50) => {
		if (text.length <= maxLength) return text
		return text.substring(0, maxLength).trim() + "..."
	}

	return (
		<div className="px-[15px] py-[10px] pr-[6px] border-t border-vscode-panel-border" data-testid="queued-messages">
			<div className="flex items-center justify-between mb-2">
				<div className="text-vscode-descriptionForeground text-sm font-medium">
					{t("chat:queuedMessages.title", { count: queue.length })}
				</div>
			</div>
			<div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-2">
				{queue.map((message, index) => {
					const editState = getEditState(message.id, message.text)

					return (
						<div
							key={message.id}
							className="bg-vscode-list-hoverBackground border border-vscode-panel-border rounded p-2 overflow-hidden flex-shrink-0 transition-all hover:border-vscode-focusBorder">
							<div className="flex items-start gap-2">
								<div className="flex-grow min-w-0">
									{editState.isEditing ? (
										<textarea
											ref={(textarea) => {
												if (textarea) {
													// Set cursor at the end
													textarea.setSelectionRange(
														textarea.value.length,
														textarea.value.length,
													)
												}
											}}
											value={editState.value}
											onChange={(e) => setEditState(message.id, true, e.target.value)}
											onBlur={() => handleSaveEdit(index, message.id, editState.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter" && !e.shiftKey) {
													e.preventDefault()
													handleSaveEdit(index, message.id, editState.value)
												}
												if (e.key === "Escape") {
													setEditState(message.id, false, message.text)
												}
											}}
											className="w-full bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded px-2 py-1 resize-none focus:outline-0 focus:ring-1 focus:ring-vscode-focusBorder text-sm"
											placeholder={t("chat:editMessage.placeholder")}
											autoFocus
											rows={Math.min(editState.value.split("\n").length, 10)}
										/>
									) : (
										<div
											className="cursor-pointer group"
											onClick={() => setEditState(message.id, true, message.text)}>
											<div className="flex items-center gap-2">
												<span
													className="text-sm text-vscode-foreground truncate"
													title={message.text}>
													{truncateText(message.text)}
												</span>
												<Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
											</div>
										</div>
									)}
									{message.images && message.images.length > 0 && (
										<div className="mt-1 text-xs text-vscode-descriptionForeground">
											{t("chat:queuedMessages.withImages", { count: message.images.length })}
										</div>
									)}
								</div>
								<Button
									variant="ghost"
									size="icon"
									className="shrink-0 h-6 w-6 opacity-60 hover:opacity-100"
									onClick={(e) => {
										e.stopPropagation()
										onRemove(index)
									}}
									title={t("chat:queuedMessages.remove")}>
									<X className="w-3 h-3" />
								</Button>
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}

export default QueuedMessages
