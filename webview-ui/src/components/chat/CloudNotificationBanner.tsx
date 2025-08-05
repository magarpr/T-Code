import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Lightbulb, X } from "lucide-react"
import { cn } from "@src/lib/utils"

interface CloudNotificationBannerProps {
	onDismiss: () => void
	onNavigateToAccount: () => void
	className?: string
}

export const CloudNotificationBanner = ({
	onDismiss,
	onNavigateToAccount,
	className,
}: CloudNotificationBannerProps) => {
	const { t } = useTranslation()
	const [isVisible, setIsVisible] = useState(true)
	const [isAnimating, setIsAnimating] = useState(false)

	const handleDismiss = () => {
		setIsAnimating(true)
		setTimeout(() => {
			setIsVisible(false)
			onDismiss()
		}, 200) // Match animation duration
	}

	const handleClick = () => {
		onNavigateToAccount()
		handleDismiss()
	}

	if (!isVisible) return null

	return (
		<div
			className={cn(
				"bg-vscode-badge-background relative z-50 transition-all duration-200 ease-in-out",
				isAnimating ? "opacity-0 transform scale-95" : "opacity-100 transform scale-100",
				className,
			)}>
			{/* Main notification container with speech bubble */}
			<div
				className="relative text-vscode-badge-foreground p-2 rounded-md cursor-pointer transition-colors"
				onClick={handleClick}>
				{/* Speech bubble triangle */}
				<div
					className="absolute bg-vscode-badge-background w-3 h-1.5"
					style={{
						clipPath: "polygon(50% 0,100% 100%,0 100%)",
						top: "-6px",
						right: "15px",
					}}
				/>

				{/* Content */}
				<div className="flex items-center justify-between gap-2">
					<Lightbulb size={30} />
					<span className="text-xs">{t("chat:cloudNotification.message")}</span>

					{/* Close button */}
					<button
						onClick={(e) => {
							e.stopPropagation()
							handleDismiss()
						}}
						className="cursor-pointer"
						aria-label="Close notification">
						<X size={14} className="text-vscode-badge-foreground" />
					</button>
				</div>
			</div>
		</div>
	)
}
