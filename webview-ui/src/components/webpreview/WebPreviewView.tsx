import React, { useState, useRef, useEffect, useCallback } from "react"
import { VSCodeButton, VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { vscode } from "../../utils/vscode"
import "./WebPreviewView.css"

interface Device {
	name: string
	width: number
	height: number
	userAgent: string
}

const DEVICES: Device[] = [
	{
		name: "Desktop",
		width: 1920,
		height: 1080,
		userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
	},
	{
		name: "Laptop",
		width: 1366,
		height: 768,
		userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
	},
	{
		name: "iPad",
		width: 768,
		height: 1024,
		userAgent: "Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
	},
	{
		name: "iPhone 14",
		width: 390,
		height: 844,
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
	},
	{
		name: "Pixel 5",
		width: 393,
		height: 851,
		userAgent: "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36",
	},
]

export const WebPreviewView: React.FC = () => {
	const [url, setUrl] = useState("http://localhost:3000")
	const [selectedDevice, setSelectedDevice] = useState<Device>(DEVICES[0])
	const [isSelecting, setIsSelecting] = useState(false)
	const [scale, setScale] = useState(1)
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)

	// Handle messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			switch (message.type) {
				case "webPreviewConfig":
					if (message.config?.defaultUrl) {
						setUrl(message.config.defaultUrl)
					}
					break
				case "webPreviewNavigate":
					if (message.url) {
						setUrl(message.url)
						if (iframeRef.current) {
							iframeRef.current.src = message.url
						}
					}
					break
				case "webPreviewSetDevice": {
					const device = DEVICES.find((d) => d.name === message.device)
					if (device) {
						setSelectedDevice(device)
					}
					break
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	// Notify extension when ready
	useEffect(() => {
		vscode.postMessage({ type: "webPreviewReady" })
	}, [])

	// Calculate scale to fit device in container
	useEffect(() => {
		const updateScale = () => {
			if (containerRef.current) {
				const containerWidth = containerRef.current.clientWidth - 40 // padding
				const containerHeight = containerRef.current.clientHeight - 120 // header height
				const scaleX = containerWidth / selectedDevice.width
				const scaleY = containerHeight / selectedDevice.height
				setScale(Math.min(scaleX, scaleY, 1))
			}
		}

		updateScale()
		window.addEventListener("resize", updateScale)
		return () => window.removeEventListener("resize", updateScale)
	}, [selectedDevice])

	const handleNavigate = useCallback(() => {
		if (iframeRef.current) {
			iframeRef.current.src = url
			vscode.postMessage({ type: "webPreviewNavigate", url })
		}
	}, [url])

	const handleDeviceChange = useCallback((e: any) => {
		const device = DEVICES.find((d) => d.name === e.target.value)
		if (device) {
			setSelectedDevice(device)
		}
	}, [])

	const toggleElementSelection = useCallback(() => {
		setIsSelecting(!isSelecting)
		if (!isSelecting && iframeRef.current) {
			// Inject element selection script into iframe
			try {
				const script = `
					(function() {
						let overlay = null;
						let selectedElement = null;
						
						function createOverlay() {
							overlay = document.createElement('div');
							overlay.style.position = 'absolute';
							overlay.style.border = '2px solid #007ACC';
							overlay.style.backgroundColor = 'rgba(0, 122, 204, 0.1)';
							overlay.style.pointerEvents = 'none';
							overlay.style.zIndex = '999999';
							document.body.appendChild(overlay);
						}
						
						function updateOverlay(element) {
							if (!overlay) createOverlay();
							const rect = element.getBoundingClientRect();
							overlay.style.left = rect.left + 'px';
							overlay.style.top = rect.top + 'px';
							overlay.style.width = rect.width + 'px';
							overlay.style.height = rect.height + 'px';
						}
						
						function removeOverlay() {
							if (overlay) {
								overlay.remove();
								overlay = null;
							}
						}
						
						function getElementContext(element) {
							const rect = element.getBoundingClientRect();
							const styles = window.getComputedStyle(element);
							const attributes = {};
							for (let attr of element.attributes) {
								attributes[attr.name] = attr.value;
							}
							
							return {
								html: element.outerHTML,
								css: element.getAttribute('style') || '',
								xpath: getXPath(element),
								selector: getSelector(element),
								position: {
									x: rect.left,
									y: rect.top,
									width: rect.width,
									height: rect.height
								},
								computedStyles: {
									display: styles.display,
									position: styles.position,
									width: styles.width,
									height: styles.height,
									color: styles.color,
									'background-color': styles.backgroundColor,
									'font-size': styles.fontSize
								},
								attributes: attributes
							};
						}
						
						function getXPath(element) {
							if (element.id) return '//*[@id="' + element.id + '"]';
							if (element === document.body) return '/html/body';
							
							let ix = 0;
							const siblings = element.parentNode.childNodes;
							for (let i = 0; i < siblings.length; i++) {
								const sibling = siblings[i];
								if (sibling === element) {
									return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
								}
								if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
									ix++;
								}
							}
						}
						
						function getSelector(element) {
							const names = [];
							while (element.parentElement) {
								if (element.id) {
									names.unshift('#' + element.id);
									break;
								} else {
									let c = 1, e = element;
									for (; e.previousElementSibling; e = e.previousElementSibling, c++);
									names.unshift(element.tagName.toLowerCase() + ':nth-child(' + c + ')');
								}
								element = element.parentElement;
							}
							return names.join(' > ');
						}
						
						document.addEventListener('mouseover', function(e) {
							if (e.target !== overlay) {
								updateOverlay(e.target);
								selectedElement = e.target;
							}
						});
						
						document.addEventListener('mouseout', function(e) {
							removeOverlay();
						});
						
						document.addEventListener('click', function(e) {
							e.preventDefault();
							e.stopPropagation();
							if (selectedElement) {
								const context = getElementContext(selectedElement);
								window.parent.postMessage({
									type: 'elementSelected',
									element: context
								}, '*');
							}
							return false;
						}, true);
					})();
				`

				const iframeWindow = iframeRef.current.contentWindow as any
				if (iframeWindow && iframeWindow.eval) {
					iframeWindow.eval(script)
				}
			} catch (error) {
				console.error("Failed to inject selection script:", error)
				vscode.postMessage({ type: "webPreviewError", error: "Failed to enable element selection" })
			}
		}
	}, [isSelecting])

	// Handle messages from iframe
	useEffect(() => {
		const handleIframeMessage = (event: MessageEvent) => {
			if (event.data.type === "elementSelected") {
				vscode.postMessage({
					type: "webPreviewElementSelected",
					element: event.data.element,
				})
				setIsSelecting(false)
			}
		}

		window.addEventListener("message", handleIframeMessage)
		return () => window.removeEventListener("message", handleIframeMessage)
	}, [])

	return (
		<div className="web-preview-container">
			<div className="web-preview-header">
				<div className="url-bar">
					<VSCodeTextField
						value={url}
						onChange={(e: any) => setUrl(e.target.value)}
						onKeyPress={(e: any) => e.key === "Enter" && handleNavigate()}
						placeholder="Enter URL..."
						className="url-input"
					/>
					<VSCodeButton onClick={handleNavigate}>Go</VSCodeButton>
				</div>
				<div className="controls">
					<VSCodeDropdown value={selectedDevice.name} onChange={handleDeviceChange}>
						{DEVICES.map((device) => (
							<VSCodeOption key={device.name} value={device.name}>
								{device.name} ({device.width}x{device.height})
							</VSCodeOption>
						))}
					</VSCodeDropdown>
					<VSCodeButton appearance={isSelecting ? "primary" : "secondary"} onClick={toggleElementSelection}>
						{isSelecting ? "Cancel Selection" : "Select Element"}
					</VSCodeButton>
				</div>
			</div>
			<div className="web-preview-content" ref={containerRef}>
				<div
					className="device-frame"
					style={{
						width: selectedDevice.width,
						height: selectedDevice.height,
						transform: `scale(${scale})`,
						transformOrigin: "top left",
					}}>
					<iframe
						ref={iframeRef}
						src={url}
						style={{
							width: "100%",
							height: "100%",
							border: "none",
						}}
						sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
					/>
				</div>
			</div>
		</div>
	)
}

export default WebPreviewView
