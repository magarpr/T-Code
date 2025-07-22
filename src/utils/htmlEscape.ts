/**
 * Escapes HTML special characters to prevent XSS and parsing issues in webviews
 * This is critical for preventing crashes when displaying content with special characters
 * like "<<<<<<< SEARCH" which can break the webview on Windows
 */
export function escapeHtml(text: string): string {
	const htmlEscapeMap: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
		"/": "&#x2F;",
	}

	return text.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char)
}

/**
 * Recursively escapes HTML in an object's string properties
 * Useful for escaping entire message objects before sending to webview
 */
export function escapeHtmlInObject<T>(obj: T): T {
	if (obj === null || obj === undefined) {
		return obj
	}

	if (typeof obj === "string") {
		return escapeHtml(obj) as T
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => escapeHtmlInObject(item)) as T
	}

	if (typeof obj === "object") {
		// Handle Date objects
		if (obj instanceof Date) {
			return obj
		}

		const result: any = {}
		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				result[key] = escapeHtmlInObject(obj[key])
			}
		}
		return result as T
	}

	return obj
}

/**
 * Escapes HTML in ClineMessage objects, specifically targeting text fields
 * that may contain user-generated content or tool outputs
 */
export function escapeClineMessage(message: any): any {
	if (!message) return message

	const escaped = { ...message }

	// Escape text field which contains tool outputs and user messages
	if (escaped.text && typeof escaped.text === "string") {
		escaped.text = escapeHtml(escaped.text)
	}

	// Escape reasoning field if present
	if (escaped.reasoning && typeof escaped.reasoning === "string") {
		escaped.reasoning = escapeHtml(escaped.reasoning)
	}

	// Escape images array if it contains base64 data URIs
	if (escaped.images && Array.isArray(escaped.images)) {
		escaped.images = escaped.images.map((img: string) => {
			// Only escape if it's not a data URI
			if (typeof img === "string" && !img.startsWith("data:")) {
				return escapeHtml(img)
			}
			return img
		})
	}

	return escaped
}
