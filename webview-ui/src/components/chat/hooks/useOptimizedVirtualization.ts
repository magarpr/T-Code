import { useRef, useMemo, useCallback, useEffect, useState } from "react"
import { VirtuosoHandle } from "react-virtuoso"
import { ClineMessage } from "@roo-code/types"
import { MessageStateManager } from "../utils/MessageStateManager"
import { AutoScrollManager } from "../utils/AutoScrollManager"
import {
	VIRTUALIZATION_CONFIG,
	detectDevicePerformance,
	getViewportConfigForDevice,
	ViewportConfig,
} from "../utils/virtualizationConfig"
import {
	createOptimizedMessageGroups,
	MessageGroup,
	getVisibleMessageIndices,
	optimizeGroups,
} from "../utils/messageGrouping"
import { PerformanceMonitor } from "../utils/performanceMonitor"

/**
 * Hook options
 */
export interface UseOptimizedVirtualizationOptions {
	messages: ClineMessage[]
	isStreaming: boolean
	isHidden: boolean
	onPerformanceIssue?: (metric: string, value: number) => void
	customConfig?: Partial<typeof VIRTUALIZATION_CONFIG>
}

/**
 * Hook return type
 */
export interface UseOptimizedVirtualizationReturn {
	virtuosoRef: React.RefObject<VirtuosoHandle>
	viewportConfig: ViewportConfig
	messageGroups: MessageGroup[]
	stateManager: MessageStateManager
	scrollManager: AutoScrollManager
	performanceMonitor: PerformanceMonitor
	handleScroll: (scrollTop: number) => void
	handleRangeChange: (range: { startIndex: number; endIndex: number }) => void
	handleScrollStateChange: (state: { scrollTop: number; scrollHeight: number; viewportHeight: number }) => void
	scrollToBottom: (behavior?: ScrollBehavior) => void
	isAtBottom: boolean
	showScrollToBottom: boolean
	visibleRange: { startIndex: number; endIndex: number }
}

/**
 * Custom hook for optimized ChatView virtualization
 */
export function useOptimizedVirtualization({
	messages,
	isStreaming,
	isHidden,
	onPerformanceIssue,
	customConfig,
}: UseOptimizedVirtualizationOptions): UseOptimizedVirtualizationReturn {
	// Core refs
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	const stateManagerRef = useRef<MessageStateManager>()
	const scrollManagerRef = useRef<AutoScrollManager>()
	const performanceMonitorRef = useRef<PerformanceMonitor>()

	// State
	const [visibleRange, setVisibleRange] = useState({ startIndex: 0, endIndex: 50 })
	const [isAtBottom, setIsAtBottom] = useState(true)
	const [showScrollToBottom, setShowScrollToBottom] = useState(false)
	const [scrollState, setScrollState] = useState({
		scrollTop: 0,
		scrollHeight: 0,
		viewportHeight: 0,
	})

	// Merge custom config
	const config = useMemo(
		() => ({
			...VIRTUALIZATION_CONFIG,
			...customConfig,
		}),
		[customConfig],
	)

	// Initialize managers (only once)
	if (!stateManagerRef.current) {
		stateManagerRef.current = new MessageStateManager(config.stateCache.maxSize, config.stateCache.ttl)
	}

	if (!scrollManagerRef.current) {
		scrollManagerRef.current = new AutoScrollManager(config.autoScroll.threshold)
	}

	if (!performanceMonitorRef.current) {
		performanceMonitorRef.current = new PerformanceMonitor({}, onPerformanceIssue)
	}

	const stateManager = stateManagerRef.current
	const scrollManager = scrollManagerRef.current
	const performanceMonitor = performanceMonitorRef.current

	// Determine viewport configuration based on device and state
	const viewportConfig = useMemo(() => {
		const devicePerf = detectDevicePerformance()
		const hasExpanded = stateManager.hasExpandedMessages()

		// Streaming takes priority
		if (isStreaming) {
			return config.viewport.streaming
		}

		// Expanded messages need more buffer
		if (hasExpanded) {
			return config.viewport.expanded
		}

		// Use device-specific config
		return getViewportConfigForDevice(devicePerf)
	}, [isStreaming, stateManager, config])

	// Create optimized message groups
	const messageGroups = useMemo(() => {
		return performanceMonitor.measureRender("createMessageGroups", () => {
			const groups = createOptimizedMessageGroups(messages, visibleRange)
			return optimizeGroups(groups)
		})
	}, [messages, visibleRange, performanceMonitor])

	// Handle scroll events
	const handleScroll = useCallback(
		(scrollTop: number) => {
			// Use stored scroll state
			const { scrollHeight, viewportHeight } = scrollState

			scrollManager.handleScroll(scrollTop, scrollHeight, viewportHeight)

			// Update performance metrics
			performanceMonitor.updateScrollFPS()

			// Update UI state
			const atBottom = scrollManager.isAtBottom(scrollTop, scrollHeight, viewportHeight)
			setIsAtBottom(atBottom)
			setShowScrollToBottom(!atBottom && scrollManager.getState().isUserScrolling)
		},
		[scrollState, scrollManager, performanceMonitor],
	)

	// Handle visible range changes
	const handleRangeChange = useCallback(
		(range: { startIndex: number; endIndex: number }) => {
			setVisibleRange(range)

			// Update performance metrics
			const messageIndices = getVisibleMessageIndices(messageGroups, range)
			performanceMonitor.updateMessageCounts(
				messages.length,
				messageIndices.endIndex - messageIndices.startIndex + 1,
			)

			// Pin important messages in visible range
			const visibleGroups = messageGroups.slice(range.startIndex, range.endIndex + 1)
			visibleGroups.forEach((group) => {
				group.messages.forEach((msg) => {
					// Pin error messages and active tools
					if (msg.ask === "api_req_failed" || msg.say === "error" || (msg.ask === "tool" && !msg.partial)) {
						stateManager.pinMessage(msg.ts)
					}
				})
			})

			// Cleanup old states periodically
			if (Math.random() < 0.1) {
				// 10% chance on each range change
				stateManager.cleanup()
			}
		},
		[messages, messageGroups, stateManager, performanceMonitor],
	)

	// Scroll to bottom function
	const scrollToBottom = useCallback(
		(behavior: ScrollBehavior = "smooth") => {
			const { scrollTop, scrollHeight, viewportHeight } = scrollState
			const distance = scrollHeight - scrollTop - viewportHeight

			// Calculate behavior but don't use it since we're using the passed behavior
			scrollManager.getScrollBehavior(scrollTop, scrollHeight, config.autoScroll.smoothScrollMaxDistance)

			virtuosoRef.current?.scrollTo({
				top: Number.MAX_SAFE_INTEGER,
				behavior: distance > config.autoScroll.smoothScrollMaxDistance ? "auto" : behavior,
			})

			scrollManager.resetUserScrolling()
		},
		[config, scrollState, scrollManager],
	)

	// Auto-scroll effect
	useEffect(() => {
		if (!isHidden && scrollManager.shouldAutoScroll(stateManager.hasExpandedMessages())) {
			const timeoutId = setTimeout(() => {
				scrollToBottom("smooth")
			}, config.autoScroll.debounceDelay)

			return () => clearTimeout(timeoutId)
		}
	}, [messages.length, isHidden, scrollToBottom, config, scrollManager, stateManager])

	// Performance monitoring
	useEffect(() => {
		if (!isHidden) {
			performanceMonitor.startMonitoring()

			// Update metrics periodically
			const intervalId = setInterval(() => {
				performanceMonitor.updateMemoryUsage()
				performanceMonitor.updateDOMNodeCount()

				// Log metrics in development
				if (process.env.NODE_ENV === "development") {
					const report = performanceMonitor.getReport()
					if (report.issues.length > 0) {
						console.warn("Performance issues detected:", report.issues)
					}
				}
			}, 5000)

			return () => {
				clearInterval(intervalId)
				performanceMonitor.stopMonitoring()
			}
		}
	}, [isHidden, performanceMonitor])

	// Cleanup on unmount or when hidden
	useEffect(() => {
		if (isHidden) {
			stateManager.cleanup()
			performanceMonitor.reset()
		}
	}, [isHidden, stateManager, performanceMonitor])

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			scrollManager.dispose()
			performanceMonitor.dispose()
		}
	}, [scrollManager, performanceMonitor])

	// Handle scroll state updates from Virtuoso
	const handleScrollStateChange = useCallback(
		(newState: { scrollTop: number; scrollHeight: number; viewportHeight: number }) => {
			setScrollState(newState)
		},
		[],
	)

	return {
		virtuosoRef,
		viewportConfig,
		messageGroups,
		stateManager,
		scrollManager,
		performanceMonitor,
		handleScroll,
		handleRangeChange,
		handleScrollStateChange,
		scrollToBottom,
		isAtBottom,
		showScrollToBottom,
		visibleRange,
	}
}
