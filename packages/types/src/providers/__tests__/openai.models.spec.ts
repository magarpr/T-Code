import { describe, it, expect } from "vitest"
import { openAiNativeModels } from "../openai.js"

describe("openAiNativeModels temperature invariants", () => {
	it("models with supportsTemperature === false must not specify defaultTemperature", () => {
		for (const [id, info] of Object.entries(openAiNativeModels)) {
			if ((info as any).supportsTemperature === false) {
				expect((info as any).defaultTemperature).toBeUndefined()
			}
		}
	})

	it("gpt-5 family models must have supportsTemperature: false and no defaultTemperature", () => {
		const gpt5Ids = ["gpt-5-2025-08-07", "gpt-5-mini-2025-08-07", "gpt-5-nano-2025-08-07"]
		for (const id of gpt5Ids) {
			const info = (openAiNativeModels as any)[id]
			expect(info).toBeDefined()
			expect(info.supportsTemperature).toBe(false)
			expect(info.defaultTemperature).toBeUndefined()
		}
	})
})
