import React, { useEffect, useRef, useState, useCallback } from "react"
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { vscode } from "../../utils/vscode"
import "./WebPreview.css"

interface ElementContext {
	html: string
	css: string
	xpath: string
	selector: string
	position: {
		x: number
		y: number
		width: number
		height: number
	}
	computedStyles?: Record<string, string>
	attributes?: Record<string, string>
}

interface PreviewState {
	url?: string
	isLoading: boolean
	selectedElement?: ElementContext
	viewportSize: { width: number; height: number }
	deviceMode: "desktop" | "tablet" | "mobile" | "custom"
}

const WebPreview: React.FC = () => {
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const [state, setState] = useState<PreviewState>({
		isLoading: false,
		viewportSize: { width: 1200, height: 800 },
		deviceMode: "desktop",
	})
	const [urlInput, setUrlInput] = useState("")
	const [isSelectionMode, setIsSelectionMode] = useState(false)
	const [highlightedElement, setHighlightedElement] = useState<HTMLElement | null>(null)

	// Handle messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			switch (message.type) {
				case "updateState":
					setState(message.state)
					if (message.state.url) {
						setUrlInput(message.state.url)
					}
					break
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	// Navigate to URL
	const handleNavigate = useCallback(() => {
		if (urlInput) {
			vscode.postMessage({ type: "navigateToUrl", url: urlInput })
		}
	}, [urlInput])

	// Handle device mode change
	const handleDeviceModeChange = useCallback((e: any) => {
		const mode = e.target.value as PreviewState["deviceMode"]
		vscode.postMessage({ type: "setDeviceMode", deviceMode: mode })
	}, [])

	// Handle viewport size change
	const handleViewportResize = useCallback((width: number, height: number) => {
		vscode.postMessage({ type: "setViewportSize", width, height })
	}, [])

	// Refresh preview
	const handleRefresh = useCallback(() => {
		vscode.postMessage({ type: "refreshPreview" })
	}, [])

	// Extract element context
	const extractElementContext = useCallback((element: HTMLElement): ElementContext => {
		const rect = element.getBoundingClientRect()
		const computedStyles = window.getComputedStyle(element)

		// Get important computed styles
		const importantStyles: Record<string, string> = {}
		const stylesToCapture = [
			"display",
			"position",
			"width",
			"height",
			"margin",
			"padding",
			"color",
			"background-color",
			"font-size",
			"font-family",
			"font-weight",
			"border",
			"z-index",
			"opacity",
			"visibility",
		]
		stylesToCapture.forEach((style) => {
			importantStyles[style] = computedStyles.getPropertyValue(style)
		})

		// Get attributes
		const attributes: Record<string, string> = {}
		Array.from(element.attributes).forEach((attr) => {
			attributes[attr.name] = attr.value
		})

		// Generate CSS selector
		const generateSelector = (el: HTMLElement): string => {
			const path: string[] = []
			let current: HTMLElement | null = el

			while (current && current !== document.body) {
				let selector = current.tagName.toLowerCase()

				if (current.id) {
					selector = `#${current.id}`
					path.unshift(selector)
					break
				} else if (current.className) {
					const classes = Array.from(current.classList)
						.filter((c) => c)
						.join(".")
					if (classes) {
						selector += `.${classes}`
					}
				}

				// Add nth-child if needed
				const parent = current.parentElement
				if (parent) {
					const siblings = Array.from(parent.children).filter((child) => child.tagName === current!.tagName)
					if (siblings.length > 1) {
						const index = siblings.indexOf(current) + 1
						selector += `:nth-child(${index})`
					}
				}

				path.unshift(selector)
				current = current.parentElement
			}

			return path.join(" > ")
		}

		// Generate XPath
		const generateXPath = (el: HTMLElement): string => {
			const path: string[] = []
			let current: HTMLElement | null = el

			while (current && current !== document.body) {
				let index = 0
				let sibling = current.previousSibling

				while (sibling) {
					if (
						sibling.nodeType === Node.ELEMENT_NODE &&
						(sibling as HTMLElement).tagName === current.tagName
					) {
						index++
					}
					sibling = sibling.previousSibling
				}

				const tagName = current.tagName.toLowerCase()
				const xpathIndex = index > 0 ? `[${index + 1}]` : ""
				path.unshift(`${tagName}${xpathIndex}`)

				current = current.parentElement
			}

			return `//${path.join("/")}`
		}

		return {
			html: element.outerHTML.substring(0, 200) + (element.outerHTML.length > 200 ? "..." : ""),
			css: generateSelector(element),
			xpath: generateXPath(element),
			selector: generateSelector(element),
			position: {
				x: rect.left,
				y: rect.top,
				width: rect.width,
				height: rect.height,
			},
			computedStyles: importantStyles,
			attributes,
		}
	}, [])

	// Handle element selection in iframe
	const setupIframeInteraction = useCallback(() => {
		const iframe = iframeRef.current
		if (!iframe || !iframe.contentWindow) return

		try {
			const iframeDoc = iframe.contentDocument || iframe.contentWindow.document

			// Remove any existing highlight
			const existingHighlight = iframeDoc.getElementById("roo-preview-highlight")
			if (existingHighlight) {
				existingHighlight.remove()
			}

			// Add styles for highlighting
			if (!iframeDoc.getElementById("roo-preview-styles")) {
				const style = iframeDoc.createElement("style")
				style.id = "roo-preview-styles"
				style.textContent = `
					.roo-preview-highlight {
						outline: 2px solid #007ACC !important;
						outline-offset: 2px !important;
						background-color: rgba(0, 122, 204, 0.1) !important;
						cursor: pointer !important;
					}
					.roo-preview-selection-mode * {
						cursor: crosshair !important;
					}
				`
				iframeDoc.head.appendChild(style)
			}

			// Toggle selection mode class on body
			if (isSelectionMode) {
				iframeDoc.body.classList.add("roo-preview-selection-mode")
			} else {
				iframeDoc.body.classList.remove("roo-preview-selection-mode")
			}

			// Mouse move handler for highlighting
			const handleMouseMove = (e: MouseEvent) => {
				if (!isSelectionMode) return

				const target = e.target as HTMLElement
				if (target === highlightedElement) return

				// Remove previous highlight
				if (highlightedElement) {
					highlightedElement.classList.remove("roo-preview-highlight")
				}

				// Add new highlight
				target.classList.add("roo-preview-highlight")
				setHighlightedElement(target)
			}

			// Click handler for selection
			const handleClick = (e: MouseEvent) => {
				if (!isSelectionMode) return

				e.preventDefault()
				e.stopPropagation()

				const target = e.target as HTMLElement
				const context = extractElementContext(target)

				// Send element context to extension
				vscode.postMessage({ type: "elementSelected", elementContext: context })

				// Exit selection mode
				setIsSelectionMode(false)
				if (highlightedElement) {
					highlightedElement.classList.remove("roo-preview-highlight")
					setHighlightedElement(null)
				}
			}

			// Add event listeners
			iframeDoc.addEventListener("mousemove", handleMouseMove)
			iframeDoc.addEventListener("click", handleClick, true)

			// Cleanup function
			return () => {
				iframeDoc.removeEventListener("mousemove", handleMouseMove)
				iframeDoc.removeEventListener("click", handleClick, true)
				iframeDoc.body.classList.remove("roo-preview-selection-mode")
				if (highlightedElement) {
					highlightedElement.classList.remove("roo-preview-highlight")
				}
			}
		} catch (_error) {
			// Cross-origin iframe, can't access content
			console.warn("Cannot access iframe content due to cross-origin restrictions")
		}
	}, [isSelectionMode, highlightedElement, extractElementContext])

	// Setup iframe interaction when selection mode changes or iframe loads
	useEffect(() => {
		if (iframeRef.current && state.url) {
			const cleanup = setupIframeInteraction()
			return cleanup
		}
	}, [isSelectionMode, state.url, setupIframeInteraction])

	return (
		<div className="web-preview-container">
			<div className="web-preview-toolbar">
				<div className="toolbar-section">
					<input
						type="text"
						className="url-input"
						value={urlInput}
						onChange={(e) => setUrlInput(e.target.value)}
						onKeyPress={(e) => e.key === "Enter" && handleNavigate()}
						placeholder="Enter URL..."
					/>
					<VSCodeButton onClick={handleNavigate} disabled={state.isLoading}>
						Go
					</VSCodeButton>
					<VSCodeButton onClick={handleRefresh} disabled={state.isLoading}>
						<span className="codicon codicon-refresh"></span>
					</VSCodeButton>
				</div>

				<div className="toolbar-section">
					<VSCodeDropdown value={state.deviceMode} onChange={handleDeviceModeChange}>
						<VSCodeOption value="desktop">Desktop (1200x800)</VSCodeOption>
						<VSCodeOption value="tablet">Tablet (768x1024)</VSCodeOption>
						<VSCodeOption value="mobile">Mobile (375x667)</VSCodeOption>
						<VSCodeOption value="custom">Custom</VSCodeOption>
					</VSCodeDropdown>

					{state.deviceMode === "custom" && (
						<div className="custom-size-inputs">
							<input
								type="number"
								className="size-input"
								value={state.viewportSize.width}
								onChange={(e) =>
									handleViewportResize(parseInt(e.target.value), state.viewportSize.height)
								}
								placeholder="Width"
							/>
							<span>×</span>
							<input
								type="number"
								className="size-input"
								value={state.viewportSize.height}
								onChange={(e) =>
									handleViewportResize(state.viewportSize.width, parseInt(e.target.value))
								}
								placeholder="Height"
							/>
						</div>
					)}
				</div>

				<div className="toolbar-section">
					<VSCodeButton
						onClick={() => setIsSelectionMode(!isSelectionMode)}
						appearance={isSelectionMode ? "primary" : "secondary"}>
						<span className="codicon codicon-inspect"></span>
						{isSelectionMode ? "Selecting..." : "Select Element"}
					</VSCodeButton>
				</div>
			</div>

			<div className="web-preview-content">
				{state.isLoading && (
					<div className="loading-overlay">
						<span className="codicon codicon-loading codicon-modifier-spin"></span>
						Loading...
					</div>
				)}

				{state.url ? (
					<iframe
						ref={iframeRef}
						src={state.url}
						className="preview-iframe"
						style={{
							width: `${state.viewportSize.width}px`,
							height: `${state.viewportSize.height}px`,
						}}
						onLoad={() => {
							setState((prev) => ({ ...prev, isLoading: false }))
							setupIframeInteraction()
						}}
					/>
				) : (
					<div className="empty-state">
						<span className="codicon codicon-globe"></span>
						<p>Enter a URL to preview your web application</p>
					</div>
				)}
			</div>

			{state.selectedElement && (
				<div className="element-info">
					<h4>Selected Element</h4>
					<div className="info-item">
						<strong>Selector:</strong> <code>{state.selectedElement.selector}</code>
					</div>
					<div className="info-item">
						<strong>Position:</strong> {state.selectedElement.position.x}x{state.selectedElement.position.y}
						({state.selectedElement.position.width}x{state.selectedElement.position.height})
					</div>
				</div>
			)}
		</div>
	)
}

export default WebPreview
