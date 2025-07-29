import { describe, it, expect } from "vitest"
import { Anthropic } from "@anthropic-ai/sdk"
import {
	countImagesInConversation,
	limitImagesInConversation,
	hasExceededImageLimit,
	AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION,
} from "../image-limiting"

describe("image-limiting", () => {
	describe("countImagesInConversation", () => {
		it("should count zero images in empty conversation", () => {
			const messages: Anthropic.Messages.MessageParam[] = []
			expect(countImagesInConversation(messages)).toBe(0)
		})

		it("should count zero images in text-only conversation", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi there!" },
			]
			expect(countImagesInConversation(messages)).toBe(0)
		})

		it("should count images in single message", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Look at this image:" },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "base64data" } },
						{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "base64data2" } },
					],
				},
			]
			expect(countImagesInConversation(messages)).toBe(2)
		})

		it("should count images across multiple messages", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "First image:" },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "base64data1" } },
					],
				},
				{ role: "assistant", content: "I see the image." },
				{
					role: "user",
					content: [
						{ type: "text", text: "Second and third images:" },
						{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "base64data2" } },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "base64data3" } },
					],
				},
			]
			expect(countImagesInConversation(messages)).toBe(3)
		})

		it("should handle mixed content types", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Text content" },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "base64data" } },
						{ type: "text", text: "More text" },
					],
				},
			]
			expect(countImagesInConversation(messages)).toBe(1)
		})
	})

	describe("hasExceededImageLimit", () => {
		it("should return false when under limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "base64data" } },
					],
				},
			]
			expect(hasExceededImageLimit(messages)).toBe(false)
		})

		it("should return false when exactly at limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = []
			// Create exactly 20 images
			for (let i = 0; i < AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION; i++) {
				messages.push({
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: `base64data${i}` } },
					],
				})
			}
			expect(hasExceededImageLimit(messages)).toBe(false)
		})

		it("should return true when over limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = []
			// Create 21 images (1 over limit)
			for (let i = 0; i < AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION + 1; i++) {
				messages.push({
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: `base64data${i}` } },
					],
				})
			}
			expect(hasExceededImageLimit(messages)).toBe(true)
		})

		it("should work with custom limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "base64data1" } },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "base64data2" } },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "base64data3" } },
					],
				},
			]
			expect(hasExceededImageLimit(messages, 2)).toBe(true)
			expect(hasExceededImageLimit(messages, 3)).toBe(false)
			expect(hasExceededImageLimit(messages, 4)).toBe(false)
		})
	})

	describe("limitImagesInConversation", () => {
		it("should return unchanged messages when under limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Hello" },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "base64data" } },
					],
				},
			]
			const result = limitImagesInConversation(messages)
			expect(result).toEqual(messages)
		})

		it("should return unchanged messages when exactly at limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = []
			// Create exactly 20 images
			for (let i = 0; i < AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION; i++) {
				messages.push({
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: `base64data${i}` } },
					],
				})
			}
			const result = limitImagesInConversation(messages)
			expect(result).toEqual(messages)
			expect(countImagesInConversation(result)).toBe(AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION)
		})

		it("should limit images when over limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = []
			// Create 25 images (5 over limit)
			for (let i = 0; i < 25; i++) {
				messages.push({
					role: "user",
					content: [
						{ type: "text", text: `Message ${i}` },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: `base64data${i}` } },
					],
				})
			}

			const result = limitImagesInConversation(messages)

			// Should have exactly 20 images after limiting
			expect(countImagesInConversation(result)).toBe(AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION)

			// First 5 images should be replaced with text placeholders
			for (let i = 0; i < 5; i++) {
				const content = result[i].content as any[]
				expect(content[1].type).toBe("text")
				expect(content[1].text).toBe("[Image removed due to conversation limit - Browser tool screenshot]")
			}

			// Last 20 images should remain as images
			for (let i = 5; i < 25; i++) {
				const content = result[i].content as any[]
				expect(content[1].type).toBe("image")
				expect(content[1].source.data).toBe(`base64data${i}`)
			}
		})

		it("should preserve text content when limiting images", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "First message" },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "image1" } },
						{ type: "text", text: "More text" },
					],
				},
				{
					role: "user",
					content: [
						{ type: "text", text: "Second message" },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "image2" } },
					],
				},
			]

			const result = limitImagesInConversation(messages, 1) // Limit to 1 image

			// Should have exactly 1 image
			expect(countImagesInConversation(result)).toBe(1)

			// First image should be replaced, text should remain
			const firstContent = result[0].content as any[]
			expect(firstContent[0].type).toBe("text")
			expect(firstContent[0].text).toBe("First message")
			expect(firstContent[1].type).toBe("text")
			expect(firstContent[1].text).toBe("[Image removed due to conversation limit - Browser tool screenshot]")
			expect(firstContent[2].type).toBe("text")
			expect(firstContent[2].text).toBe("More text")

			// Second image should remain
			const secondContent = result[1].content as any[]
			expect(secondContent[0].type).toBe("text")
			expect(secondContent[0].text).toBe("Second message")
			expect(secondContent[1].type).toBe("image")
			expect(secondContent[1].source.data).toBe("image2")
		})

		it("should not mutate original messages", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "image1" } },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "image2" } },
					],
				},
			]

			const originalContent = JSON.parse(JSON.stringify(messages))
			limitImagesInConversation(messages, 1)

			// Original messages should be unchanged
			expect(messages).toEqual(originalContent)
		})

		it("should work with custom limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = []
			// Create 5 images
			for (let i = 0; i < 5; i++) {
				messages.push({
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: `base64data${i}` } },
					],
				})
			}

			const result = limitImagesInConversation(messages, 3) // Limit to 3 images

			// Should have exactly 3 images
			expect(countImagesInConversation(result)).toBe(3)

			// First 2 should be replaced with text
			for (let i = 0; i < 2; i++) {
				const content = result[i].content as any[]
				expect(content[0].type).toBe("text")
				expect(content[0].text).toBe("[Image removed due to conversation limit - Browser tool screenshot]")
			}

			// Last 3 should remain as images
			for (let i = 2; i < 5; i++) {
				const content = result[i].content as any[]
				expect(content[0].type).toBe("image")
				expect(content[0].source.data).toBe(`base64data${i}`)
			}
		})

		it("should handle messages with string content", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Text only message" },
				{
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "image1" } },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "image2" } },
					],
				},
			]

			const result = limitImagesInConversation(messages, 1)

			// Should have exactly 1 image
			expect(countImagesInConversation(result)).toBe(1)

			// String content should remain unchanged
			expect(result[0].content).toBe("Text only message")

			// First image should be replaced, second should remain
			const arrayContent = result[1].content as any[]
			expect(arrayContent[0].type).toBe("text")
			expect(arrayContent[0].text).toBe("[Image removed due to conversation limit - Browser tool screenshot]")
			expect(arrayContent[1].type).toBe("image")
			expect(arrayContent[1].source.data).toBe("image2")
		})
	})

	describe("AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION constant", () => {
		it("should be set to 20", () => {
			expect(AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION).toBe(20)
		})
	})
})
