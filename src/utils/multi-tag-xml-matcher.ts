import { XmlMatcherResult } from "./xml-matcher"

/**
 * A multi-tag XML matcher that can match multiple tag names.
 * This is useful for handling different thinking tag formats from various models.
 */
export class MultiTagXmlMatcher<Result = XmlMatcherResult> {
	private buffer = ""
	private chunks: Result[] = []
	private state: "TEXT" | "TAG_OPEN" | "TAG_CLOSE" = "TEXT"
	private currentTag = ""
	private depth = 0
	private matchedTag = ""
	private matchedContent = ""
	private lastEmittedIndex = 0

	constructor(
		private tagNames: string[],
		private transform?: (chunks: XmlMatcherResult) => Result,
		private position = 0,
	) {}

	private emit(matched: boolean, data: string) {
		// Allow empty strings for empty tags
		const result: XmlMatcherResult = { matched, data }
		if (this.transform) {
			this.chunks.push(this.transform(result))
		} else {
			this.chunks.push(result as Result)
		}
	}

	private processBuffer() {
		let i = 0
		while (i < this.buffer.length) {
			const char = this.buffer[i]

			if (this.state === "TEXT") {
				if (char === "<") {
					// Emit any text before the tag
					if (i > this.lastEmittedIndex) {
						this.emit(false, this.buffer.substring(this.lastEmittedIndex, i))
					}
					this.state = "TAG_OPEN"
					this.currentTag = ""
					this.lastEmittedIndex = i
				}
			} else if (this.state === "TAG_OPEN") {
				if (char === ">") {
					// Check if this is a closing tag
					const isClosing = this.currentTag.startsWith("/")
					const tagName = isClosing ? this.currentTag.substring(1) : this.currentTag

					if (this.tagNames.includes(tagName)) {
						if (isClosing && this.matchedTag === tagName) {
							this.depth--
							if (this.depth === 0) {
								// Emit the matched content
								this.emit(true, this.matchedContent)
								this.matchedContent = ""
								this.matchedTag = ""
								this.lastEmittedIndex = i + 1
							}
						} else if (!isClosing) {
							if (this.depth === 0) {
								this.matchedTag = tagName
								this.lastEmittedIndex = i + 1
								this.matchedContent = "" // Reset matched content
							}
							this.depth++
						}
					}
					this.state = "TEXT"
				} else if (char !== "/" || this.currentTag.length > 0) {
					this.currentTag += char
				} else {
					this.currentTag += char
				}
			}

			// If we're inside a matched tag, collect the content
			if (this.depth > 0 && this.state === "TEXT" && i >= this.lastEmittedIndex) {
				this.matchedContent += char
			}

			i++
		}

		// Emit any remaining text
		if (this.state === "TEXT" && this.depth === 0 && this.lastEmittedIndex < this.buffer.length) {
			this.emit(false, this.buffer.substring(this.lastEmittedIndex))
			this.lastEmittedIndex = this.buffer.length
		}
	}

	update(chunk: string): Result[] {
		this.chunks = []
		this.buffer += chunk
		this.processBuffer()

		// Keep unprocessed content in buffer
		if (this.lastEmittedIndex > 0 && this.depth === 0) {
			this.buffer = this.buffer.substring(this.lastEmittedIndex)
			this.lastEmittedIndex = 0
		}

		const result = this.chunks
		this.chunks = []
		return result
	}

	final(chunk?: string): Result[] {
		this.chunks = []
		if (chunk) {
			this.buffer += chunk
		}

		// Process any remaining buffer
		this.processBuffer()

		// Emit any remaining content
		if (this.buffer.length > this.lastEmittedIndex) {
			if (this.depth > 0 && this.matchedContent) {
				// Incomplete tag, emit as text
				this.emit(false, this.buffer.substring(this.lastEmittedIndex))
			} else {
				this.emit(false, this.buffer.substring(this.lastEmittedIndex))
			}
		}

		// Reset state
		this.buffer = ""
		this.lastEmittedIndex = 0
		this.depth = 0
		this.matchedTag = ""
		this.matchedContent = ""
		this.state = "TEXT"

		return this.chunks
	}
}
