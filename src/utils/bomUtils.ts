/**
 * UTF-8 BOM (Byte Order Mark) utilities
 */

// UTF-8 BOM as a string
export const UTF8_BOM = "\uFEFF"

// UTF-8 BOM as bytes
export const UTF8_BOM_BYTES = Buffer.from([0xef, 0xbb, 0xbf])

/**
 * Strips UTF-8 BOM from the beginning of a string if present
 * @param content The string content to process
 * @returns The content with BOM removed if it was present
 */
export function stripBOM(content: string): string {
	if (content.charCodeAt(0) === 0xfeff) {
		return content.slice(1)
	}
	return content
}

/**
 * Checks if a buffer starts with UTF-8 BOM
 * @param buffer The buffer to check
 * @returns True if the buffer starts with UTF-8 BOM
 */
export function hasBOM(buffer: Buffer): boolean {
	return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
}

/**
 * Strips UTF-8 BOM from the beginning of a buffer if present
 * @param buffer The buffer to process
 * @returns A new buffer with BOM removed if it was present
 */
export function stripBOMFromBuffer(buffer: Buffer): Buffer {
	if (hasBOM(buffer)) {
		return buffer.slice(3)
	}
	return buffer
}
