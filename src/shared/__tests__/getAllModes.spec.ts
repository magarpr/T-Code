// npx vitest run shared/__tests__/getAllModes.spec.ts

import { describe, it, expect } from "vitest"
import { getAllModes } from "../modes"
import { DEFAULT_MODES, type ModeConfig } from "@roo-code/types"

describe("getAllModes", () => {
	const customModes: ModeConfig[] = [
		{
			slug: "custom-mode-1",
			name: "Custom Mode 1",
			roleDefinition: "Custom role 1",
			groups: ["read", "edit"],
		},
		{
			slug: "custom-mode-2",
			name: "Custom Mode 2",
			roleDefinition: "Custom role 2",
			groups: ["read"],
		},
	]

	describe("without hiddenDefaultModes", () => {
		it("returns all default modes and custom modes", () => {
			const result = getAllModes(customModes)

			// Should include all default modes
			DEFAULT_MODES.forEach((defaultMode) => {
				expect(result).toContainEqual(
					expect.objectContaining({
						slug: defaultMode.slug,
						name: defaultMode.name,
					}),
				)
			})

			// Should include all custom modes
			customModes.forEach((customMode) => {
				expect(result).toContainEqual(
					expect.objectContaining({
						slug: customMode.slug,
						name: customMode.name,
					}),
				)
			})

			// Total should be default modes + custom modes
			expect(result).toHaveLength(DEFAULT_MODES.length + customModes.length)
		})

		it("returns only default modes when no custom modes provided", () => {
			const result = getAllModes()

			expect(result).toHaveLength(DEFAULT_MODES.length)
			DEFAULT_MODES.forEach((defaultMode) => {
				expect(result).toContainEqual(
					expect.objectContaining({
						slug: defaultMode.slug,
						name: defaultMode.name,
					}),
				)
			})
		})
	})

	describe("with hiddenDefaultModes", () => {
		it("filters out hidden default modes", () => {
			const hiddenModes = ["code", "debug"]
			const result = getAllModes(customModes, hiddenModes)

			// Should not include hidden modes
			hiddenModes.forEach((hiddenSlug) => {
				expect(result).not.toContainEqual(
					expect.objectContaining({
						slug: hiddenSlug,
					}),
				)
			})

			// Should include non-hidden default modes
			DEFAULT_MODES.filter((mode) => !hiddenModes.includes(mode.slug)).forEach((defaultMode) => {
				expect(result).toContainEqual(
					expect.objectContaining({
						slug: defaultMode.slug,
						name: defaultMode.name,
					}),
				)
			})

			// Should include all custom modes
			customModes.forEach((customMode) => {
				expect(result).toContainEqual(
					expect.objectContaining({
						slug: customMode.slug,
						name: customMode.name,
					}),
				)
			})

			// Total should be (default modes - hidden modes) + custom modes
			expect(result).toHaveLength(DEFAULT_MODES.length - hiddenModes.length + customModes.length)
		})

		it("filters out all default modes when all are hidden", () => {
			const allDefaultSlugs = DEFAULT_MODES.map((mode) => mode.slug)
			const result = getAllModes(customModes, allDefaultSlugs)

			// Should not include any default modes
			DEFAULT_MODES.forEach((defaultMode) => {
				expect(result).not.toContainEqual(
					expect.objectContaining({
						slug: defaultMode.slug,
					}),
				)
			})

			// Should only include custom modes
			expect(result).toHaveLength(customModes.length)
			customModes.forEach((customMode) => {
				expect(result).toContainEqual(
					expect.objectContaining({
						slug: customMode.slug,
						name: customMode.name,
					}),
				)
			})
		})

		it("handles empty hiddenDefaultModes array", () => {
			const result = getAllModes(customModes, [])

			// Should include all modes (same as no filter)
			expect(result).toHaveLength(DEFAULT_MODES.length + customModes.length)
		})

		it("ignores non-existent mode slugs in hiddenDefaultModes", () => {
			const hiddenModes = ["non-existent-mode", "code"]
			const result = getAllModes(customModes, hiddenModes)

			// Should only filter out 'code' which exists
			expect(result).not.toContainEqual(
				expect.objectContaining({
					slug: "code",
				}),
			)

			// Should still have all other modes
			expect(result).toHaveLength(DEFAULT_MODES.length - 1 + customModes.length)
		})

		it("does not filter custom modes even if their slugs are in hiddenDefaultModes", () => {
			const customModesWithDefaultSlug: ModeConfig[] = [
				{
					slug: "code", // Same slug as a default mode
					name: "Custom Code Mode",
					roleDefinition: "Custom code role",
					groups: ["read", "edit"],
				},
			]

			const hiddenModes = ["code"]
			const result = getAllModes(customModesWithDefaultSlug, hiddenModes)

			// Should not include the default 'code' mode
			const defaultCodeMode = DEFAULT_MODES.find((m) => m.slug === "code")
			expect(result).not.toContainEqual(
				expect.objectContaining({
					slug: "code",
					name: defaultCodeMode?.name,
				}),
			)

			// Should include the custom 'code' mode
			expect(result).toContainEqual(
				expect.objectContaining({
					slug: "code",
					name: "Custom Code Mode",
				}),
			)
		})
	})

	describe("mode ordering", () => {
		it("maintains order with default modes first, then custom modes", () => {
			const result = getAllModes(customModes)

			// First modes should be default modes
			const defaultModeCount = DEFAULT_MODES.length
			result.slice(0, defaultModeCount).forEach((mode, index) => {
				expect(mode.slug).toBe(DEFAULT_MODES[index].slug)
			})

			// Remaining modes should be custom modes
			result.slice(defaultModeCount).forEach((mode, index) => {
				expect(mode.slug).toBe(customModes[index].slug)
			})
		})

		it("maintains order when filtering hidden modes", () => {
			const hiddenModes = ["code", "ask"]
			const result = getAllModes(customModes, hiddenModes)

			// Get expected default modes (non-hidden)
			const expectedDefaultModes = DEFAULT_MODES.filter((m) => !hiddenModes.includes(m.slug))

			// First modes should be non-hidden default modes in original order
			result.slice(0, expectedDefaultModes.length).forEach((mode, index) => {
				expect(mode.slug).toBe(expectedDefaultModes[index].slug)
			})

			// Remaining modes should be custom modes
			result.slice(expectedDefaultModes.length).forEach((mode, index) => {
				expect(mode.slug).toBe(customModes[index].slug)
			})
		})
	})
})
