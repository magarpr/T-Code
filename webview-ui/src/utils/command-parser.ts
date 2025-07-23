import { parse } from "shell-quote"

type ShellToken = string | { op: string } | { command: string }

/**
 * Shared command parsing utility that consolidates parsing logic
 * from both command-validation.ts and commandPatterns.ts
 */

/**
 * Parse a command string and handle special cases like subshells,
 * redirections, and quoted strings.
 *
 * @param command - The command string to parse
 * @returns Object containing parsed information
 */
export function parseCommandString(command: string): {
	subCommands: string[]
	hasSubshells: boolean
	subshellCommands: string[]
} {
	if (!command?.trim()) {
		return {
			subCommands: [],
			hasSubshells: false,
			subshellCommands: [],
		}
	}

	// Storage for replaced content
	const redirections: string[] = []
	const subshells: string[] = []
	const quotes: string[] = []
	const arrayIndexing: string[] = []

	// First handle PowerShell redirections by temporarily replacing them
	let processedCommand = command.replace(/\d*>&\d*/g, (match) => {
		redirections.push(match)
		return `__REDIR_${redirections.length - 1}__`
	})

	// Handle array indexing expressions: ${array[...]} pattern and partial expressions
	processedCommand = processedCommand.replace(/\$\{[^}]*\[[^\]]*(\]([^}]*\})?)?/g, (match) => {
		arrayIndexing.push(match)
		return `__ARRAY_${arrayIndexing.length - 1}__`
	})

	// Then handle subshell commands - store them for security analysis
	const hasSubshells = command.includes("$(") || command.includes("`")

	processedCommand = processedCommand
		.replace(/\$\((.*?)\)/g, (_, inner) => {
			const trimmedInner = inner.trim()
			subshells.push(trimmedInner)
			return `__SUBSH_${subshells.length - 1}__`
		})
		.replace(/`(.*?)`/g, (_, inner) => {
			const trimmedInner = inner.trim()
			subshells.push(trimmedInner)
			return `__SUBSH_${subshells.length - 1}__`
		})

	// Then handle quoted strings
	processedCommand = processedCommand.replace(/"[^"]*"/g, (match) => {
		quotes.push(match)
		return `__QUOTE_${quotes.length - 1}__`
	})

	const tokens = parse(processedCommand) as ShellToken[]
	const commands: string[] = []
	let currentCommand: string[] = []

	for (const token of tokens) {
		if (typeof token === "object" && "op" in token) {
			// Chain operator - split command
			if (["&&", "||", ";", "|"].includes(token.op)) {
				if (currentCommand.length > 0) {
					commands.push(currentCommand.join(" "))
					currentCommand = []
				}
			} else {
				// Other operators (>, &) are part of the command
				currentCommand.push(token.op)
			}
		} else if (typeof token === "string") {
			// Check if it's a subshell placeholder
			const subshellMatch = token.match(/__SUBSH_(\d+)__/)
			if (subshellMatch) {
				if (currentCommand.length > 0) {
					commands.push(currentCommand.join(" "))
					currentCommand = []
				}
				commands.push(subshells[parseInt(subshellMatch[1])])
			} else {
				currentCommand.push(token)
			}
		}
	}

	// Add any remaining command
	if (currentCommand.length > 0) {
		commands.push(currentCommand.join(" "))
	}

	// Restore quotes, redirections, and array indexing
	const restoredCommands = commands.map((cmd) => {
		let result = cmd
		// Restore quotes
		result = result.replace(/__QUOTE_(\d+)__/g, (_, i) => quotes[parseInt(i)])
		// Restore redirections
		result = result.replace(/__REDIR_(\d+)__/g, (_, i) => redirections[parseInt(i)])
		// Restore array indexing expressions
		result = result.replace(/__ARRAY_(\d+)__/g, (_, i) => arrayIndexing[parseInt(i)])
		return result
	})

	return {
		subCommands: restoredCommands,
		hasSubshells,
		subshellCommands: subshells,
	}
}

/**
 * Extract command patterns for permission management.
 * This is a simplified version that focuses on extracting
 * the main command and its subcommands for pattern matching.
 *
 * @param command - The command string to extract patterns from
 * @returns Array of command patterns
 */
export function extractPatternsFromCommand(command: string): string[] {
	if (!command?.trim()) return []

	// First, remove subshells for security - we don't want to extract patterns from subshell contents
	const cleanedCommand = command
		.replace(/\$\([^)]*\)/g, "") // Remove $() subshells
		.replace(/`[^`]*`/g, "") // Remove backtick subshells

	const patterns = new Set<string>()
	const parsed = parse(cleanedCommand) as ShellToken[]

	const commandSeparators = new Set(["|", "&&", "||", ";"])
	let current: string[] = []

	for (const token of parsed) {
		if (typeof token === "object" && "op" in token && commandSeparators.has(token.op)) {
			if (current.length) processCommandForPatterns(current, patterns)
			current = []
		} else {
			current.push(String(token))
		}
	}

	if (current.length) processCommandForPatterns(current, patterns)

	return Array.from(patterns).sort()
}

/**
 * Process a single command to extract patterns
 */
function processCommandForPatterns(cmd: string[], patterns: Set<string>): void {
	if (!cmd.length || typeof cmd[0] !== "string") return

	const mainCmd = cmd[0]

	// Skip if it's just a number (like "0" from "0 total")
	if (/^\d+$/.test(mainCmd)) return

	// Skip common output patterns that aren't commands
	const skipWords = ["total", "error", "warning", "failed", "success", "done"]
	if (skipWords.includes(mainCmd.toLowerCase())) return

	patterns.add(mainCmd)

	const breakingExps = [/^-/, /[\\/.~]/]

	for (let i = 1; i < cmd.length; i++) {
		const arg = cmd[i]

		if (typeof arg !== "string" || breakingExps.some((re) => re.test(arg))) break

		const pattern = cmd.slice(0, i + 1).join(" ")
		patterns.add(pattern)
	}
}

/**
 * Security analysis for commands
 */
export interface SecurityWarning {
	type: "subshell" | "injection"
	message: string
}

/**
 * Detect security issues in a command
 *
 * @param command - The command to analyze
 * @returns Array of security warnings
 */
export function detectCommandSecurityIssues(command: string): SecurityWarning[] {
	const warnings: SecurityWarning[] = []

	// Check for subshell execution attempts
	if (command.includes("$(") || command.includes("`")) {
		warnings.push({
			type: "subshell",
			message: "Command contains subshell execution which could bypass restrictions",
		})
	}

	return warnings
}
