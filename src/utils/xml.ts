import { XMLParser } from "fast-xml-parser"

/**
 * Encapsulated XML parser with fallback mechanism
 *
 * This dual-parser system handles parsing errors that may occur when fast-xml-parser
 * encounters complex or deeply nested XML structures. When the primary parser
 * (fast-xml-parser) fails, it automatically falls back to a regex-based parser.
 */
class XmlParserWithFallback {
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

			return parser.parse(xmlString)
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

			// Try fallback parser for any parsing error
			// This handles parsing failures on complex XML structures
			try {
				const result = this.fallbackXmlParse(xmlString)
				return result
			} catch (fallbackError) {
				const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : "Unknown error"
				// Provide context about the parsing failure
				const errorContext = errorMessage.includes("addChild")
					? "XML parsing failed due to fast-xml-parser error on complex structure."
					: "XML parsing failed."

				throw new Error(
					`${errorContext} Fallback parser also failed. Original: ${errorMessage}, Fallback: ${fallbackErrorMsg}`,
				)
			}
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
