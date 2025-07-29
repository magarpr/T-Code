// npx vitest run src/api/providers/__tests__/bedrock-image-limiting.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest"
import { Anthropic } from "@anthropic-ai/sdk"
import { AwsBedrockHandler } from "../bedrock"
import { ApiHandlerOptions } from "../../../shared/api"
import { AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION } from "../../transform/image-limiting"

// Valid base64 encoded 1x1 pixel PNG image for testing
const VALID_BASE64_IMAGE =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGAWA0+kgAAAABJRU5ErkJggg=="

// Mock AWS SDK
vi.mock("@aws-sdk/client-bedrock-runtime", () => {
	return {
		BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
			send: vi.fn(),
		})),
		ConverseStreamCommand: vi.fn(),
		ConverseCommand: vi.fn(),
	}
})

// Mock credential providers
vi.mock("@aws-sdk/credential-providers", () => ({
	fromIni: vi.fn().mockReturnValue({
		accessKeyId: "test-access-key",
		secretAccessKey: "test-secret-key",
	}),
}))

describe("AwsBedrockHandler - Image Limiting", () => {
	let handler: AwsBedrockHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			apiModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
			awsAccessKey: "test-access-key",
			awsSecretKey: "test-secret-key",
			awsRegion: "us-east-1",
		}
		handler = new AwsBedrockHandler(mockOptions)
	})

	describe("convertToBedrockConverseMessages with image limiting", () => {
		it("should not modify messages when under image limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Look at this image:" },
						{
							type: "image",
							source: { type: "base64", media_type: "image/png", data: VALID_BASE64_IMAGE },
						},
					],
				},
				{
					role: "user",
					content: [
						{ type: "text", text: "And this one:" },
						{
							type: "image",
							source: { type: "base64", media_type: "image/jpeg", data: VALID_BASE64_IMAGE },
						},
					],
				},
			]

			// Access the private method for testing
			const result = (handler as any).convertToBedrockConverseMessages(messages, "System prompt")

			// Should have 2 messages with images intact
			expect(result.messages).toHaveLength(2)

			// Check that images are preserved
			const firstMessage = result.messages[0]
			const secondMessage = result.messages[1]

			expect(firstMessage.content).toHaveLength(2)
			expect(firstMessage.content[1]).toHaveProperty("image")

			expect(secondMessage.content).toHaveLength(2)
			expect(secondMessage.content[1]).toHaveProperty("image")
		})

		it("should limit images when over AWS Bedrock limit", () => {
			const messages: Anthropic.Messages.MessageParam[] = []

			// Create 25 messages with 1 image each (5 over the limit)
			for (let i = 0; i < 25; i++) {
				messages.push({
					role: "user",
					content: [
						{ type: "text", text: `Browser screenshot ${i + 1}` },
						{
							type: "image",
							source: { type: "base64", media_type: "image/png", data: VALID_BASE64_IMAGE },
						},
					],
				})
			}

			// Access the private method for testing
			const result = (handler as any).convertToBedrockConverseMessages(messages, "System prompt")

			// Should have 25 messages
			expect(result.messages).toHaveLength(25)

			// Count actual images in the result
			let imageCount = 0
			let textPlaceholderCount = 0

			for (const message of result.messages) {
				for (const block of message.content) {
					if (block.image) {
						imageCount++
					} else if (block.text && block.text.includes("[Image removed due to conversation limit")) {
						textPlaceholderCount++
					}
				}
			}

			// Should have exactly 20 images and 5 text placeholders
			expect(imageCount).toBe(AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION)
			expect(textPlaceholderCount).toBe(5)
		})

		it("should preserve text content when limiting images", () => {
			const messages: Anthropic.Messages.MessageParam[] = []

			// Create 22 messages with mixed content (2 over the limit)
			for (let i = 0; i < 22; i++) {
				messages.push({
					role: "user",
					content: [
						{ type: "text", text: `Important context ${i + 1}` },
						{
							type: "image",
							source: { type: "base64", media_type: "image/png", data: VALID_BASE64_IMAGE },
						},
						{ type: "text", text: `Additional info ${i + 1}` },
					],
				})
			}

			// Access the private method for testing
			const result = (handler as any).convertToBedrockConverseMessages(messages, "System prompt")

			// All text content should be preserved
			for (let i = 0; i < 22; i++) {
				const message = result.messages[i]
				expect(message.content[0].text).toBe(`Important context ${i + 1}`)
				expect(message.content[2].text).toBe(`Additional info ${i + 1}`)
			}

			// First 2 messages should have image placeholders
			expect(result.messages[0].content[1].text).toBe(
				"[Image removed due to conversation limit - Browser tool screenshot]",
			)
			expect(result.messages[1].content[1].text).toBe(
				"[Image removed due to conversation limit - Browser tool screenshot]",
			)

			// Remaining messages should have images
			for (let i = 2; i < 22; i++) {
				expect(result.messages[i].content[1]).toHaveProperty("image")
			}
		})

		it("should handle exactly 20 images without modification", () => {
			const messages: Anthropic.Messages.MessageParam[] = []

			// Create exactly 20 messages with 1 image each
			for (let i = 0; i < AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION; i++) {
				messages.push({
					role: "user",
					content: [
						{ type: "text", text: `Message ${i + 1}` },
						{
							type: "image",
							source: { type: "base64", media_type: "image/png", data: VALID_BASE64_IMAGE },
						},
					],
				})
			}

			// Access the private method for testing
			const result = (handler as any).convertToBedrockConverseMessages(messages, "System prompt")

			// Should have 20 messages with all images intact
			expect(result.messages).toHaveLength(20)

			let imageCount = 0
			for (const message of result.messages) {
				for (const block of message.content) {
					if (block.image) {
						imageCount++
					}
				}
			}

			expect(imageCount).toBe(AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION)
		})

		it("should handle mixed message types correctly", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Text only message" },
				{
					role: "assistant",
					content: [{ type: "text", text: "I understand." }],
				},
			]

			// Add 21 image messages to exceed the limit
			for (let i = 0; i < 21; i++) {
				messages.push({
					role: "user",
					content: [
						{
							type: "image",
							source: { type: "base64", media_type: "image/png", data: VALID_BASE64_IMAGE },
						},
					],
				})
			}

			// Access the private method for testing
			const result = (handler as any).convertToBedrockConverseMessages(messages, "System prompt")

			// Should have 23 messages total
			expect(result.messages).toHaveLength(23)

			// First two messages should be unchanged (no images)
			expect(result.messages[0].content[0].text).toBe("Text only message")
			expect(result.messages[1].content[0].text).toBe("I understand.")

			// Count images in the result
			let imageCount = 0
			let placeholderCount = 0

			for (const message of result.messages) {
				for (const block of message.content) {
					if (block.image) {
						imageCount++
					} else if (block.text && block.text.includes("[Image removed due to conversation limit")) {
						placeholderCount++
					}
				}
			}

			// Should have exactly 20 images and 1 placeholder
			expect(imageCount).toBe(20)
			expect(placeholderCount).toBe(1)
		})

		it("should work with system message", () => {
			const messages: Anthropic.Messages.MessageParam[] = []

			// Create 22 messages with images (2 over limit)
			for (let i = 0; i < 22; i++) {
				messages.push({
					role: "user",
					content: [
						{
							type: "image",
							source: { type: "base64", media_type: "image/png", data: VALID_BASE64_IMAGE },
						},
					],
				})
			}

			const systemMessage = "You are a helpful assistant that can analyze images."

			// Access the private method for testing
			const result = (handler as any).convertToBedrockConverseMessages(messages, systemMessage)

			// System message should be preserved
			expect(result.system).toHaveLength(1)
			expect(result.system[0].text).toBe(systemMessage)

			// Should have 22 messages with limited images
			expect(result.messages).toHaveLength(22)

			// Count images
			let imageCount = 0
			for (const message of result.messages) {
				for (const block of message.content) {
					if (block.image) {
						imageCount++
					}
				}
			}

			expect(imageCount).toBe(AWS_BEDROCK_MAX_IMAGES_PER_CONVERSATION)
		})
	})
})
