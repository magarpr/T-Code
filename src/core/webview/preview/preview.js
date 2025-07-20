/* eslint-env browser */
/* global acquireVsCodeApi */

;(function () {
	const vscode = acquireVsCodeApi()

	let isInspectorMode = false
	let currentHighlight = null
	let iframe = null
	let overlay = null

	// Device presets for responsive preview
	const devicePresets = {
		desktop: { width: "100%", height: "100%", name: "Desktop" },
		"iphone-14": { width: 390, height: 844, name: "iPhone 14" },
		"iphone-se": { width: 375, height: 667, name: "iPhone SE" },
		ipad: { width: 820, height: 1180, name: "iPad" },
		"pixel-7": { width: 412, height: 915, name: "Pixel 7" },
		"galaxy-s21": { width: 360, height: 800, name: "Galaxy S21" },
	}

	// Initialize when DOM is ready
	document.addEventListener("DOMContentLoaded", () => {
		iframe = document.getElementById("preview")
		overlay = document.getElementById("elementOverlay")

		setupControls()
		setupMessageHandlers()

		// Send ready message
		vscode.postMessage({ type: "previewReady" })
	})

	function setupControls() {
		// URL input and go button
		const urlInput = document.getElementById("urlInput")
		const goButton = document.getElementById("goButton")

		goButton.addEventListener("click", () => {
			const url = urlInput.value.trim()
			if (url) {
				loadUrl(url)
			}
		})

		urlInput.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				const url = urlInput.value.trim()
				if (url) {
					loadUrl(url)
				}
			}
		})

		// Device selector
		const deviceSelector = document.getElementById("deviceSelector")
		deviceSelector.addEventListener("change", (e) => {
			const value = e.target.value
			if (value === "responsive") {
				iframe.style.width = "100%"
				iframe.style.height = "100%"
			} else {
				const [width, height] = value.split("x")
				setViewport(parseInt(width), parseInt(height))
			}
		})

		// Inspector toggle
		const toggleInspector = document.getElementById("toggleInspector")
		toggleInspector.addEventListener("click", () => {
			isInspectorMode = !isInspectorMode
			toggleInspector.classList.toggle("active", isInspectorMode)

			if (isInspectorMode) {
				enableInspectorMode()
			} else {
				disableInspectorMode()
			}
		})
	}

	function setupMessageHandlers() {
		window.addEventListener("message", (event) => {
			const message = event.data

			switch (message.type) {
				case "loadUrl":
					loadUrl(message.url)
					break
				case "setViewport":
					setViewport(message.width, message.height)
					break
			}
		})
	}

	function applyDevicePreset(deviceKey, deviceFrame, iframe) {
		const preset = devicePresets[deviceKey]

		if (deviceKey === "desktop") {
			deviceFrame.className = "device-frame desktop"
			deviceFrame.style.width = ""
			deviceFrame.style.height = ""
			iframe.style.width = "100%"
			iframe.style.height = "100%"
		} else {
			deviceFrame.className = "device-frame mobile"
			deviceFrame.style.width = preset.width + "px"
			deviceFrame.style.height = preset.height + "px"
			iframe.style.width = "100%"
			iframe.style.height = "100%"
		}
	}

	function loadUrl(url) {
		// Ensure URL has protocol
		if (!url.startsWith("http://") && !url.startsWith("https://")) {
			url = "http://" + url
		}

		try {
			iframe.src = url
			document.getElementById("urlInput").value = url

			// Notify extension
			vscode.postMessage({
				type: "urlChanged",
				url: url,
			})

			// Setup iframe load handler
			iframe.onload = () => {
				if (isInspectorMode) {
					injectInspectorScript()
				}
			}
		} catch (error) {
			vscode.postMessage({
				type: "error",
				error: error.message,
			})
		}
	}

	function setViewport(width, height) {
		iframe.style.width = width + "px"
		iframe.style.height = height + "px"

		vscode.postMessage({
			type: "viewportChanged",
			viewport: { width, height },
		})
	}

	function enableInspectorMode() {
		overlay.style.display = "block"
		overlay.style.pointerEvents = "auto"

		// Add click handler to overlay
		overlay.addEventListener("click", handleOverlayClick)
		overlay.addEventListener("mousemove", handleOverlayMouseMove)

		// Inject inspector script into iframe
		injectInspectorScript()
	}

	function disableInspectorMode() {
		overlay.style.display = "none"
		overlay.style.pointerEvents = "none"

		// Remove handlers
		overlay.removeEventListener("click", handleOverlayClick)
		overlay.removeEventListener("mousemove", handleOverlayMouseMove)

		// Clear highlight
		if (currentHighlight) {
			currentHighlight.remove()
			currentHighlight = null
		}

		// Remove inspector from iframe
		try {
			if (iframe.contentWindow) {
				iframe.contentWindow.postMessage({ type: "disableInspector" }, "*")
			}
		} catch (e) {
			// Cross-origin restriction
		}
	}

	function injectInspectorScript() {
		try {
			const iframeDoc = iframe.contentDocument || iframe.contentWindow.document

			// Check if we can access the iframe content
			if (!iframeDoc) {
				console.warn("Cannot access iframe content - cross-origin restriction")
				return
			}

			// Inject inspector script
			const script = iframeDoc.createElement("script")
			script.textContent = `
                (function() {
                    let hoveredElement = null;
                    let highlightDiv = null;
                    
                    function createHighlight() {
                        if (highlightDiv) {
                            highlightDiv.remove();
                        }
                        
                        highlightDiv = document.createElement('div');
                        highlightDiv.style.position = 'absolute';
                        highlightDiv.style.border = '2px solid #0066ff';
                        highlightDiv.style.backgroundColor = 'rgba(0, 102, 255, 0.1)';
                        highlightDiv.style.pointerEvents = 'none';
                        highlightDiv.style.zIndex = '999999';
                        document.body.appendChild(highlightDiv);
                    }
                    
                    function updateHighlight(element) {
                        if (!highlightDiv) {
                            createHighlight();
                        }
                        
                        const rect = element.getBoundingClientRect();
                        highlightDiv.style.left = rect.left + window.scrollX + 'px';
                        highlightDiv.style.top = rect.top + window.scrollY + 'px';
                        highlightDiv.style.width = rect.width + 'px';
                        highlightDiv.style.height = rect.height + 'px';
                    }
                    
                    function getElementContext(element) {
                        const rect = element.getBoundingClientRect();
                        const styles = window.getComputedStyle(element);
                        
                        // Get CSS rules
                        let cssRules = [];
                        try {
                            for (let sheet of document.styleSheets) {
                                for (let rule of sheet.cssRules) {
                                    if (rule.selectorText && element.matches(rule.selectorText)) {
                                        cssRules.push(rule.cssText);
                                    }
                                }
                            }
                        } catch (e) {
                            // Cross-origin stylesheets
                        }
                        
                        // Get attributes
                        const attributes = {};
                        for (let attr of element.attributes) {
                            attributes[attr.name] = attr.value;
                        }
                        
                        // Get XPath
                        function getXPath(el) {
                            if (el.id) return '//*[@id="' + el.id + '"]';
                            if (el === document.body) return '/html/body';
                            
                            let ix = 0;
                            const siblings = el.parentNode.childNodes;
                            for (let i = 0; i < siblings.length; i++) {
                                const sibling = siblings[i];
                                if (sibling === el) {
                                    return getXPath(el.parentNode) + '/' + el.tagName.toLowerCase() + '[' + (ix + 1) + ']';
                                }
                                if (sibling.nodeType === 1 && sibling.tagName === el.tagName) {
                                    ix++;
                                }
                            }
                        }
                        
                        // Get CSS selector
                        function getCssSelector(el) {
                            const path = [];
                            while (el.nodeType === Node.ELEMENT_NODE) {
                                let selector = el.nodeName.toLowerCase();
                                if (el.id) {
                                    selector += '#' + el.id;
                                    path.unshift(selector);
                                    break;
                                } else {
                                    let sibling = el;
                                    let nth = 1;
                                    while (sibling = sibling.previousElementSibling) {
                                        if (sibling.nodeName.toLowerCase() === selector) nth++;
                                    }
                                    if (nth !== 1) selector += ':nth-of-type(' + nth + ')';
                                }
                                path.unshift(selector);
                                el = el.parentNode;
                            }
                            return path.join(' > ');
                        }
                        
                        return {
                            html: element.outerHTML,
                            css: cssRules.join('\\n'),
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
                                margin: styles.margin,
                                padding: styles.padding,
                                color: styles.color,
                                backgroundColor: styles.backgroundColor,
                                fontSize: styles.fontSize,
                                fontFamily: styles.fontFamily
                            },
                            attributes: attributes,
                            xpath: getXPath(element),
                            selector: getCssSelector(element)
                        };
                    }
                    
                    // Mouse move handler
                    document.addEventListener('mousemove', (e) => {
                        const element = document.elementFromPoint(e.clientX, e.clientY);
                        if (element && element !== hoveredElement) {
                            hoveredElement = element;
                            updateHighlight(element);
                        }
                    });
                    
                    // Click handler
                    document.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const element = document.elementFromPoint(e.clientX, e.clientY);
                        if (element) {
                            const context = getElementContext(element);
                            
                            // Send to parent window
                            window.parent.postMessage({
                                type: 'elementSelected',
                                context: context
                            }, '*');
                        }
                        
                        return false;
                    }, true);
                    
                    // Listen for disable message
                    window.addEventListener('message', (e) => {
                        if (e.data.type === 'disableInspector') {
                            if (highlightDiv) {
                                highlightDiv.remove();
                                highlightDiv = null;
                            }
                        }
                    });
                })();
            `

			iframeDoc.body.appendChild(script)
		} catch (error) {
			console.error("Error injecting inspector script:", error)
			vscode.postMessage({
				type: "error",
				error: "Cannot inspect elements on this page due to security restrictions",
			})
		}
	}

	function handleOverlayClick(e) {
		// Calculate position relative to iframe
		const iframeRect = iframe.getBoundingClientRect()
		const x = e.clientX - iframeRect.left
		const y = e.clientY - iframeRect.top

		// Try to get element from iframe
		try {
			if (iframe.contentWindow) {
				iframe.contentWindow.postMessage(
					{
						type: "click",
						x: x,
						y: y,
					},
					"*",
				)
			}
		} catch (error) {
			// Cross-origin restriction
			vscode.postMessage({
				type: "error",
				error: "Cannot inspect elements on cross-origin pages",
			})
		}
	}

	function handleOverlayMouseMove(e) {
		// Similar to click, but for hover effects
		const iframeRect = iframe.getBoundingClientRect()
		const x = e.clientX - iframeRect.left
		const y = e.clientY - iframeRect.top

		try {
			if (iframe.contentWindow) {
				iframe.contentWindow.postMessage(
					{
						type: "mousemove",
						x: x,
						y: y,
					},
					"*",
				)
			}
		} catch (error) {
			// Ignore cross-origin errors for mousemove
		}
	}

	// Listen for messages from iframe
	window.addEventListener("message", (event) => {
		if (event.data.type === "elementSelected" && event.data.context) {
			// Forward to extension
			vscode.postMessage({
				type: "elementSelected",
				elementContext: event.data.context,
			})

			// Disable inspector mode after selection
			isInspectorMode = false
			document.getElementById("toggleInspector").classList.remove("active")
			disableInspectorMode()
		}
	})
})()
