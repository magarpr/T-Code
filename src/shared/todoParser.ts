import crypto from "crypto"
import { TodoItem, TodoStatus } from "@roo-code/types"

/**
 * Parse a markdown checklist into TodoItem array.
 * Supports the following formats:
 * - [ ] for pending items
 * - [x] or [X] for completed items
 * - [-] or [~] for in-progress items
 *
 * @param md Markdown checklist string
 * @returns Array of TodoItem objects
 */
export function parseMarkdownChecklist(md: string): TodoItem[] {
	if (typeof md !== "string") return []

	const lines = md
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)

	const todos: TodoItem[] = []

	for (const line of lines) {
		const match = line.match(/^\[\s*([ xX\-~])\s*\]\s+(.+)$/)
		if (!match) continue

		let status: TodoStatus = "pending"
		if (match[1] === "x" || match[1] === "X") status = "completed"
		else if (match[1] === "-" || match[1] === "~") status = "in_progress"

		const id = crypto
			.createHash("md5")
			.update(match[2] + status)
			.digest("hex")

		todos.push({
			id,
			content: match[2],
			status,
		})
	}

	return todos
}
