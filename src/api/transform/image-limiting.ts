import { Anthropic } from "@anthropic-ai/sdk"

/**
 * Configuration for image limiting
 */
export interface ImageLimitingConfig {
	/** Maximum number of images to keep in conversation */
	maxImages: number
	/** Whether to replace removed images with descriptive text */
	replaceWithText: boolean
}

/**
 * Default configuration for AWS Bedrock image limiting
 */
export const DEFAULT_BEDROCK_IMAGE_LIMIT: ImageLimitingConfig = {
	maxImages: 20,
	replaceWithText: true,
}

/**
 * Counts the total number of images across all messages in the conversation
 */
export function countImagesInMessages(messages: Anthropic.Messages.MessageParam[]): number {
	let imageCount = 0

	for (const message of messages) {
		if (Array.isArray(message.content)) {
			for (const block of message.content) {
				if (block.type === "image") {
					imageCount++
				}
			}
		}
	}

	return imageCount
}

/**
 * Limits the number of images in a conversation by keeping only the most recent images
 * and optionally replacing older images with descriptive text placeholders.
 *
 * This function processes messages from oldest to newest, removing images from older
 * messages first when the limit is exceeded.
 *
 * @param messages - Array of Anthropic message parameters
 * @param config - Configuration for image limiting
 * @returns Modified messages with image count limited
 */
export function limitImagesInMessages(
	messages: Anthropic.Messages.MessageParam[],
	config: ImageLimitingConfig = DEFAULT_BEDROCK_IMAGE_LIMIT,
): Anthropic.Messages.MessageParam[] {
	const totalImages = countImagesInMessages(messages)

	// If we're within the limit, return messages unchanged
	if (totalImages <= config.maxImages) {
		return messages
	}

	// Calculate how many images we need to remove
	const imagesToRemove = totalImages - config.maxImages
	let imagesRemoved = 0

	// Process messages from oldest to newest, removing images from older messages first
	const modifiedMessages = messages.map((message) => {
		// If we've already removed enough images, return the message unchanged
		if (imagesRemoved >= imagesToRemove) {
			return message
		}

		// Only process messages with array content that might contain images
		if (!Array.isArray(message.content)) {
			return message
		}

		const modifiedContent = message.content
			.map((block) => {
				// If we've already removed enough images, return the block unchanged
				if (imagesRemoved >= imagesToRemove) {
					return block
				}

				// If this is an image block and we need to remove more images
				if (block.type === "image") {
					imagesRemoved++

					if (config.replaceWithText) {
						// Replace with descriptive text
						return {
							type: "text" as const,
							text: "[Image removed due to conversation limit - this was a browser screenshot that has been replaced to stay within AWS Bedrock's 20-image limit]",
						}
					} else {
						// Return null to filter out later
						return null
					}
				}

				return block
			})
			.filter((block): block is Anthropic.Messages.ContentBlockParam => block !== null)

		return {
			...message,
			content: modifiedContent,
		}
	})

	return modifiedMessages
}

/**
 * Checks if a conversation exceeds the image limit for AWS Bedrock
 */
export function exceedsBedrockImageLimit(messages: Anthropic.Messages.MessageParam[]): boolean {
	return countImagesInMessages(messages) > DEFAULT_BEDROCK_IMAGE_LIMIT.maxImages
}

/**
 * Applies AWS Bedrock image limiting to a conversation
 */
export function applyBedrockImageLimiting(
	messages: Anthropic.Messages.MessageParam[],
): Anthropic.Messages.MessageParam[] {
	return limitImagesInMessages(messages, DEFAULT_BEDROCK_IMAGE_LIMIT)
}
