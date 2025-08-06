import { XMLParser } from "fast-xml-parser"

/**
 * Encapsulated XML parser with circuit breaker pattern
 *
 * This dual-parser system handles interference from external XML parsers (like xml2js)
 * that may be loaded globally by other VSCode extensions. When the primary parser
 * (fast-xml-parser) fails due to external interference, it automatically falls back
 * to a regex-based parser.
 *
 * Note: This parser instance should not be used concurrently as parseFailureCount
 * is not thread-safe. However, this is not an issue in practice since JavaScript
 * is single-threaded.
 */
class XmlParserWithFallback {
	private parseFailureCount = 0
	private readonly MAX_FAILURES = 3
	private readonly MAX_XML_SIZE = 10 * 1024 * 1024 // 10MB limit for fallback parser

	/**
	 * Fallback XML parser for apply_diff structure when fast-xml-parser fails
	 * Uses regex-based parsing as a last resort
	 * @param xmlString The XML string to parse
	 * @returns Parsed object with file entries
	 */
	private fallbackXmlParse(xmlString: string): any {
		// Check size limit to prevent memory exhaustion on very large files
		if (xmlString.length > this.MAX_XML_SIZE) {
			throw new Error(
				`XML content exceeds maximum size limit of ${this.MAX_XML_SIZE / 1024 / 1024}MB for fallback parser`,
			)
		}

		const result: any = { file: [] }

		// Extract file entries
		const fileMatches = xmlString.matchAll(/<file>([\s\S]*?)<\/file>/g)

		for (const match of fileMatches) {
			const fileContent = match[1]

			// Extract path
			const pathMatch = fileContent.match(/<path>(.*?)<\/path>/)
			if (!pathMatch) {
				throw new Error("Fallback parser: <file> entry missing <path> element")
			}
			const path = pathMatch[1].trim()

			// Extract diff blocks
			const diffMatches = fileContent.matchAll(/<diff>([\s\S]*?)<\/diff>/g)
			const diffs = []

			for (const diffMatch of diffMatches) {
				const diffContent = diffMatch[1]

				// Extract content (handle CDATA and regular content)
				let content = null
				const cdataMatch = diffContent.match(/<content><!\[CDATA\[([\s\S]*?)\]\]><\/content>/)
				if (cdataMatch) {
					content = cdataMatch[1]
				} else {
					const contentMatch = diffContent.match(/<content>([\s\S]*?)<\/content>/)
					content = contentMatch ? contentMatch[1] : null
				}

				// Extract start_line
				const startLineMatch = diffContent.match(/<start_line>(.*?)<\/start_line>/)
				const startLine = startLineMatch ? startLineMatch[1].trim() : undefined

				if (content !== null) {
					diffs.push({
						content,
						start_line: startLine,
					})
				}
			}

			if (diffs.length > 0) {
				result.file.push({
					path,
					diff: diffs.length === 1 ? diffs[0] : diffs,
				})
			}
		}

		// If only one file, return it as a single object instead of array
		if (result.file.length === 1) {
			result.file = result.file[0]
		} else if (result.file.length === 0) {
			// No valid files found
			throw new Error("No valid file entries found in XML structure")
		}

		return result
	}

	/**
	 * Parses an XML string into a JavaScript object
	 * @param xmlString The XML string to parse
	 * @param stopNodes Optional array of node names to stop parsing at
	 * @returns Parsed JavaScript object representation of the XML
	 * @throws Error if the XML is invalid or parsing fails
	 */
	parse(xmlString: string, stopNodes?: string[]): unknown {
		// Validate input
		if (!xmlString || typeof xmlString !== "string") {
			throw new Error(`Invalid XML input: expected string, got ${typeof xmlString}`)
		}

		const _stopNodes = stopNodes ?? []
		try {
			const parser = new XMLParser({
				ignoreAttributes: false,
				attributeNamePrefix: "@_",
				parseAttributeValue: false,
				parseTagValue: false,
				trimValues: true,
				stopNodes: _stopNodes,
			})

			const result = parser.parse(xmlString)

			// Reset failure count on success
			if (this.parseFailureCount > 0) {
				this.parseFailureCount = 0
			}

			return result
		} catch (error) {
			// Enhance error message for better debugging
			// Handle cases where error might not be an Error instance (e.g., strings, objects)
			let errorMessage: string
			if (error instanceof Error) {
				errorMessage = error.message
			} else if (typeof error === "string") {
				errorMessage = error
			} else if (error && typeof error === "object" && "toString" in error) {
				errorMessage = error.toString()
			} else {
				errorMessage = "Unknown error"
			}

			// Check for xml2js specific error patterns - IMMEDIATELY use fallback
			if (errorMessage.includes("addChild")) {
				// Don't wait for multiple failures - use fallback immediately for addChild errors
				try {
					const result = this.fallbackXmlParse(xmlString)
					return result
				} catch (fallbackError) {
					const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : "Unknown error"
					// Still throw the error but make it clear we tried the fallback
					throw new Error(
						`XML parsing failed with fallback parser. Fallback parser also failed: ${fallbackErrorMsg}`,
					)
				}
			}

			// For other errors, also consider using fallback after repeated failures
			this.parseFailureCount++

			if (this.parseFailureCount >= this.MAX_FAILURES) {
				try {
					const result = this.fallbackXmlParse(xmlString)
					// Reset counter on successful fallback
					this.parseFailureCount = 0
					return result
				} catch (fallbackError) {
					// Reset counter after fallback attempt
					this.parseFailureCount = 0
					const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : "Unknown error"
					throw new Error(
						`XML parsing failed with both parsers. Original: ${errorMessage}, Fallback: ${fallbackErrorMsg}`,
					)
				}
			}

			throw new Error(`Failed to parse XML: ${errorMessage}`)
		}
	}
}

// Create a singleton instance
const xmlParserInstance = new XmlParserWithFallback()

/**
 * Parses an XML string into a JavaScript object
 * @param xmlString The XML string to parse
 * @param stopNodes Optional array of node names to stop parsing at
 * @returns Parsed JavaScript object representation of the XML
 * @throws Error if the XML is invalid or parsing fails
 */
export function parseXml(xmlString: string, stopNodes?: string[]): unknown {
	return xmlParserInstance.parse(xmlString, stopNodes)
}
