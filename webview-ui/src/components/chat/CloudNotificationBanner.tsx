import { useState } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
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
				"relative mx-3 mb-3 transition-all duration-200 ease-in-out",
				isAnimating ? "opacity-0 transform scale-95" : "opacity-100 transform scale-100",
				className,
			)}>
			{/* Main notification container with speech bubble */}
			<div
				className="relative bg-vscode-charts-blue text-white px-4 py-3 rounded-md cursor-pointer hover:bg-opacity-90 transition-colors"
				onClick={handleClick}>
				{/* Speech bubble triangle */}
				<div className="absolute top-1/2 right-0 transform translate-x-full -translate-y-1/2">
					<div
						className="w-0 h-0 border-l-[12px] border-r-0 border-t-[8px] border-b-[8px]"
						style={{
							borderLeftColor: "var(--vscode-charts-blue)",
							borderTopColor: "transparent",
							borderBottomColor: "transparent",
						}}
					/>
				</div>

				{/* Content */}
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium pr-8">{t("chat:cloudNotification.message")}</span>

					{/* Close button */}
					<button
						onClick={(e) => {
							e.stopPropagation()
							handleDismiss()
						}}
						className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white hover:bg-opacity-20 rounded transition-colors"
						aria-label="Close notification">
						<X size={16} className="text-white" />
					</button>
				</div>
			</div>
		</div>
	)
}
