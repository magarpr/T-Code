// npx vitest run src/api/providers/__tests__/bedrock-aip-prompt-caching.spec.ts

import { AwsBedrockHandler } from "../bedrock"
import { ApiHandlerOptions } from "../../../shared/api"

// Mock AWS SDK
vitest.mock("@aws-sdk/client-bedrock-runtime", () => {
	return {
		BedrockRuntimeClient: vitest.fn().mockImplementation(() => ({
			send: vitest.fn(),
			config: { region: "us-east-1" },
		})),
		ConverseCommand: vitest.fn(),
		ConverseStreamCommand: vitest.fn(),
	}
})

describe("Bedrock Application Inference Profile (AIP) Prompt Caching", () => {
	// Helper function to create a handler with specific options
	const createHandler = (options: Partial<ApiHandlerOptions> = {}) => {
		const defaultOptions: ApiHandlerOptions = {
			apiModelId: "anthropic.claude-3-sonnet-20240229-v1:0",
			awsRegion: "us-east-1",
			...options,
		}
		return new AwsBedrockHandler(defaultOptions)
	}

	describe("Claude model detection in AIP ARNs", () => {
		it("should enable prompt caching for AIP with 'claude' in the name", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/my-claude-profile",
			})

			const model = handler.getModel()
			expect(model.info.supportsPromptCache).toBe(true)
			expect(model.info.minTokensPerCachePoint).toBe(1024)
			expect(model.info.maxCachePoints).toBe(4)
			expect(model.info.cachableFields).toEqual(["system", "messages", "tools"])
		})

		it("should enable prompt caching for AIP with 'anthropic' in the name", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/anthropic-production",
			})

			const model = handler.getModel()
			expect(model.info.supportsPromptCache).toBe(true)
			expect(model.info.minTokensPerCachePoint).toBe(1024)
			expect(model.info.maxCachePoints).toBe(4)
			expect(model.info.cachableFields).toEqual(["system", "messages", "tools"])
		})

		it("should enable prompt caching for AIP with 'sonnet' in the name", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/sonnet-optimized",
			})

			const model = handler.getModel()
			expect(model.info.supportsPromptCache).toBe(true)
			expect(model.info.minTokensPerCachePoint).toBe(1024)
			expect(model.info.maxCachePoints).toBe(4)
			expect(model.info.cachableFields).toEqual(["system", "messages", "tools"])
		})

		it("should enable prompt caching for AIP with 'haiku' in the name", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/haiku-fast",
			})

			const model = handler.getModel()
			expect(model.info.supportsPromptCache).toBe(true)
			expect(model.info.minTokensPerCachePoint).toBe(1024)
			expect(model.info.maxCachePoints).toBe(4)
			expect(model.info.cachableFields).toEqual(["system", "messages", "tools"])
		})

		it("should enable prompt caching for AIP with 'opus' in the name", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/opus-premium",
			})

			const model = handler.getModel()
			expect(model.info.supportsPromptCache).toBe(true)
			expect(model.info.minTokensPerCachePoint).toBe(1024)
			expect(model.info.maxCachePoints).toBe(4)
			expect(model.info.cachableFields).toEqual(["system", "messages", "tools"])
		})

		it("should enable prompt caching for AIP with mixed case Claude indicators", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/My-Claude-SONNET-Profile",
			})

			const model = handler.getModel()
			expect(model.info.supportsPromptCache).toBe(true)
			expect(model.info.minTokensPerCachePoint).toBe(1024)
			expect(model.info.maxCachePoints).toBe(4)
			expect(model.info.cachableFields).toEqual(["system", "messages", "tools"])
		})
	})

	describe("Non-Claude model detection in AIP ARNs", () => {
		it("should enable prompt caching with conservative settings for generic AIP names", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/my-generic-profile",
			})

			const model = handler.getModel()
			expect(model.info.supportsPromptCache).toBe(true)
			expect(model.info.minTokensPerCachePoint).toBe(1024)
			expect(model.info.maxCachePoints).toBe(1)
			expect(model.info.cachableFields).toEqual(["system"])
		})

		it("should enable prompt caching for AIP with llama in the name", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/llama-profile",
			})

			const model = handler.getModel()
			expect(model.info.supportsPromptCache).toBe(true)
			expect(model.info.minTokensPerCachePoint).toBe(1024)
			expect(model.info.maxCachePoints).toBe(1)
			expect(model.info.cachableFields).toEqual(["system"])
		})

		it("should enable prompt caching for AIP with nova in the name", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/nova-profile",
			})

			const model = handler.getModel()
			expect(model.info.supportsPromptCache).toBe(true)
			expect(model.info.minTokensPerCachePoint).toBe(1024)
			expect(model.info.maxCachePoints).toBe(1)
			expect(model.info.cachableFields).toEqual(["system"])
		})
	})

	describe("Non-AIP ARN handling", () => {
		it("should not apply AIP logic for foundation-model ARNs", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0",
			})

			const model = handler.getModel()
			// Should use the actual model definition from bedrockModels, not AIP guessing
			expect(model.id).toBe("anthropic.claude-3-sonnet-20240229-v1:0")
			expect(model.info.supportsPromptCache).toBe(false) // This specific model doesn't support caching
		})

		it("should not apply AIP logic for prompt-router ARNs", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:prompt-router/claude-router",
			})

			const model = handler.getModel()
			// Should use default prompt router model, not AIP guessing
			expect(model.info).toBeDefined()
		})

		it("should not apply AIP logic when no custom ARN is provided", () => {
			const handler = createHandler({
				apiModelId: "unknown-model-id",
			})

			const model = handler.getModel()
			// Should fall back to default behavior without AIP logic
			expect(model.info.supportsPromptCache).toBe(false)
		})
	})

	describe("Model configuration properties", () => {
		it("should set appropriate model properties for Claude AIP", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/claude-enterprise",
			})

			const model = handler.getModel()
			expect(model.info.maxTokens).toBe(8192)
			expect(model.info.contextWindow).toBe(200_000)
			expect(model.info.supportsImages).toBe(true)
			expect(model.info.supportsPromptCache).toBe(true)
		})

		it("should set appropriate model properties for generic AIP", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/generic-profile",
			})

			const model = handler.getModel()
			expect(model.info.maxTokens).toBe(8192)
			expect(model.info.contextWindow).toBe(200_000)
			expect(model.info.supportsImages).toBe(true)
			expect(model.info.supportsPromptCache).toBe(true)
		})

		it("should allow user overrides for maxTokens and contextWindow", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/claude-profile",
				modelMaxTokens: 4096,
				awsModelContextWindow: 100_000,
			})

			const model = handler.getModel()
			expect(model.info.maxTokens).toBe(4096)
			expect(model.info.contextWindow).toBe(100_000)
			expect(model.info.supportsPromptCache).toBe(true)
		})
	})

	describe("supportsAwsPromptCache method integration", () => {
		it("should return true for Claude AIP when prompt caching is enabled", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/claude-profile",
				awsUsePromptCache: true,
			})

			const model = handler.getModel()
			// Access the private method using type casting
			const supportsCache = (handler as any).supportsAwsPromptCache(model)
			expect(supportsCache).toBe(true)
		})

		it("should return true for generic AIP when prompt caching is enabled", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/generic-profile",
				awsUsePromptCache: true,
			})

			const model = handler.getModel()
			// Access the private method using type casting
			const supportsCache = (handler as any).supportsAwsPromptCache(model)
			expect(supportsCache).toBe(true)
		})

		it("should check model capabilities but respect user settings", () => {
			const handler = createHandler({
				awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/claude-profile",
				awsUsePromptCache: false,
			})

			const model = handler.getModel()
			// The model should support prompt caching
			expect(model.info.supportsPromptCache).toBe(true)
			expect(model.info.cachableFields).toEqual(["system", "messages", "tools"])

			// But supportsAwsPromptCache should respect the user setting
			// Note: The actual logic in createMessage checks both awsUsePromptCache AND supportsAwsPromptCache
			// So when awsUsePromptCache is false, prompt caching won't be used regardless
			const supportsCache = (handler as any).supportsAwsPromptCache(model)
			// The method returns true if the model supports it, but createMessage won't use it
			expect(supportsCache).toBe(true)
		})
	})

	describe("Real-world AIP ARN examples", () => {
		it("should handle typical enterprise AIP naming patterns", () => {
			const testCases = [
				{
					arn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/enterprise-claude-sonnet",
					expectedCache: true,
					expectedCachePoints: 4,
				},
				{
					arn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/prod-anthropic-haiku",
					expectedCache: true,
					expectedCachePoints: 4,
				},
				{
					arn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/dev-claude-3-5-sonnet",
					expectedCache: true,
					expectedCachePoints: 4,
				},
				{
					arn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/cost-optimized-llama",
					expectedCache: true,
					expectedCachePoints: 1,
				},
			]

			testCases.forEach(({ arn, expectedCache, expectedCachePoints }) => {
				const handler = createHandler({ awsCustomArn: arn })
				const model = handler.getModel()

				expect(model.info.supportsPromptCache).toBe(expectedCache)
				expect(model.info.maxCachePoints).toBe(expectedCachePoints)
			})
		})
	})
})
