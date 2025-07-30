import React, { useState } from "react"
import { StandardTooltip } from "@/components/ui"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

interface RenameButtonProps {
	currentName: string
	onRename: (newName: string) => void
	className?: string
}

export const RenameButton: React.FC<RenameButtonProps> = ({ currentName, onRename, className = "" }) => {
	const [isEditing, setIsEditing] = useState(false)
	const [editValue, setEditValue] = useState(currentName)

	const handleStartEdit = (e: React.MouseEvent) => {
		e.stopPropagation()
		setEditValue(currentName)
		setIsEditing(true)
	}

	const handleSave = () => {
		const trimmedValue = editValue.trim()
		if (trimmedValue !== currentName) {
			onRename(trimmedValue)
		}
		setIsEditing(false)
	}

	const handleCancel = () => {
		setEditValue(currentName)
		setIsEditing(false)
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleSave()
		} else if (e.key === "Escape") {
			handleCancel()
		}
	}

	if (isEditing) {
		return (
			<div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
				<VSCodeTextField
					value={editValue}
					onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
					onKeyDown={handleKeyDown}
					className="text-xs"
					style={{ minWidth: "120px" }}
					autoFocus
					data-testid="rename-input"
				/>
				<button
					onClick={handleSave}
					className="p-1 rounded hover:bg-vscode-toolbar-hoverBackground transition-colors"
					data-testid="rename-save">
					<span className="codicon codicon-check text-xs text-green-400" />
				</button>
				<button
					onClick={handleCancel}
					className="p-1 rounded hover:bg-vscode-toolbar-hoverBackground transition-colors"
					data-testid="rename-cancel">
					<span className="codicon codicon-close text-xs text-red-400" />
				</button>
			</div>
		)
	}

	return (
		<StandardTooltip content="Rename task">
			<button
				onClick={handleStartEdit}
				className={`p-1 rounded hover:bg-vscode-toolbar-hoverBackground transition-colors ${className}`}
				data-testid="rename-button">
				<span className="codicon codicon-edit text-sm text-vscode-descriptionForeground" />
			</button>
		</StandardTooltip>
	)
}
