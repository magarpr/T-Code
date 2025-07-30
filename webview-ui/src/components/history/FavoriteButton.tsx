import React from "react"
import { StandardTooltip } from "@/components/ui"

interface FavoriteButtonProps {
	isFavorite: boolean
	onToggleFavorite: () => void
	className?: string
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({ isFavorite, onToggleFavorite, className = "" }) => {
	return (
		<StandardTooltip content={isFavorite ? "Remove from favorites" : "Add to favorites"}>
			<button
				onClick={(e) => {
					e.stopPropagation()
					onToggleFavorite()
				}}
				className={`p-1 rounded hover:bg-vscode-toolbar-hoverBackground transition-colors ${className}`}
				data-testid="favorite-button">
				<span
					className={`codicon ${
						isFavorite ? "codicon-star-full" : "codicon-star-empty"
					} text-sm ${isFavorite ? "text-yellow-400" : "text-vscode-descriptionForeground"}`}
				/>
			</button>
		</StandardTooltip>
	)
}
