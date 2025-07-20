// npx vitest core/prompts/tools/__tests__/index.spec.ts

import { describe, it, expect } from "vitest"
import { getToolDescriptionsForMode } from "../index"
import { defaultModeSlug } from "../../../../shared/modes"

describe("getToolDescriptionsForMode", () => {
	const mockCwd = "/test/path"
	const supportsComputerUse = false

	it("should return tool descriptions for a given mode", () => {
		const result = getToolDescriptionsForMode(
			defaultModeSlug,
			mockCwd,
			supportsComputerUse,
			undefined, // codeIndexManager
			undefined, // diffStrategy
			undefined, // browserViewportSize
			undefined, // mcpHub
			undefined, // customModes
			undefined, // experiments
			undefined, // partialReadsEnabled
			undefined, // settings
			undefined, // disabledTools
		)

		expect(result).toBeTruthy()
		expect(result).toContain("# Tools")

		// Check that it includes some expected tools from architect mode
		expect(result).toContain("read_file")
		expect(result).toContain("write_to_file")
		expect(result).toContain("list_files")
		// Note: execute_command is not in architect mode
	})

	it("should filter out disabled tools", () => {
		const disabledTools = ["read_file", "write_to_file"]
		const result = getToolDescriptionsForMode(
			defaultModeSlug,
			mockCwd,
			supportsComputerUse,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			disabledTools,
		)

		// Check that disabled tools are not included
		expect(result).not.toContain("## read_file")
		expect(result).not.toContain("## write_to_file")

		// Check that other tools are still included
		expect(result).toContain("## list_files")
		expect(result).toContain("## search_files")
	})

	it("should not filter out always-available tools even if disabled", () => {
		const disabledTools = ["ask_followup_question", "attempt_completion"]
		const result = getToolDescriptionsForMode(
			defaultModeSlug,
			mockCwd,
			supportsComputerUse,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			disabledTools,
		)

		// These tools should always be available
		expect(result).toContain("## ask_followup_question")
		expect(result).toContain("## attempt_completion")
	})

	it("should handle empty disabled tools array", () => {
		const disabledTools: string[] = []
		const resultWithEmpty = getToolDescriptionsForMode(
			defaultModeSlug,
			mockCwd,
			supportsComputerUse,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			disabledTools,
		)
		const resultWithoutDisabled = getToolDescriptionsForMode(
			defaultModeSlug,
			mockCwd,
			supportsComputerUse,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		)

		// Should return the same tools
		expect(resultWithEmpty).toEqual(resultWithoutDisabled)
	})

	it("should handle undefined disabled tools", () => {
		const resultWithUndefined = getToolDescriptionsForMode(
			defaultModeSlug,
			mockCwd,
			supportsComputerUse,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		)
		const resultWithoutDisabled = getToolDescriptionsForMode(
			defaultModeSlug,
			mockCwd,
			supportsComputerUse,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		)

		// Should return the same tools
		expect(resultWithUndefined).toEqual(resultWithoutDisabled)
	})

	it("should filter out multiple disabled tools correctly", () => {
		const disabledTools = ["read_file", "write_to_file", "list_files", "search_files"]
		const result = getToolDescriptionsForMode(
			defaultModeSlug,
			mockCwd,
			supportsComputerUse,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			disabledTools,
		)

		// Check that all disabled tools are filtered out
		disabledTools.forEach((tool) => {
			expect(result).not.toContain(`## ${tool}`)
		})

		// Check that some other tools are still included
		expect(result).toContain("# Tools")
		// Always available tools should still be there
		expect(result).toContain("## ask_followup_question")
	})

	it("should handle invalid tool names in disabled list", () => {
		const disabledTools = ["invalid_tool", "another_invalid", "read_file"]
		const result = getToolDescriptionsForMode(
			defaultModeSlug,
			mockCwd,
			supportsComputerUse,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			disabledTools,
		)

		// Should still filter out valid disabled tools
		expect(result).not.toContain("## read_file")

		// Invalid tools should not affect the result
		expect(result).toContain("## write_to_file")
		expect(result).toContain("## list_files")
	})

	it("should work with code mode that has execute_command", () => {
		const disabledTools = ["execute_command"]
		const result = getToolDescriptionsForMode(
			"code", // code mode has the command group
			mockCwd,
			supportsComputerUse,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			disabledTools,
		)

		// execute_command should be filtered out
		expect(result).not.toContain("## execute_command")

		// Other tools should still be included
		expect(result).toContain("## read_file")
		expect(result).toContain("## write_to_file")
	})
})
