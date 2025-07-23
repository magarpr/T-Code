import { extractPatternsFromCommand, detectCommandSecurityIssues, SecurityWarning } from "./command-parser"

export interface CommandPattern {
	pattern: string
	description?: string
}

// Re-export SecurityWarning type from command-parser
export type { SecurityWarning }

export function extractCommandPatterns(command: string): string[] {
	return extractPatternsFromCommand(command)
}

export function detectSecurityIssues(command: string): SecurityWarning[] {
	return detectCommandSecurityIssues(command)
}

/**
 * Get a human-readable description for a command pattern.
 * Simply returns the pattern followed by "commands".
 */
export function getPatternDescription(pattern: string): string {
	return `${pattern} commands`
}

export function parseCommandAndOutput(text: string): {
	command: string
	output: string
	suggestions: string[]
} {
	// Default result
	const result = {
		command: text,
		output: "",
		suggestions: [] as string[],
	}

	// First check if the text already has been split by COMMAND_OUTPUT_STRING
	// This happens when the command has already been executed and we have the output
	const outputSeparator = "Output:"
	const outputIndex = text.indexOf(`\n${outputSeparator}`)

	if (outputIndex !== -1) {
		// Text is already split into command and output
		// The command is everything before the output separator
		result.command = text.slice(0, outputIndex).trim()
		// The output is everything after the output separator
		// We need to skip the newline and "Output:" text
		const afterNewline = outputIndex + 1 // Skip the newline
		const afterSeparator = afterNewline + outputSeparator.length // Skip "Output:"
		// Check if there's a colon and potential space after it
		let startOfOutput = afterSeparator
		if (text[afterSeparator] === "\n") {
			startOfOutput = afterSeparator + 1 // Skip additional newline after "Output:"
		}
		result.output = text.slice(startOfOutput).trim()
	} else if (text.indexOf(outputSeparator) === 0) {
		// Edge case: text starts with "Output:" (no command)
		result.command = ""
		result.output = text.slice(outputSeparator.length).trim()
	} else {
		// No output separator found, the entire text is the command
		result.command = text.trim()
		result.output = ""
	}

	// Look for AI suggestions in the output
	// These might be in a format like:
	// "Suggested patterns: npm, npm install, npm run"
	// or as a list
	const suggestionPatterns = [
		/Suggested patterns?:\s*(.+?)(?:\n|$)/i,
		/Command patterns?:\s*(.+?)(?:\n|$)/i,
		/You (?:can|may|might) (?:want to )?(?:allow|add):\s*(.+?)(?:\n|$)/i,
	]

	for (const pattern of suggestionPatterns) {
		const match = result.output.match(pattern)
		if (match) {
			// Split by common delimiters and clean up
			const suggestions = match[1]
				.split(/[,;]/)
				.map((s) => s.trim())
				.filter((s) => s) // Allow multi-word patterns like "npm install"

			if (suggestions.length > 0) {
				// Add to existing suggestions instead of replacing
				result.suggestions.push(...suggestions)
			}
		}
	}

	// Remove duplicates
	result.suggestions = Array.from(new Set(result.suggestions))

	// Also look for bullet points or numbered lists
	// const listPattern = /^[\s\-*•·▪▫◦‣⁃]\s*`?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)`?$/gm
	const lines = result.output.split("\n")
	for (const line of lines) {
		const match = line.match(/^[\s\-*•·▪▫◦‣⁃]\s*`?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)`?$/)
		if (match && match[1] && !result.suggestions.includes(match[1])) {
			result.suggestions.push(match[1])
		}
	}

	return result
}
