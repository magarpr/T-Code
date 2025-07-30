// npx vitest run src/api/transform/__tests__/image-limiting.spec.ts

import { describe, it, expect } from "vitest"
import { Anthropic } from "@anthropic-ai/sdk"
import {
	countImagesInMessages,
	limitImagesInMessages,
	exceedsBedrockImageLimit,
	applyBedrockImageLimiting,
	DEFAULT_BEDROCK_IMAGE_LIMIT,
} from "../image-limiting"

describe("image-limiting", () => {
	describe("countImagesInMessages", () => {
		it("should count zero images in empty messages", () => {
			expect(countImagesInMessages([])).toBe(0)
		})

		it("should count zero images in text-only messages", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello, how are you?",
				},
				{
					role: "assistant",
					content: "I'm doing well, thank you!",
				},
			]
			expect(countImagesInMessages(messages)).toBe(0)
		})

		it("should count images in mixed content messages", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Look at this image:" },
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/png",
								data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
							},
						},
					],
				},
				{
					role: "assistant",
					content: "I can see the image.",
				},
				{
					role: "user",
					content: [
						{ type: "text", text: "And another one:" },
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/jpeg",
								data: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8A",
							},
						},
					],
				},
			]
			expect(countImagesInMessages(messages)).toBe(2)
		})

		it("should handle string content messages", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Just text content",
				},
			]
			expect(countImagesInMessages(messages)).toBe(0)
		})
	})

	describe("limitImagesInMessages", () => {
		const createImageBlock = (index: number): Anthropic.ImageBlockParam => ({
			type: "image",
			source: {
				type: "base64",
				media_type: "image/png",
				data: `image-data-${index}`,
			},
		})

		const createTextBlock = (text: string): Anthropic.TextBlockParam => ({
			type: "text",
			text,
		})

		it("should not modify messages when under the limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [createTextBlock("Here are some images:"), createImageBlock(1), createImageBlock(2)],
				},
			]

			const result = limitImagesInMessages(messages, { maxImages: 5, replaceWithText: true })
			expect(result).toEqual(messages)
		})

		it("should remove oldest images when over the limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [createTextBlock("First message"), createImageBlock(1), createImageBlock(2)],
				},
				{
					role: "assistant",
					content: "I see the images.",
				},
				{
					role: "user",
					content: [createTextBlock("Second message"), createImageBlock(3), createImageBlock(4)],
				},
			]

			const result = limitImagesInMessages(messages, { maxImages: 2, replaceWithText: true })

			// Should keep the last 2 images (3 and 4) and replace the first 2 with text
			expect(countImagesInMessages(result)).toBe(2)

			// Check that first message has text replacements
			const firstMessage = result[0]
			expect(Array.isArray(firstMessage.content)).toBe(true)
			if (Array.isArray(firstMessage.content)) {
				expect(firstMessage.content[1].type).toBe("text")
				expect(firstMessage.content[2].type).toBe("text")
				expect((firstMessage.content[1] as Anthropic.TextBlockParam).text).toContain("Image removed")
			}

			// Check that second message still has images
			const thirdMessage = result[2]
			expect(Array.isArray(thirdMessage.content)).toBe(true)
			if (Array.isArray(thirdMessage.content)) {
				expect(thirdMessage.content[1].type).toBe("image")
				expect(thirdMessage.content[2].type).toBe("image")
			}
		})

		it("should remove images without replacement when replaceWithText is false", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						createTextBlock("Message with images"),
						createImageBlock(1),
						createImageBlock(2),
						createImageBlock(3),
					],
				},
			]

			const result = limitImagesInMessages(messages, { maxImages: 1, replaceWithText: false })

			expect(countImagesInMessages(result)).toBe(1)

			const message = result[0]
			expect(Array.isArray(message.content)).toBe(true)
			if (Array.isArray(message.content)) {
				// Should have text + 1 image (2 removed completely)
				expect(message.content).toHaveLength(2)
				expect(message.content[0].type).toBe("text")
				expect(message.content[1].type).toBe("image")
			}
		})

		it("should handle edge case with exactly the limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [createImageBlock(1), createImageBlock(2)],
				},
			]

			const result = limitImagesInMessages(messages, { maxImages: 2, replaceWithText: true })
			expect(result).toEqual(messages)
			expect(countImagesInMessages(result)).toBe(2)
		})

		it("should handle messages with no images", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Just text",
				},
				{
					role: "assistant",
					content: [createTextBlock("Also just text")],
				},
			]

			const result = limitImagesInMessages(messages, { maxImages: 1, replaceWithText: true })
			expect(result).toEqual(messages)
		})

		it("should preserve message structure and other content types", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [createTextBlock("Before image"), createImageBlock(1), createTextBlock("After image")],
				},
			]

			const result = limitImagesInMessages(messages, { maxImages: 0, replaceWithText: true })

			const message = result[0]
			expect(Array.isArray(message.content)).toBe(true)
			if (Array.isArray(message.content)) {
				expect(message.content).toHaveLength(3)
				expect(message.content[0].type).toBe("text")
				expect((message.content[0] as Anthropic.TextBlockParam).text).toBe("Before image")
				expect(message.content[1].type).toBe("text")
				expect((message.content[1] as Anthropic.TextBlockParam).text).toContain("Image removed")
				expect(message.content[2].type).toBe("text")
				expect((message.content[2] as Anthropic.TextBlockParam).text).toBe("After image")
			}
		})
	})

	describe("exceedsBedrockImageLimit", () => {
		it("should return false for conversations under the limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Test" },
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/png",
								data: "test-data",
							},
						},
					],
				},
			]
			expect(exceedsBedrockImageLimit(messages)).toBe(false)
		})

		it("should return true for conversations over the limit", () => {
			// Create 21 images (over the 20 limit)
			const content: Anthropic.Messages.ContentBlockParam[] = [{ type: "text", text: "Many images:" }]
			for (let i = 0; i < 21; i++) {
				content.push({
					type: "image",
					source: {
						type: "base64",
						media_type: "image/png",
						data: `image-${i}`,
					},
				})
			}

			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content,
				},
			]
			expect(exceedsBedrockImageLimit(messages)).toBe(true)
		})
	})

	describe("applyBedrockImageLimiting", () => {
		it("should apply default Bedrock limiting", () => {
			// Create 25 images (over the 20 limit)
			const content: Anthropic.Messages.ContentBlockParam[] = [{ type: "text", text: "Many images:" }]
			for (let i = 0; i < 25; i++) {
				content.push({
					type: "image",
					source: {
						type: "base64",
						media_type: "image/png",
						data: `image-${i}`,
					},
				})
			}

			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content,
				},
			]

			const result = applyBedrockImageLimiting(messages)
			expect(countImagesInMessages(result)).toBe(DEFAULT_BEDROCK_IMAGE_LIMIT.maxImages)
		})

		it("should not modify conversations under the limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Few images:" },
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/png",
								data: "image-1",
							},
						},
					],
				},
			]

			const result = applyBedrockImageLimiting(messages)
			expect(result).toEqual(messages)
		})
	})

	describe("integration scenarios", () => {
		it("should handle browser tool scenario with many screenshots", () => {
			// Simulate a browser tool session with 25 screenshots
			const messages: Anthropic.Messages.MessageParam[] = []

			for (let i = 0; i < 25; i++) {
				messages.push({
					role: "user",
					content: [{ type: "text", text: `Browser action ${i + 1}` }],
				})
				messages.push({
					role: "assistant",
					content: [{ type: "text", text: `I'll take a screenshot` }],
				})
				messages.push({
					role: "user",
					content: [
						{ type: "text", text: `Screenshot ${i + 1}:` },
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/png",
								data: `screenshot-${i + 1}`,
							},
						},
					],
				})
			}

			expect(countImagesInMessages(messages)).toBe(25)

			const result = applyBedrockImageLimiting(messages)
			expect(countImagesInMessages(result)).toBe(20)

			// Verify that the most recent 20 images are kept
			let imageCount = 0
			let foundFirstImage = false
			for (let i = result.length - 1; i >= 0; i--) {
				const message = result[i]
				if (Array.isArray(message.content)) {
					for (const block of message.content) {
						if (block.type === "image") {
							imageCount++
							if (!foundFirstImage) {
								// The last image should be screenshot-25
								expect((block as any).source.data).toBe("screenshot-25")
								foundFirstImage = true
							}
						}
					}
				}
			}
			expect(imageCount).toBe(20)
		})
	})
})
