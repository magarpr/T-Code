import * as vscode from "vscode"
import * as path from "path"
import { promises as fs } from "fs"
import { exec } from "child_process"
import { promisify } from "util"
import { truncateOutput } from "../integrations/misc/extract-text"

const execAsync = promisify(exec)
const SVN_OUTPUT_LINE_LIMIT = 500

export interface SvnRepositoryInfo {
	repositoryUrl?: string
	repositoryName?: string
	repositoryRoot?: string
	revision?: string
}

export interface SvnCommit {
	revision: string
	author: string
	date: string
	message: string
	files?: string[]
}

/**
 * Extracts SVN repository information from the workspace's .svn directory
 * @param workspaceRoot The root path of the workspace
 * @returns SVN repository information or empty object if not an SVN repository
 */
export async function getSvnRepositoryInfo(workspaceRoot: string): Promise<SvnRepositoryInfo> {
	try {
		const svnDir = path.join(workspaceRoot, ".svn")

		// Check if .svn directory exists
		try {
			await fs.access(svnDir)
		} catch {
			// Not an SVN repository
			return {}
		}

		const svnInfo: SvnRepositoryInfo = {}

		try {
			// Use svn info command to get repository information
			const { stdout } = await execAsync("svn info --xml", { cwd: workspaceRoot })

			// Parse XML output
			const urlMatch = stdout.match(/<url>([^<]+)<\/url>/)
			const rootMatch = stdout.match(/<root>([^<]+)<\/root>/)
			const revisionMatch = stdout.match(/<commit[^>]*revision="(\d+)"/)

			if (urlMatch && urlMatch[1]) {
				svnInfo.repositoryUrl = urlMatch[1]
				const repositoryName = extractSvnRepositoryName(urlMatch[1])
				if (repositoryName) {
					svnInfo.repositoryName = repositoryName
				}
			}

			if (rootMatch && rootMatch[1]) {
				svnInfo.repositoryRoot = rootMatch[1]
			}

			if (revisionMatch && revisionMatch[1]) {
				svnInfo.revision = revisionMatch[1]
			}
		} catch (error) {
			// Ignore svn info errors
		}

		return svnInfo
	} catch (error) {
		// Return empty object on any error
		return {}
	}
}

/**
 * Extracts repository name from an SVN URL
 * @param url The SVN URL
 * @returns Repository name or undefined
 */
export function extractSvnRepositoryName(url: string): string {
	try {
		// Extract the last meaningful part of the URL
		// Remove trailing slashes
		const cleanUrl = url.replace(/\/+$/, "")

		// Common SVN patterns
		const patterns = [
			// Standard layout: .../repos/project/trunk -> project
			/\/repos\/([^\/]+)\/(?:trunk|branches|tags)/,
			// Simple repository: .../svn/project -> project
			/\/svn\/([^\/]+)$/,
			// Generic: last path component
			/\/([^\/]+)$/,
		]

		for (const pattern of patterns) {
			const match = cleanUrl.match(pattern)
			if (match && match[1]) {
				return match[1]
			}
		}

		return ""
	} catch {
		return ""
	}
}

/**
 * Gets SVN repository information for the current VSCode workspace
 * @returns SVN repository information or empty object if not available
 */
export async function getWorkspaceSvnInfo(): Promise<SvnRepositoryInfo> {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return {}
	}

	// Use the first workspace folder
	const workspaceRoot = workspaceFolders[0].uri.fsPath
	return getSvnRepositoryInfo(workspaceRoot)
}

async function checkSvnRepo(cwd: string): Promise<boolean> {
	try {
		await execAsync("svn info", { cwd })
		return true
	} catch (error) {
		return false
	}
}

/**
 * Checks if SVN is installed on the system by attempting to run svn --version
 * @returns {Promise<boolean>} True if SVN is installed and accessible, false otherwise
 */
export async function checkSvnInstalled(): Promise<boolean> {
	try {
		await execAsync("svn --version")
		return true
	} catch (error) {
		return false
	}
}

export async function searchSvnCommits(query: string, cwd: string): Promise<SvnCommit[]> {
	try {
		const isInstalled = await checkSvnInstalled()
		if (!isInstalled) {
			console.error("SVN is not installed")
			return []
		}

		const isRepo = await checkSvnRepo(cwd)
		if (!isRepo) {
			console.error("Not an SVN repository")
			return []
		}

		// Search commits by revision number or message
		let command = `svn log --limit 10 --xml`

		// If query looks like a revision number, search for that specific revision
		if (/^r?\d+$/i.test(query)) {
			const revNum = query.replace(/^r/i, "")
			command = `svn log -r ${revNum} --xml`
		} else if (query) {
			// SVN doesn't have built-in grep for log messages, so we'll get recent logs and filter
			command = `svn log --limit 50 --xml`
		}

		const { stdout } = await execAsync(command, { cwd })

		const commits: SvnCommit[] = []

		// Parse XML output
		const logentries = stdout.match(/<logentry[^>]*>[\s\S]*?<\/logentry>/g) || []

		for (const entry of logentries) {
			const revisionMatch = entry.match(/revision="(\d+)"/)
			const authorMatch = entry.match(/<author>([^<]+)<\/author>/)
			const dateMatch = entry.match(/<date>([^<]+)<\/date>/)
			const msgMatch = entry.match(/<msg>([^<]*)<\/msg>/)

			if (revisionMatch && authorMatch && dateMatch) {
				const message = msgMatch ? msgMatch[1] : ""

				// If we have a search query (not revision), filter by message
				if (query && !/^r?\d+$/i.test(query)) {
					if (!message.toLowerCase().includes(query.toLowerCase())) {
						continue
					}
				}

				// Parse and format date
				const date = new Date(dateMatch[1]).toISOString().split("T")[0]

				commits.push({
					revision: `r${revisionMatch[1]}`,
					author: authorMatch[1],
					date: date,
					message: message.trim(),
				})

				// Limit results to 10
				if (commits.length >= 10) {
					break
				}
			}
		}

		return commits
	} catch (error) {
		console.error("Error searching SVN commits:", error)
		return []
	}
}

export async function getSvnCommitInfo(revision: string, cwd: string): Promise<string> {
	try {
		const isInstalled = await checkSvnInstalled()
		if (!isInstalled) {
			return "SVN is not installed"
		}

		const isRepo = await checkSvnRepo(cwd)
		if (!isRepo) {
			return "Not an SVN repository"
		}

		// Clean revision number (remove 'r' prefix if present)
		const revNum = revision.replace(/^r/i, "")

		// Get commit info with diff
		const { stdout: info } = await execAsync(`svn log -r ${revNum} --verbose --xml`, { cwd })

		// Parse XML output
		const revisionMatch = info.match(/revision="(\d+)"/)
		const authorMatch = info.match(/<author>([^<]+)<\/author>/)
		const dateMatch = info.match(/<date>([^<]+)<\/date>/)
		const msgMatch = info.match(/<msg>([^<]*)<\/msg>/)

		if (!revisionMatch || !authorMatch || !dateMatch) {
			return `Failed to get commit info for revision ${revision}`
		}

		const message = msgMatch ? msgMatch[1].trim() : ""
		const date = new Date(dateMatch[1]).toISOString()

		// Get file changes
		const paths = info.match(/<path[^>]*>([^<]+)<\/path>/g) || []
		const fileChanges = paths
			.map((p) => {
				const pathMatch = p.match(/<path[^>]*>([^<]+)<\/path>/)
				const actionMatch = p.match(/action="([^"]+)"/)
				if (pathMatch && actionMatch) {
					return `${actionMatch[1].toUpperCase()}: ${pathMatch[1]}`
				}
				return pathMatch ? pathMatch[1] : ""
			})
			.filter(Boolean)
			.join("\n")

		// Get the diff
		const { stdout: diff } = await execAsync(`svn diff -c ${revNum}`, { cwd })

		const summary = [
			`Revision: r${revisionMatch[1]}`,
			`Author: ${authorMatch[1]}`,
			`Date: ${date}`,
			`\nMessage: ${message}`,
			"\nFiles Changed:",
			fileChanges,
			"\nFull Changes:",
		].join("\n")

		const output = summary + "\n\n" + diff.trim()
		return truncateOutput(output, SVN_OUTPUT_LINE_LIMIT)
	} catch (error) {
		console.error("Error getting SVN commit info:", error)
		return `Failed to get commit info: ${error instanceof Error ? error.message : String(error)}`
	}
}

export async function getSvnWorkingState(cwd: string): Promise<string> {
	try {
		const isInstalled = await checkSvnInstalled()
		if (!isInstalled) {
			return "SVN is not installed"
		}

		const isRepo = await checkSvnRepo(cwd)
		if (!isRepo) {
			return "Not an SVN repository"
		}

		// Get status of working directory
		const { stdout: status } = await execAsync("svn status", { cwd })
		if (!status.trim()) {
			return "No changes in working directory"
		}

		// Get all changes (show diffs for modified files)
		const { stdout: diff } = await execAsync("svn diff", { cwd })
		const lineLimit = SVN_OUTPUT_LINE_LIMIT
		const output = `Working directory changes:\n\n${status}\n\n${diff}`.trim()
		return truncateOutput(output, lineLimit)
	} catch (error) {
		console.error("Error getting SVN working state:", error)
		return `Failed to get working state: ${error instanceof Error ? error.message : String(error)}`
	}
}
