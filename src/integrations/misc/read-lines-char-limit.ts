import { createReadStream } from "fs"

/**
 * Result of reading lines with character limit
 */
export interface ReadLinesCharLimitResult {
	/** The content that was read */
	content: string
	/** The number of complete lines that were read */
	linesRead: number
	/** Whether the file was truncated due to character limit */
	wasTruncated: boolean
	/** Total number of characters read (excluding any incomplete final line) */
	charactersRead: number
}

/**
 * Reads lines from a file up to a maximum character count, ensuring we don't
 * break in the middle of a line.
 *
 * @param filepath - Path to the file to read
 * @param maxChars - Maximum number of characters to read
 * @param startLine - Optional. The line number to start reading from (0-based, inclusive)
 * @returns Promise resolving to the read result with content and metadata
 */
export function readLinesWithCharLimit(
	filepath: string,
	maxChars: number,
	startLine: number = 0,
): Promise<ReadLinesCharLimitResult> {
	return new Promise((resolve, reject) => {
		// Validate inputs
		if (maxChars <= 0) {
			return reject(new RangeError(`maxChars must be positive, got ${maxChars}`))
		}
		if (startLine < 0) {
			return reject(new RangeError(`startLine must be non-negative, got ${startLine}`))
		}

		const input = createReadStream(filepath, { encoding: "utf8" })
		let buffer = ""
		let currentLineNumber = 0
		let result = ""
		let charactersRead = 0
		let linesIncluded = 0
		let wasTruncated = false

		// Handle errors
		input.on("error", reject)

		// Process data chunks
		input.on("data", (chunk) => {
			buffer += chunk.toString()

			let pos = 0
			let nextNewline = buffer.indexOf("\n", pos)

			// Process complete lines in the buffer
			while (nextNewline !== -1) {
				const lineWithNewline = buffer.substring(pos, nextNewline + 1)

				// Check if we're past the start line
				if (currentLineNumber >= startLine) {
					// Check if adding this line would exceed the character limit
					if (charactersRead + lineWithNewline.length > maxChars) {
						// We've hit the limit, stop reading
						wasTruncated = true
						input.destroy()
						resolve({
							content: result,
							linesRead: linesIncluded,
							wasTruncated,
							charactersRead,
						})
						return
					}

					// Add the line to the result
					result += lineWithNewline
					charactersRead += lineWithNewline.length
					linesIncluded++
				}

				// Move to next line
				pos = nextNewline + 1
				currentLineNumber++
				nextNewline = buffer.indexOf("\n", pos)
			}

			// Keep the incomplete line in the buffer
			buffer = buffer.substring(pos)
		})

		// Handle end of file
		input.on("end", () => {
			// Process any remaining data in buffer (last line without newline)
			if (buffer.length > 0 && currentLineNumber >= startLine) {
				// Check if adding this final line would exceed the limit
				if (charactersRead + buffer.length <= maxChars) {
					result += buffer
					charactersRead += buffer.length
					linesIncluded++
				} else {
					// Mark as truncated if we couldn't include the last line
					wasTruncated = true
				}
			}

			resolve({
				content: result,
				linesRead: linesIncluded,
				wasTruncated,
				charactersRead,
			})
		})
	})
}
