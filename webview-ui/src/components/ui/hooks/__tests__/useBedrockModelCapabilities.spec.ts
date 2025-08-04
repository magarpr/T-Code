import { renderHook, act } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { useBedrockModelCapabilities } from "../useBedrockModelCapabilities"
import { vscode } from "../../../../utils/vscode"

// Mock vscode
vi.mock("../../../../utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

describe("useBedrockModelCapabilities", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should return undefined when no customArn is provided", () => {
		const { result } = renderHook(() => useBedrockModelCapabilities())
		expect(result.current).toBeUndefined()
		expect(vscode.postMessage).not.toHaveBeenCalled()
	})

	it("should request capabilities when customArn is provided", () => {
		const customArn = "arn:aws:bedrock:us-east-1:123456789012:inference-profile/test-model"
		renderHook(() => useBedrockModelCapabilities(customArn))

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "requestBedrockModelCapabilities",
			values: { customArn },
		})
	})

	it("should update capabilities when receiving a successful response", () => {
		const customArn = "arn:aws:bedrock:us-east-1:123456789012:inference-profile/test-model"
		const { result } = renderHook(() => useBedrockModelCapabilities(customArn))

		const mockCapabilities = {
			maxTokens: 8192,
			contextWindow: 200000,
			supportsPromptCache: true,
			supportsImages: true,
		}

		act(() => {
			const event = new MessageEvent("message", {
				data: {
					type: "bedrockModelCapabilities",
					values: {
						customArn,
						modelInfo: mockCapabilities,
					},
				},
			})
			window.dispatchEvent(event)
		})

		expect(result.current).toEqual(mockCapabilities)
	})

	it("should handle error responses gracefully", () => {
		const customArn = "arn:aws:bedrock:us-east-1:123456789012:inference-profile/test-model"
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		const { result } = renderHook(() => useBedrockModelCapabilities(customArn))

		act(() => {
			const event = new MessageEvent("message", {
				data: {
					type: "bedrockModelCapabilities",
					values: {
						customArn,
						error: "Failed to parse ARN",
					},
				},
			})
			window.dispatchEvent(event)
		})

		expect(result.current).toBeUndefined()
		expect(consoleSpy).toHaveBeenCalledWith("Error fetching Bedrock model capabilities:", "Failed to parse ARN")

		consoleSpy.mockRestore()
	})

	it("should ignore responses for different ARNs", () => {
		const customArn = "arn:aws:bedrock:us-east-1:123456789012:inference-profile/test-model"
		const { result } = renderHook(() => useBedrockModelCapabilities(customArn))

		act(() => {
			const event = new MessageEvent("message", {
				data: {
					type: "bedrockModelCapabilities",
					values: {
						customArn: "different-arn",
						modelInfo: { maxTokens: 1000 },
					},
				},
			})
			window.dispatchEvent(event)
		})

		expect(result.current).toBeUndefined()
	})

	it("should clean up event listener on unmount", () => {
		const customArn = "arn:aws:bedrock:us-east-1:123456789012:inference-profile/test-model"
		const removeEventListenerSpy = vi.spyOn(window, "removeEventListener")
		const { unmount } = renderHook(() => useBedrockModelCapabilities(customArn))

		unmount()

		expect(removeEventListenerSpy).toHaveBeenCalledWith("message", expect.any(Function))
		removeEventListenerSpy.mockRestore()
	})

	it("should request new capabilities when customArn changes", () => {
		const { rerender } = renderHook(({ arn }) => useBedrockModelCapabilities(arn), {
			initialProps: { arn: "arn1" },
		})

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "requestBedrockModelCapabilities",
			values: { customArn: "arn1" },
		})

		rerender({ arn: "arn2" })

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "requestBedrockModelCapabilities",
			values: { customArn: "arn2" },
		})

		expect(vscode.postMessage).toHaveBeenCalledTimes(2)
	})
})
