import { parse } from "shell-quote"

/**
 * Extract command patterns from a command string.
 * Returns at most 3 levels: base command, command + first argument, and command + first two arguments.
 * Stops at flags (-), paths (/\~), file extensions (.ext), or special characters (:).
 */
export function extractPatternsFromCommand(command: string): string[] {
	if (!command?.trim()) return []

	const patterns = new Set<string>()

	try {
		const parsed = parse(command)
		const commandSeparators = new Set(["|", "&&", "||", ";"])
		let currentTokens: string[] = []

		for (const token of parsed) {
			if (typeof token === "object" && "op" in token && commandSeparators.has(token.op)) {
				// Process accumulated tokens as a command
				if (currentTokens.length > 0) {
					extractFromTokens(currentTokens, patterns)
					currentTokens = []
				}
			} else if (typeof token === "string") {
				currentTokens.push(token)
			}
		}

		// Process any remaining tokens
		if (currentTokens.length > 0) {
			extractFromTokens(currentTokens, patterns)
		}
	} catch (error) {
		console.warn("Failed to parse command:", error)
		// Fallback: just extract the first word
		const firstWord = command.trim().split(/\s+/)[0]
		if (firstWord) patterns.add(firstWord)
	}

	return Array.from(patterns).sort()
}

function extractFromTokens(tokens: string[], patterns: Set<string>): void {
	if (tokens.length === 0) return

	const mainCmd = tokens[0]

	// Skip numeric commands like "0" from "0 total"
	if (/^\d+$/.test(mainCmd)) return

	// Build patterns progressively up to 3 levels
	let pattern = mainCmd
	patterns.add(pattern)

	for (let i = 1; i < Math.min(tokens.length, 3); i++) {
		pattern += ` ${tokens[i]}`
		patterns.add(pattern)
	}
}
