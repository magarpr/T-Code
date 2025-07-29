import { Anthropic } from "@anthropic-ai/sdk"

/**
 * AWS Bedrock has a hard limit of 20 images total per conversation.
 * This constant defines that limit.
 */
export const AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION = 20

/**
 * Counts the total number of images across all messages in the conversation history
 */
export function countImagesInConversation(messages: Anthropic.Messages.MessageParam[]): number {
	let totalImages = 0

	for (const message of messages) {
		if (Array.isArray(message.content)) {
			for (const block of message.content) {
				if (block.type === "image") {
					totalImages++
				}
			}
		}
	}

	return totalImages
}

/**
 * Limits the total number of images in a conversation to the specified maximum.
 * When the limit is exceeded, removes the oldest images while preserving the most recent ones.
 * This ensures AWS Bedrock's 20-image limit is respected.
 *
 * @param messages - The conversation messages
 * @param maxImages - Maximum number of images allowed (default: AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION)
 * @returns Modified messages with image count limited to maxImages
 */
export function limitImagesInConversation(
	messages: Anthropic.Messages.MessageParam[],
	maxImages: number = AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION,
): Anthropic.Messages.MessageParam[] {
	const totalImages = countImagesInConversation(messages)

	// If we're within the limit, return messages unchanged
	if (totalImages <= maxImages) {
		return messages
	}

	// We need to remove (totalImages - maxImages) images, starting from the oldest
	const imagesToRemove = totalImages - maxImages
	let imagesRemoved = 0

	// Create a deep copy of messages to avoid mutating the original
	const modifiedMessages = messages.map((message) => ({
		...message,
		content: Array.isArray(message.content) ? message.content.map((block) => ({ ...block })) : message.content,
	}))

	// Iterate through messages from oldest to newest, removing images until we reach the limit
	for (let i = 0; i < modifiedMessages.length && imagesRemoved < imagesToRemove; i++) {
		const message = modifiedMessages[i]

		if (Array.isArray(message.content)) {
			const newContent = []

			for (const block of message.content) {
				if (block.type === "image" && imagesRemoved < imagesToRemove) {
					// Replace image with a text placeholder
					newContent.push({
						type: "text" as const,
						text: "[Image removed due to conversation limit - Browser tool screenshot]",
					})
					imagesRemoved++
				} else {
					newContent.push(block)
				}
			}

			message.content = newContent
		}
	}

	return modifiedMessages
}

/**
 * Checks if a conversation has exceeded the AWS Bedrock image limit
 */
export function hasExceededImageLimit(
	messages: Anthropic.Messages.MessageParam[],
	maxImages: number = AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION,
): boolean {
	return countImagesInConversation(messages) > maxImages
}
