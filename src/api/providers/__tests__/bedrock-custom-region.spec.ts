import { describe, it, expect, vi, beforeEach } from "vitest"
import { AwsBedrockHandler } from "../bedrock"
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime"

// Mock the AWS SDK
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
	BedrockRuntimeClient: vi.fn().mockImplementation((config) => ({
		config,
		send: vi.fn(),
	})),
	ConverseCommand: vi.fn(),
	ConverseStreamCommand: vi.fn(),
}))

describe("AwsBedrockHandler - Custom Region Support", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should use custom region when awsRegion is 'custom' and awsCustomRegion is provided", () => {
		const handler = new AwsBedrockHandler({
			apiProvider: "bedrock",
			apiModelId: "anthropic.claude-3-sonnet-20240229-v1:0",
			awsAccessKey: "test-access-key",
			awsSecretKey: "test-secret-key",
			awsRegion: "custom",
			awsCustomRegion: "us-west-3",
		})

		// Get the mock instance to check the config
		const mockClientInstance = vi.mocked(BedrockRuntimeClient).mock.results[0]?.value
		expect(mockClientInstance.config.region).toBe("us-west-3")
	})

	it("should use standard region when awsRegion is not 'custom'", () => {
		const handler = new AwsBedrockHandler({
			apiProvider: "bedrock",
			apiModelId: "anthropic.claude-3-sonnet-20240229-v1:0",
			awsAccessKey: "test-access-key",
			awsSecretKey: "test-secret-key",
			awsRegion: "us-east-1",
			awsCustomRegion: "us-west-3", // This should be ignored
		})

		// Get the mock instance to check the config
		const mockClientInstance = vi.mocked(BedrockRuntimeClient).mock.results[0]?.value
		expect(mockClientInstance.config.region).toBe("us-east-1")
	})

	it("should use awsRegion when awsCustomRegion is not provided", () => {
		const handler = new AwsBedrockHandler({
			apiProvider: "bedrock",
			apiModelId: "anthropic.claude-3-sonnet-20240229-v1:0",
			awsAccessKey: "test-access-key",
			awsSecretKey: "test-secret-key",
			awsRegion: "custom",
			// awsCustomRegion is not provided
		})

		// Get the mock instance to check the config
		const mockClientInstance = vi.mocked(BedrockRuntimeClient).mock.results[0]?.value
		expect(mockClientInstance.config.region).toBe("custom")
	})

	it("should use custom region for cross-region inference prefix calculation", () => {
		const handler = new AwsBedrockHandler({
			apiProvider: "bedrock",
			apiModelId: "anthropic.claude-3-sonnet-20240229-v1:0",
			awsAccessKey: "test-access-key",
			awsSecretKey: "test-secret-key",
			awsRegion: "custom",
			awsCustomRegion: "us-west-3",
			awsUseCrossRegionInference: true,
		})

		const model = handler.getModel()
		// Should have the us. prefix for us-west-3
		expect(model.id).toContain("us.")
	})

	it("should handle custom regions with different prefixes for cross-region inference", () => {
		const testCases = [
			{ customRegion: "eu-central-3", expectedPrefix: "eu." },
			{ customRegion: "ap-southeast-4", expectedPrefix: "apac." },
			{ customRegion: "ca-west-1", expectedPrefix: "ca." },
			{ customRegion: "sa-east-2", expectedPrefix: "sa." },
			{ customRegion: "us-gov-west-2", expectedPrefix: "ug." },
		]

		for (const { customRegion, expectedPrefix } of testCases) {
			vi.clearAllMocks()

			const handler = new AwsBedrockHandler({
				apiProvider: "bedrock",
				apiModelId: "anthropic.claude-3-sonnet-20240229-v1:0",
				awsAccessKey: "test-access-key",
				awsSecretKey: "test-secret-key",
				awsRegion: "custom",
				awsCustomRegion: customRegion,
				awsUseCrossRegionInference: true,
			})

			const model = handler.getModel()
			expect(model.id).toContain(expectedPrefix)
		}
	})
})
