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

	try {
		// First split by newlines (including all types: \n, \r\n, \r) to handle multi-line commands
		const lines = command.split(/\r\n|\r|\n/)
		const allCommands: string[] = []

		for (const line of lines) {
			const trimmedLine = line.trim()
			if (!trimmedLine) continue // Skip empty lines

			// Storage for replaced content
			const redirections: string[] = []
			const subshells: string[] = []
			const quotes: string[] = []
			const arrayIndexing: string[] = []
			const arithmeticExpressions: string[] = []
			const variables: string[] = []

			// First handle PowerShell redirections by temporarily replacing them
			let processedCommand = trimmedLine.replace(/\d*>&\d*/g, (match) => {
				redirections.push(match)
				return `__REDIR_${redirections.length - 1}__`
			})

			// Handle arithmetic expressions: $((...)) pattern
			// Match the entire arithmetic expression including nested parentheses
			processedCommand = processedCommand.replace(/\$\(\([^)]*(?:\)[^)]*)*\)\)/g, (match) => {
				arithmeticExpressions.push(match)
				return `__ARITH_${arithmeticExpressions.length - 1}__`
			})

			// Handle array indexing expressions: ${array[...]} pattern and partial expressions
			processedCommand = processedCommand.replace(/\$\{[^}]*\[[^\]]*(\]([^}]*\})?)?/g, (match) => {
				arrayIndexing.push(match)
				return `__ARRAY_${arrayIndexing.length - 1}__`
			})

			// Handle simple variable references: $varname pattern
			// This prevents shell-quote from splitting $count into separate tokens
			processedCommand = processedCommand.replace(/\$[a-zA-Z_][a-zA-Z0-9_]*/g, (match) => {
				variables.push(match)
				return `__VAR_${variables.length - 1}__`
			})

			// Handle special bash variables: $?, $!, $#, $$, $@, $*, $-, $0-$9
			processedCommand = processedCommand.replace(/\$[?!#$@*\-0-9]/g, (match) => {
				variables.push(match)
				return `__VAR_${variables.length - 1}__`
			})

			// Then handle subshell commands - store them for security analysis
			const _hasSubshells = trimmedLine.includes("$(") || trimmedLine.includes("`")

			processedCommand = processedCommand
				.replace(/\$\(((?!\().*?)\)/g, (_, inner) => {
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

			for (let i = 0; i < tokens.length; i++) {
				const token = tokens[i]

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

			// Restore quotes, redirections, arithmetic expressions, variables, and array indexing
			const restoredCommands = commands.map((cmd) => {
				let result = cmd
				// Restore quotes
				result = result.replace(/__QUOTE_(\d+)__/g, (_, i) => quotes[parseInt(i)])
				// Restore redirections
				result = result.replace(/__REDIR_(\d+)__/g, (_, i) => redirections[parseInt(i)])
				// Restore arithmetic expressions
				result = result.replace(/__ARITH_(\d+)__/g, (_, i) => arithmeticExpressions[parseInt(i)])
				// Restore variables
				result = result.replace(/__VAR_(\d+)__/g, (_, i) => variables[parseInt(i)])
				// Restore array indexing expressions
				result = result.replace(/__ARRAY_(\d+)__/g, (_, i) => arrayIndexing[parseInt(i)])
				return result
			})

			allCommands.push(...restoredCommands)
		}

		// Check if any line has subshells
		const hasSubshells = command.includes("$(") || command.includes("`")
		const subshellCommands: string[] = []

		// Extract subshell commands for security analysis
		let match: RegExpExecArray | null
		const subshellRegex1 = /\$\(((?!\().*?)\)/g
		const subshellRegex2 = /`(.*?)`/g

		while ((match = subshellRegex1.exec(command)) !== null) {
			if (match[1]) {
				subshellCommands.push(match[1].trim())
			}
		}

		while ((match = subshellRegex2.exec(command)) !== null) {
			if (match[1]) {
				subshellCommands.push(match[1].trim())
			}
		}

		return {
			subCommands: allCommands,
			hasSubshells,
			subshellCommands,
		}
	} catch (_error) {
		// If shell-quote fails, fall back to simple splitting
		const fallbackCommands = command
			.split(/\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0)

		return {
			subCommands: fallbackCommands.length > 0 ? fallbackCommands : [command],
			hasSubshells: command.includes("$(") || command.includes("`"),
			subshellCommands: [],
		}
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
