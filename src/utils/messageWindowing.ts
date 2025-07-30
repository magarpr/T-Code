import type { ClineMessage } from "@roo-code/types"

/**
 * Default window size for messages sent to webview
 * This keeps memory usage minimal even with multiple VSCode windows
 */
export const DEFAULT_MESSAGE_WINDOW_SIZE = 30

/**
 * Apply sliding window to messages for webview display
 * Only sends the most recent messages to prevent memory exhaustion
 *
 * @param messages - Full array of messages
 * @param windowSize - Number of recent messages to include (default: 30)
 * @returns Windowed array of messages
 */
export function applyMessageWindow(
	messages: ClineMessage[],
	windowSize: number = DEFAULT_MESSAGE_WINDOW_SIZE,
): ClineMessage[] {
	if (messages.length <= windowSize) {
		return messages
	}

	// Always include the first message (task description) if it exists
	const firstMessage = messages[0]
	const recentMessages = messages.slice(-windowSize + 1) // Leave room for first message

	// If the first message is already in the recent messages, don't duplicate
	if (recentMessages.length > 0 && recentMessages[0].ts === firstMessage?.ts) {
		return recentMessages
	}

	// Combine first message with recent messages
	return firstMessage ? [firstMessage, ...recentMessages] : recentMessages
}

/**
 * Check if message windowing should be applied based on message count
 *
 * @param messageCount - Total number of messages
 * @param threshold - Threshold above which windowing is applied (default: 25)
 * @returns Whether windowing should be applied
 */
export function shouldApplyWindowing(messageCount: number, threshold: number = 25): boolean {
	return messageCount > threshold
}
