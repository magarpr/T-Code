import fs from "fs/promises"
import path from "path"
import * as yaml from "yaml"

import type { SmartRule, SmartRuleFile } from "../types/smart-rules"
import { getRooDirectoriesForCwd } from "../../../services/roo-config"
import { logger } from "../../../utils/logging"

/**
 * Check if a directory exists
 */
async function directoryExists(dirPath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(dirPath)
		return stats.isDirectory()
	} catch (err) {
		return false
	}
}

/**
 * Parse YAML frontmatter from a markdown file
 * @param content The file content
 * @returns Object containing frontmatter data and markdown content
 */
function parseFrontmatter(content: string): { frontmatter: SmartRuleFile | null; markdown: string } {
	const lines = content.split("\n")

	// Check if file starts with frontmatter delimiter
	if (lines[0] !== "---") {
		return { frontmatter: null, markdown: content }
	}

	// Find the closing delimiter
	let endIndex = -1
	for (let i = 1; i < lines.length; i++) {
		if (lines[i] === "---") {
			endIndex = i
			break
		}
	}

	// No closing delimiter found
	if (endIndex === -1) {
		return { frontmatter: null, markdown: content }
	}

	// Extract and parse frontmatter
	const frontmatterContent = lines.slice(1, endIndex).join("\n")
	const markdownContent = lines
		.slice(endIndex + 1)
		.join("\n")
		.trim()

	try {
		const frontmatter = yaml.parse(frontmatterContent) as SmartRuleFile
		return { frontmatter, markdown: markdownContent }
	} catch (error) {
		logger.error("Failed to parse frontmatter", { error })
		return { frontmatter: null, markdown: content }
	}
}

/**
 * Load a smart rule from a file
 * @param filePath The path to the rule file
 * @returns The parsed smart rule or null if invalid
 */
async function loadSmartRuleFromFile(filePath: string): Promise<SmartRule | null> {
	try {
		const content = await fs.readFile(filePath, "utf-8")
		const { frontmatter, markdown } = parseFrontmatter(content)

		// Skip files without frontmatter or use-when field
		if (!frontmatter || !frontmatter["use-when"]) {
			return null
		}

		const filename = path.basename(filePath)

		return {
			filename,
			useWhen: frontmatter["use-when"],
			content: markdown,
			priority: frontmatter.priority,
			dependencies: frontmatter.dependencies,
			metadata: Object.fromEntries(
				Object.entries(frontmatter).filter(([key]) => !["use-when", "priority", "dependencies"].includes(key)),
			),
		}
	} catch (error) {
		logger.error("Failed to load smart rule from file", { filePath, error })
		return null
	}
}

/**
 * Recursively load smart rules from a directory
 * @param dirPath The directory path
 * @returns Array of loaded smart rules
 */
async function loadSmartRulesFromDirectory(dirPath: string): Promise<SmartRule[]> {
	const rules: SmartRule[] = []

	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true })

		for (const entry of entries) {
			const fullPath = path.join(dirPath, entry.name)

			if (entry.isDirectory()) {
				// Recursively load from subdirectories
				const subRules = await loadSmartRulesFromDirectory(fullPath)
				rules.push(...subRules)
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				// Load rule from markdown file
				const rule = await loadSmartRuleFromFile(fullPath)
				if (rule) {
					rules.push(rule)
				}
			}
		}
	} catch (error) {
		logger.error("Failed to load smart rules from directory", { dirPath, error })
	}

	return rules
}

/**
 * Load all smart rules from the appropriate directories
 * @param cwd The current working directory
 * @param mode The current mode (optional, for mode-specific smart rules)
 * @returns Array of all loaded smart rules
 */
export async function loadSmartRules(cwd: string, mode?: string): Promise<SmartRule[]> {
	const allRules: SmartRule[] = []
	const rooDirectories = getRooDirectoriesForCwd(cwd)

	// Load global and project smart rules
	for (const rooDir of rooDirectories) {
		const smartRulesDir = path.join(rooDir, "smart-rules")
		if (await directoryExists(smartRulesDir)) {
			const rules = await loadSmartRulesFromDirectory(smartRulesDir)
			allRules.push(...rules)
		}
	}

	// Load mode-specific smart rules if mode is provided
	if (mode) {
		for (const rooDir of rooDirectories) {
			const modeSmartRulesDir = path.join(rooDir, `smart-rules-${mode}`)
			if (await directoryExists(modeSmartRulesDir)) {
				const rules = await loadSmartRulesFromDirectory(modeSmartRulesDir)
				allRules.push(...rules)
			}
		}
	}

	// Sort by priority (higher priority first) and then by filename for stability
	allRules.sort((a, b) => {
		const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0)
		if (priorityDiff !== 0) return priorityDiff
		return a.filename.localeCompare(b.filename)
	})

	return allRules
}

/**
 * Check if smart rules are available for the current context
 * @param cwd The current working directory
 * @param mode The current mode (optional)
 * @returns True if any smart rules exist
 */
export async function hasSmartRules(cwd: string, mode?: string): Promise<boolean> {
	const rooDirectories = getRooDirectoriesForCwd(cwd)

	// Check for general smart rules
	for (const rooDir of rooDirectories) {
		const smartRulesDir = path.join(rooDir, "smart-rules")
		if (await directoryExists(smartRulesDir)) {
			const entries = await fs.readdir(smartRulesDir, { withFileTypes: true })
			if (entries.some((e) => e.isFile() && e.name.endsWith(".md"))) {
				return true
			}
		}
	}

	// Check for mode-specific smart rules
	if (mode) {
		for (const rooDir of rooDirectories) {
			const modeSmartRulesDir = path.join(rooDir, `smart-rules-${mode}`)
			if (await directoryExists(modeSmartRulesDir)) {
				const entries = await fs.readdir(modeSmartRulesDir, { withFileTypes: true })
				if (entries.some((e) => e.isFile() && e.name.endsWith(".md"))) {
					return true
				}
			}
		}
	}

	return false
}
