import { describe, it, expect } from "vitest"
import { openAiNativeModels } from "../openai.js"

type Dict = Record<string, unknown>
const hasProp = (obj: Dict, key: string) => Object.prototype.hasOwnProperty.call(obj, key)
const boolProp = (obj: Dict, key: string): boolean | undefined => {
	const v = obj[key]
	return typeof v === "boolean" ? (v as boolean) : undefined
}

describe("openAiNativeModels temperature invariants", () => {
	it("models with supportsTemperature === false must not specify defaultTemperature", () => {
		const values = Object.values(openAiNativeModels) as Dict[]
		for (const info of values) {
			const supportsTemp = boolProp(info, "supportsTemperature")
			if (supportsTemp === false) {
				expect(hasProp(info, "defaultTemperature")).toBe(false)
			}
		}
	})

	it("gpt-5 family models must have supportsTemperature: false and no defaultTemperature", () => {
		const gpt5Ids = ["gpt-5-2025-08-07", "gpt-5-mini-2025-08-07", "gpt-5-nano-2025-08-07"] as const
		for (const id of gpt5Ids) {
			// Non-undefined assertion is safe here because the IDs are known keys in openAiNativeModels
			const infoUnknown = (openAiNativeModels as Record<string, unknown>)[id]!
			const info = infoUnknown as Dict
			expect(info).toBeDefined()
			expect(boolProp(info, "supportsTemperature")).toBe(false)
			expect(hasProp(info, "defaultTemperature")).toBe(false)
		}
	})
})
