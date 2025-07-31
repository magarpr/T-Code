import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import * as childProcess from "child_process"
import * as readline from "readline"
import { byLengthAsc, Fzf } from "fzf"
import { getBinPath } from "../ripgrep"

export type FileResult = { path: string; type: "file" | "folder"; label?: string }

export async function executeRipgrep({
	args,
	workspacePath,
	limit = 500,
}: {
	args: string[]
	workspacePath: string
	limit?: number
}): Promise<FileResult[]> {
	const rgPath = await getBinPath(vscode.env.appRoot)

	if (!rgPath) {
		throw new Error(`ripgrep not found: ${rgPath}`)
	}

	return new Promise((resolve, reject) => {
		const rgProcess = childProcess.spawn(rgPath, args)
		const rl = readline.createInterface({ input: rgProcess.stdout, crlfDelay: Infinity })
		const fileResults: FileResult[] = []
		const dirSet = new Set<string>() // Track unique directory paths.

		let count = 0

		rl.on("line", (line) => {
			if (count < limit) {
				try {
					const relativePath = path.relative(workspacePath, line)

					// Add the file itself.
					fileResults.push({ path: relativePath, type: "file", label: path.basename(relativePath) })

					// Extract and store all parent directory paths.
					let dirPath = path.dirname(relativePath)

					while (dirPath && dirPath !== "." && dirPath !== "/") {
						dirSet.add(dirPath)
						dirPath = path.dirname(dirPath)
					}

					count++
				} catch (error) {
					// Silently ignore errors processing individual paths.
				}
			} else {
				rl.close()
				rgProcess.kill()
			}
		})

		let errorOutput = ""

		rgProcess.stderr.on("data", (data) => {
			errorOutput += data.toString()
		})

		rl.on("close", () => {
			if (errorOutput && fileResults.length === 0) {
				reject(new Error(`ripgrep process error: ${errorOutput}`))
			} else {
				// Convert directory set to array of directory objects.
				const dirResults = Array.from(dirSet).map((dirPath) => ({
					path: dirPath,
					type: "folder" as const,
					label: path.basename(dirPath),
				}))

				// Combine files and directories and resolve.
				resolve([...fileResults, ...dirResults])
			}
		})

		rgProcess.on("error", (error) => {
			reject(new Error(`ripgrep process error: ${error.message}`))
		})
	})
}

export async function executeRipgrepForFiles(
	workspacePath: string,
	limit: number = 5000,
): Promise<{ path: string; type: "file" | "folder"; label?: string }[]> {
	const args = [
		"--files",
		"--follow",
		"--hidden",
		"-g",
		"!**/node_modules/**",
		"-g",
		"!**/.git/**",
		"-g",
		"!**/out/**",
		"-g",
		"!**/dist/**",
		workspacePath,
	]

	return executeRipgrep({ args, workspacePath, limit })
}

export async function searchWorkspaceFiles(
	query: string,
	workspacePath: string,
	limit: number = 20,
): Promise<{ path: string; type: "file" | "folder"; label?: string }[]> {
	try {
		// Get all files and directories (from our modified function)
		const allItems = await executeRipgrepForFiles(workspacePath, 5000)

		// If no query, just return the top items
		if (!query.trim()) {
			return allItems.slice(0, limit)
		}

		// Create search items for all files AND directories
		const searchItems = allItems.map((item) => ({
			original: item,
			searchStr: `${item.path} ${item.label || ""}`,
		}))

		// Run fzf search on all items
		const fzf = new Fzf(searchItems, {
			selector: (item) => item.searchStr,
			tiebreakers: [byLengthAsc],
			limit: limit,
		})

		// Get all matching results from fzf
		// The fzf library supports exact matching with quotes, but for queries starting
		// with special characters like periods, we need to handle them specially.
		// The issue is that fzf may not handle leading periods well in fuzzy matching.
		let fzfResults = fzf.find(query).map((result) => result.item.original)

		// If the original query didn't return results and starts with a period,
		// try alternative search strategies
		if (fzfResults.length === 0 && query.startsWith(".")) {
			// Try exact substring matching as a fallback for period-prefixed queries
			const exactMatches = allItems.filter((item) => {
				const searchStr = `${item.path} ${item.label || ""}`
				return searchStr.toLowerCase().includes(query.toLowerCase())
			})

			// Sort by relevance (exact filename matches first, then path matches)
			exactMatches.sort((a, b) => {
				const aLabel = (a.label || "").toLowerCase()
				const bLabel = (b.label || "").toLowerCase()
				const queryLower = query.toLowerCase()

				// Prioritize exact filename matches
				if (aLabel === queryLower && bLabel !== queryLower) return -1
				if (bLabel === queryLower && aLabel !== queryLower) return 1

				// Then prioritize filename starts with query
				if (aLabel.startsWith(queryLower) && !bLabel.startsWith(queryLower)) return -1
				if (bLabel.startsWith(queryLower) && !aLabel.startsWith(queryLower)) return 1

				// Finally sort by path length (shorter paths first)
				return a.path.length - b.path.length
			})

			fzfResults = exactMatches.slice(0, limit)
		}

		// Verify types of the shortest results
		const verifiedResults = await Promise.all(
			fzfResults.map(async (result) => {
				const fullPath = path.join(workspacePath, result.path)
				// Verify if the path exists and is actually a directory
				if (fs.existsSync(fullPath)) {
					const isDirectory = fs.lstatSync(fullPath).isDirectory()
					return {
						...result,
						path: result.path.toPosix(),
						type: isDirectory ? ("folder" as const) : ("file" as const),
					}
				}
				// If path doesn't exist, keep original type
				return result
			}),
		)

		return verifiedResults
	} catch (error) {
		console.error("Error in searchWorkspaceFiles:", error)
		return []
	}
}
