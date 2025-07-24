import React from "react"
import { FileVideo, X } from "lucide-react"
import { getMimeType } from "../../utils/getMimeType"

interface MediaThumbnailsProps {
	mediaItems: string[]
	setMediaItems: React.Dispatch<React.SetStateAction<string[]>>
	style?: React.CSSProperties
}

const MediaThumbnails: React.FC<MediaThumbnailsProps> = ({ mediaItems, setMediaItems, style }) => {
	const handleRemoveImage = (index: number) => {
		setMediaItems((prevImages) => prevImages.filter((_, i) => i !== index))
	}

	return (
		<div className="flex flex-wrap gap-2 p-2 bg-vscode-input-background" style={style}>
			{mediaItems.map((item, index) => {
				const mimeType = getMimeType(item)
				const isVideo = mimeType?.startsWith("video/")

				return (
					<div key={index} className="relative w-16 h-16">
						{isVideo ? (
							<div className="w-full h-full flex items-center justify-center bg-vscode-input-background rounded">
								<FileVideo className="w-8 h-8 text-vscode-descriptionForeground" />
							</div>
						) : (
							<img src={item} alt={`thumbnail ${index}`} className="w-full h-full object-cover rounded" />
						)}
						<button
							onClick={() => handleRemoveImage(index)}
							className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-1">
							<X size={12} />
						</button>
					</div>
				)
			})}
		</div>
	)
}

export default MediaThumbnails
