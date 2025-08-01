import { LRUCache } from "lru-cache"

/**
 * Represents the state of a message in the chat view
 */
export interface MessageState {
	isExpanded: boolean
	lastInteraction: number
	isPinned: boolean
	height?: number // Cached height for better virtualization
}

/**
 * Manages message states efficiently using LRU cache
 * Handles expanded/collapsed states and pinned messages
 */
export class MessageStateManager {
	private states: LRUCache<number, MessageState>
	private pinnedMessages: Set<number>
	private expandedCount: number = 0

	constructor(maxSize: number = 100, ttl: number = 30 * 60 * 1000) {
		this.states = new LRUCache<number, MessageState>({
			max: maxSize,
			ttl: ttl,
			updateAgeOnGet: true,
			updateAgeOnHas: true,
			dispose: (value, _key) => {
				// Update expanded count when items are evicted
				if (value.isExpanded) {
					this.expandedCount = Math.max(0, this.expandedCount - 1)
				}
			},
		})
		this.pinnedMessages = new Set<number>()
	}

	/**
	 * Get the state of a message
	 */
	getState(messageTs: number): MessageState | undefined {
		return this.states.get(messageTs)
	}

	/**
	 * Check if a message is expanded
	 */
	isExpanded(messageTs: number): boolean {
		return this.states.get(messageTs)?.isExpanded ?? false
	}

	/**
	 * Set the state of a message
	 */
	setState(messageTs: number, state: Partial<MessageState>): void {
		const existing = this.states.get(messageTs)
		const wasExpanded = existing?.isExpanded ?? false

		const newState: MessageState = {
			isExpanded: state.isExpanded ?? existing?.isExpanded ?? false,
			lastInteraction: Date.now(),
			isPinned: state.isPinned ?? existing?.isPinned ?? false,
			height: state.height ?? existing?.height,
		}

		// Update expanded count
		if (!wasExpanded && newState.isExpanded) {
			this.expandedCount++
		} else if (wasExpanded && !newState.isExpanded) {
			this.expandedCount = Math.max(0, this.expandedCount - 1)
		}

		this.states.set(messageTs, newState)
	}

	/**
	 * Toggle the expanded state of a message
	 */
	toggleExpanded(messageTs: number): boolean {
		const current = this.isExpanded(messageTs)
		this.setState(messageTs, { isExpanded: !current })
		return !current
	}

	/**
	 * Pin a message to prevent it from being evicted
	 */
	pinMessage(messageTs: number): void {
		this.pinnedMessages.add(messageTs)
		this.setState(messageTs, { isPinned: true })

		// Ensure pinned messages don't get evicted
		const state = this.states.get(messageTs)
		if (state) {
			// Re-set to refresh TTL
			this.states.set(messageTs, state)
		}
	}

	/**
	 * Unpin a message
	 */
	unpinMessage(messageTs: number): void {
		this.pinnedMessages.delete(messageTs)
		this.setState(messageTs, { isPinned: false })
	}

	/**
	 * Check if a message is pinned
	 */
	isPinned(messageTs: number): boolean {
		return this.pinnedMessages.has(messageTs)
	}

	/**
	 * Get all expanded messages in a range
	 */
	getExpandedInRange(messages: Array<{ ts: number }>): Set<number> {
		const expanded = new Set<number>()
		for (const msg of messages) {
			if (this.isExpanded(msg.ts)) {
				expanded.add(msg.ts)
			}
		}
		return expanded
	}

	/**
	 * Get the count of expanded messages
	 */
	getExpandedCount(): number {
		return this.expandedCount
	}

	/**
	 * Check if any messages are expanded
	 */
	hasExpandedMessages(): boolean {
		return this.expandedCount > 0
	}

	/**
	 * Set the cached height for a message
	 */
	setCachedHeight(messageTs: number, height: number): void {
		const state = this.getState(messageTs)
		if (state) {
			this.setState(messageTs, { height })
		} else {
			this.setState(messageTs, { height, isExpanded: false })
		}
	}

	/**
	 * Get the cached height for a message
	 */
	getCachedHeight(messageTs: number): number | undefined {
		return this.getState(messageTs)?.height
	}

	/**
	 * Clear all states except pinned messages
	 */
	clear(): void {
		const pinnedStates = new Map<number, MessageState>()

		// Save pinned message states
		this.pinnedMessages.forEach((ts) => {
			const state = this.states.get(ts)
			if (state) {
				pinnedStates.set(ts, state)
			}
		})

		// Clear all states
		this.states.clear()
		this.expandedCount = 0

		// Restore pinned messages
		pinnedStates.forEach((state, ts) => {
			this.states.set(ts, state)
			if (state.isExpanded) {
				this.expandedCount++
			}
		})
	}

	/**
	 * Cleanup old states (called automatically by LRU cache)
	 */
	cleanup(): void {
		this.states.purgeStale()
	}

	/**
	 * Get statistics about the state manager
	 */
	getStats(): {
		totalStates: number
		expandedCount: number
		pinnedCount: number
		cacheSize: number
	} {
		return {
			totalStates: this.states.size,
			expandedCount: this.expandedCount,
			pinnedCount: this.pinnedMessages.size,
			cacheSize: this.states.size,
		}
	}

	/**
	 * Export all states (for debugging or persistence)
	 */
	exportStates(): Array<[number, MessageState]> {
		const states: Array<[number, MessageState]> = []
		this.states.forEach((value, key) => {
			states.push([key, value])
		})
		return states
	}

	/**
	 * Import states (for restoration)
	 */
	importStates(states: Array<[number, MessageState]>): void {
		this.clear()
		for (const [ts, state] of states) {
			this.states.set(ts, state)
			if (state.isPinned) {
				this.pinnedMessages.add(ts)
			}
			if (state.isExpanded) {
				this.expandedCount++
			}
		}
	}
}
