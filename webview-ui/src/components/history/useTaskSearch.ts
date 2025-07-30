import { useState, useEffect, useMemo } from "react"
import { Fzf } from "fzf"

import { highlightFzfMatch } from "@/utils/highlight"
import { useExtensionState } from "@/context/ExtensionStateContext"

// Helper function to get workspace hash from current workspace
const getCurrentWorkspaceHash = (): string | null => {
	// This will be populated by the extension state
	return null // Placeholder - will be updated when we add workspace hash to extension state
}

// Helper function to check if a task belongs to the current workspace
const isTaskInCurrentWorkspace = (item: any, cwd: string | undefined, currentWorkspaceHash: string | null): boolean => {
	// Primary method: Use workspace hash if available for both current workspace and task
	if (currentWorkspaceHash && item.workspaceHash) {
		return item.workspaceHash === currentWorkspaceHash
	}

	// Fallback method: Use path-based matching for legacy items or when hash is unavailable
	return cwd ? item.workspace === cwd : false
}

type SortOption = "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"

export const useTaskSearch = () => {
	const { taskHistory, cwd } = useExtensionState()
	const [searchQuery, setSearchQuery] = useState("")
	const [sortOption, setSortOption] = useState<SortOption>("newest")
	const [lastNonRelevantSort, setLastNonRelevantSort] = useState<SortOption | null>("newest")
	const [showAllWorkspaces, setShowAllWorkspaces] = useState(false)

	useEffect(() => {
		if (searchQuery && sortOption !== "mostRelevant" && !lastNonRelevantSort) {
			setLastNonRelevantSort(sortOption)
			setSortOption("mostRelevant")
		} else if (!searchQuery && sortOption === "mostRelevant" && lastNonRelevantSort) {
			setSortOption(lastNonRelevantSort)
			setLastNonRelevantSort(null)
		}
	}, [searchQuery, sortOption, lastNonRelevantSort])

	const presentableTasks = useMemo(() => {
		let tasks = taskHistory.filter((item) => item.ts && item.task)
		if (!showAllWorkspaces) {
			const currentWorkspaceHash = getCurrentWorkspaceHash()
			tasks = tasks.filter((item) => isTaskInCurrentWorkspace(item, cwd, currentWorkspaceHash))
		}
		return tasks
	}, [taskHistory, showAllWorkspaces, cwd])

	const fzf = useMemo(() => {
		return new Fzf(presentableTasks, {
			selector: (item) => item.task,
		})
	}, [presentableTasks])

	const tasks = useMemo(() => {
		let results = presentableTasks

		if (searchQuery) {
			// Check if this is a path search (prefixed with "path:")
			if (searchQuery.startsWith("path:")) {
				const pathQuery = searchQuery.substring(5).trim()
				results = presentableTasks.filter((item) => item.workspace && item.workspace.includes(pathQuery))
			} else {
				// Regular fuzzy search
				const searchResults = fzf.find(searchQuery)
				results = searchResults.map((result) => {
					const positions = Array.from(result.positions)
					const taskEndIndex = result.item.task.length

					return {
						...result.item,
						highlight: highlightFzfMatch(
							result.item.task,
							positions.filter((p) => p < taskEndIndex),
						),
						workspace: result.item.workspace,
					}
				})
			}
		}

		// Then sort the results
		return [...results].sort((a, b) => {
			switch (sortOption) {
				case "oldest":
					return (a.ts || 0) - (b.ts || 0)
				case "mostExpensive":
					return (b.totalCost || 0) - (a.totalCost || 0)
				case "mostTokens":
					const aTokens = (a.tokensIn || 0) + (a.tokensOut || 0) + (a.cacheWrites || 0) + (a.cacheReads || 0)
					const bTokens = (b.tokensIn || 0) + (b.tokensOut || 0) + (b.cacheWrites || 0) + (b.cacheReads || 0)
					return bTokens - aTokens
				case "mostRelevant":
					// Keep fuse order if searching, otherwise sort by newest
					return searchQuery ? 0 : (b.ts || 0) - (a.ts || 0)
				case "newest":
				default:
					return (b.ts || 0) - (a.ts || 0)
			}
		})
	}, [presentableTasks, searchQuery, fzf, sortOption])

	return {
		tasks,
		searchQuery,
		setSearchQuery,
		sortOption,
		setSortOption,
		lastNonRelevantSort,
		setLastNonRelevantSort,
		showAllWorkspaces,
		setShowAllWorkspaces,
	}
}
