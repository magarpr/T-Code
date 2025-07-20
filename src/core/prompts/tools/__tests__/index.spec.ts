// npx vitest core/prompts/tools/__tests__/index.spec.ts

import { describe, it, expect } from "vitest"
import { getToolDescriptionsForMode } from "../index"
import { defaultModeSlug } from "../../../../shared/modes"
import { toolNames } from "@roo-code/types"
import { TOOL_GROUPS, ALWAYS_AVAILABLE_TOOLS } from "../../../../shared/tools"

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
			{ disabledTools }, // settings object with disabledTools
		)

		// Check that disabled tools are not included
		expect(result).not.toContain("## read_file")
		expect(result).not.toContain("## write_to_file")

		// Check that other tools are still included
		expect(result).toContain("## list_files")
		expect(result).toContain("## search_files")
	})

	it("should filter out all tools including always-available tools when disabled", () => {
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
			{ disabledTools }, // settings object with disabledTools
		)

		// These tools should be filtered out since we now allow disabling all tools
		expect(result).not.toContain("## ask_followup_question")
		expect(result).not.toContain("## attempt_completion")
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
			{ disabledTools }, // settings object with empty disabledTools
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
			undefined, // no settings
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
			{ disabledTools: undefined }, // settings with undefined disabledTools
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
			undefined, // no settings
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
			{ disabledTools }, // settings object with disabledTools
		)

		// Check that all disabled tools are filtered out
		disabledTools.forEach((tool) => {
			expect(result).not.toContain(`## ${tool}`)
		})

		// Check that some other tools are still included
		expect(result).toContain("# Tools")
		// Other tools that weren't disabled should still be there
		expect(result).toContain("## list_code_definition_names")
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
			{ disabledTools }, // settings object with disabledTools
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
			{ disabledTools }, // settings object with disabledTools
		)

		// execute_command should be filtered out
		expect(result).not.toContain("## execute_command")

		// Other tools should still be included
		expect(result).toContain("## read_file")
		expect(result).toContain("## write_to_file")
	})

	it("should have all tools from packages/types/src/tool.ts represented in TOOL_GROUPS or ALWAYS_AVAILABLE_TOOLS", () => {
		// Get all tools from TOOL_GROUPS
		const toolsInGroups = new Set<string>()
		Object.values(TOOL_GROUPS).forEach((group) => {
			group.tools.forEach((tool) => toolsInGroups.add(tool))
		})

		// Get all tools from ALWAYS_AVAILABLE_TOOLS
		const alwaysAvailableSet = new Set(ALWAYS_AVAILABLE_TOOLS)

		// Combine both sets
		const allRepresentedTools = new Set([...toolsInGroups, ...alwaysAvailableSet])

		// Check that every tool from toolNames is represented
		const missingTools: string[] = []
		toolNames.forEach((toolName) => {
			if (!allRepresentedTools.has(toolName)) {
				missingTools.push(toolName)
			}
		})

		// Assert that there are no missing tools
		expect(missingTools).toEqual([])
	})

	it("should not have tools in TOOL_GROUPS that are not in packages/types/src/tool.ts", () => {
		// Get all tools from TOOL_GROUPS
		const toolsInGroups = new Set<string>()
		Object.values(TOOL_GROUPS).forEach((group) => {
			group.tools.forEach((tool) => toolsInGroups.add(tool))
		})

		// Convert toolNames to a Set for easier lookup
		const validToolNames = new Set(toolNames)

		// Check that every tool in TOOL_GROUPS exists in toolNames
		const invalidTools: string[] = []
		toolsInGroups.forEach((tool) => {
			if (!validToolNames.has(tool as any)) {
				invalidTools.push(tool)
			}
		})

		// Assert that there are no invalid tools
		expect(invalidTools).toEqual([])
	})

	it("should not have tools in ALWAYS_AVAILABLE_TOOLS that are not in packages/types/src/tool.ts", () => {
		// Convert toolNames to a Set for easier lookup
		const validToolNames = new Set(toolNames)

		// Check that every tool in ALWAYS_AVAILABLE_TOOLS exists in toolNames
		const invalidTools: string[] = []
		ALWAYS_AVAILABLE_TOOLS.forEach((tool) => {
			if (!validToolNames.has(tool)) {
				invalidTools.push(tool)
			}
		})

		// Assert that there are no invalid tools
		expect(invalidTools).toEqual([])
	})
})
