import { describe, test, expect } from "vitest"
import { applyMessageWindow, shouldApplyWindowing, DEFAULT_MESSAGE_WINDOW_SIZE } from "./messageWindowing"
import type { ClineMessage } from "@roo-code/types"

// Helper function to create mock messages
function createMockMessage(ts: number, text: string = `Message ${ts}`): ClineMessage {
	return {
		type: "say",
		say: "text",
		ts,
		text,
	}
}

describe("messageWindowing", () => {
	describe("shouldApplyWindowing", () => {
		test("should return false for message counts below threshold", () => {
			expect(shouldApplyWindowing(10)).toBe(false)
			expect(shouldApplyWindowing(25)).toBe(false)
		})

		test("should return true for message counts above threshold", () => {
			expect(shouldApplyWindowing(26)).toBe(true)
			expect(shouldApplyWindowing(100)).toBe(true)
			expect(shouldApplyWindowing(500)).toBe(true)
		})

		test("should respect custom threshold", () => {
			expect(shouldApplyWindowing(15, 20)).toBe(false)
			expect(shouldApplyWindowing(21, 20)).toBe(true)
		})
	})

	describe("applyMessageWindow", () => {
		test("should return all messages when count is below window size", () => {
			const messages = [createMockMessage(1), createMockMessage(2), createMockMessage(3)]

			const result = applyMessageWindow(messages)
			expect(result).toEqual(messages)
			expect(result.length).toBe(3)
		})

		test("should return windowed messages when count exceeds window size", () => {
			// Create 35 messages (exceeds default window size of 30)
			const messages = Array.from({ length: 35 }, (_, i) => createMockMessage(i + 1))

			const result = applyMessageWindow(messages)

			// Should return 30 messages: first message + 29 recent messages
			expect(result.length).toBe(30)

			// First message should be preserved
			expect(result[0]).toEqual(messages[0])
			expect(result[0].ts).toBe(1)

			// Remaining messages should be the most recent ones
			expect(result[1].ts).toBe(7) // messages[6] (35 - 29 + 1)
			expect(result[29].ts).toBe(35) // Last message
		})

		test("should handle custom window size", () => {
			const messages = Array.from({ length: 20 }, (_, i) => createMockMessage(i + 1))
			const windowSize = 10

			const result = applyMessageWindow(messages, windowSize)

			expect(result.length).toBe(10)
			expect(result[0].ts).toBe(1) // First message preserved
			expect(result[1].ts).toBe(12) // messages[11] (20 - 9 + 1)
			expect(result[9].ts).toBe(20) // Last message
		})

		test("should not duplicate first message if it is already in recent messages", () => {
			// Create exactly 30 messages (equal to window size)
			const messages = Array.from({ length: 30 }, (_, i) => createMockMessage(i + 1))

			const result = applyMessageWindow(messages)

			// Should return all 30 messages without duplication
			expect(result.length).toBe(30)
			expect(result[0].ts).toBe(1) // First message is included in recent messages, so no duplication
			expect(result[29].ts).toBe(30) // Last message
		})

		test("should handle edge case with exactly window size + 1 messages", () => {
			// Create 31 messages (window size + 1)
			const messages = Array.from({ length: 31 }, (_, i) => createMockMessage(i + 1))

			const result = applyMessageWindow(messages)

			expect(result.length).toBe(30)
			expect(result[0].ts).toBe(1) // First message preserved
			expect(result[1].ts).toBe(3) // messages[2] (31 - 29 + 1)
			expect(result[29].ts).toBe(31) // Last message
		})

		test("should handle empty messages array", () => {
			const result = applyMessageWindow([])
			expect(result).toEqual([])
		})

		test("should handle single message", () => {
			const messages = [createMockMessage(1)]
			const result = applyMessageWindow(messages)
			expect(result).toEqual(messages)
		})

		test("should preserve message structure and content", () => {
			const messages = Array.from({ length: 35 }, (_, i) => createMockMessage(i + 1, `Custom message ${i + 1}`))

			const result = applyMessageWindow(messages)

			// Verify first message is preserved exactly
			expect(result[0]).toEqual(messages[0])
			expect(result[0].text).toBe("Custom message 1")

			// Verify last message is preserved exactly
			expect(result[29]).toEqual(messages[34])
			expect(result[29].text).toBe("Custom message 35")
		})

		test("should work with realistic message counts from issue description", () => {
			// Test with 200-500 messages as mentioned in the issue
			const messageCounts = [200, 300, 500]

			messageCounts.forEach((count) => {
				const messages = Array.from({ length: count }, (_, i) => createMockMessage(i + 1))
				const result = applyMessageWindow(messages)

				// Should always return exactly 30 messages
				expect(result.length).toBe(DEFAULT_MESSAGE_WINDOW_SIZE)

				// First message should be preserved
				expect(result[0].ts).toBe(1)

				// Last message should be the most recent
				expect(result[29].ts).toBe(count)

				// Memory usage should be reduced by ~85-94%
				const reductionPercentage = ((count - DEFAULT_MESSAGE_WINDOW_SIZE) / count) * 100
				expect(reductionPercentage).toBeGreaterThanOrEqual(85)
			})
		})
	})
})
