import { parse } from "shell-quote"

export interface CommandPattern {
	pattern: string
	description?: string
}

export function extractCommandPatterns(command: string): string[] {
	if (!command?.trim()) return []

	const patterns = new Set<string>()

	try {
		const parsed = parse(command)

		const commandSeparators = new Set(["|", "&&", "||", ";"])
		let current: any[] = []

		for (const token of parsed) {
			if (typeof token === "object" && "op" in token && token.op && commandSeparators.has(token.op)) {
				if (current.length) processCommand(current, patterns)
				current = []
			} else {
				current.push(token)
			}
		}

		if (current.length) processCommand(current, patterns)
	} catch (_error) {
		// If parsing fails, try to extract at least the main command
		const mainCommand = command.trim().split(/\s+/)[0]
		if (mainCommand) patterns.add(mainCommand)
	}

	return Array.from(patterns).sort()
}

function processCommand(cmd: any[], patterns: Set<string>) {
	if (!cmd.length || typeof cmd[0] !== "string") return

	const mainCmd = cmd[0]
	patterns.add(mainCmd)

	// Patterns that indicate we should stop looking for subcommands
	const breakingExps = [/^-/, /[\\/.~ ]/]

	// Build up patterns progressively
	for (let i = 1; i < cmd.length; i++) {
		const arg = cmd[i]
		if (typeof arg !== "string" || breakingExps.some((re) => re.test(arg))) break

		const pattern = cmd.slice(0, i + 1).join(" ")
		patterns.add(pattern)
	}
}

export function getPatternDescription(pattern: string): string {
	// Generate human-readable descriptions for common patterns
	const descriptions: Record<string, string> = {
		cd: "directory navigation",
		ls: "list directory contents",
		pwd: "print working directory",
		mkdir: "create directories",
		rm: "remove files/directories",
		cp: "copy files/directories",
		mv: "move/rename files",
		cat: "display file contents",
		echo: "display text",
		npm: "npm commands",
		"npm install": "npm install commands",
		"npm run": "all npm run scripts",
		"npm test": "npm test commands",
		"npm start": "npm start commands",
		"npm build": "npm build commands",
		yarn: "yarn commands",
		"yarn install": "yarn install commands",
		"yarn run": "all yarn run scripts",
		pnpm: "pnpm commands",
		"pnpm install": "pnpm install commands",
		"pnpm run": "all pnpm run scripts",
		git: "git commands",
		"git add": "git add commands",
		"git commit": "git commit commands",
		"git push": "git push commands",
		"git pull": "git pull commands",
		"git clone": "git clone commands",
		"git checkout": "git checkout commands",
		"git branch": "git branch commands",
		"git merge": "git merge commands",
		"git status": "git status commands",
		"git log": "git log commands",
		python: "python scripts",
		python3: "python3 scripts",
		node: "node.js scripts",
		deno: "deno scripts",
		bun: "bun scripts",
		docker: "docker commands",
		"docker run": "docker run commands",
		"docker build": "docker build commands",
		"docker compose": "docker compose commands",
		curl: "HTTP requests",
		wget: "download files",
		grep: "search text patterns",
		find: "find files/directories",
		sed: "stream editor",
		awk: "text processing",
		make: "build automation",
		cmake: "CMake build system",
		go: "go commands",
		"go run": "go run commands",
		"go build": "go build commands",
		"go test": "go test commands",
		cargo: "Rust cargo commands",
		"cargo run": "cargo run commands",
		"cargo build": "cargo build commands",
		"cargo test": "cargo test commands",
		dotnet: ".NET commands",
		"dotnet run": "dotnet run commands",
		"dotnet build": "dotnet build commands",
		"dotnet test": "dotnet test commands",
	}

	return descriptions[pattern] || `${pattern} commands`
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
	const outputIndex = text.indexOf(outputSeparator)

	if (outputIndex !== -1) {
		// Text is already split into command and output
		result.command = text.slice(0, outputIndex).trim()
		result.output = text.slice(outputIndex + outputSeparator.length).trim()
	} else {
		// Try to extract command from the text
		// Look for patterns like "$ command" or "❯ command" at the start
		const commandMatch = text.match(/^[$❯>]\s*(.+?)(?:\n|$)/m)
		if (commandMatch) {
			result.command = commandMatch[1].trim()
			result.output = text.substring(commandMatch.index! + commandMatch[0].length).trim()
		}
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
