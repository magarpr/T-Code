import { describe, it, expect } from "vitest"
import { escapeHtml, escapeHtmlInObject, escapeClineMessage } from "../htmlEscape"

describe("htmlEscape", () => {
	describe("escapeHtml", () => {
		it("should escape HTML special characters", () => {
			expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
				"&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;",
			)
		})

		it("should escape angle brackets used in diff markers", () => {
			expect(escapeHtml("<<<<<<< SEARCH")).toBe("&lt;&lt;&lt;&lt;&lt;&lt;&lt; SEARCH")
			expect(escapeHtml("=======")).toBe("=======")
			expect(escapeHtml(">>>>>>> REPLACE")).toBe("&gt;&gt;&gt;&gt;&gt;&gt;&gt; REPLACE")
		})

		it("should escape all special characters", () => {
			expect(escapeHtml("& < > \" ' /")).toBe("&amp; &lt; &gt; &quot; &#39; &#x2F;")
		})

		it("should handle empty strings", () => {
			expect(escapeHtml("")).toBe("")
		})

		it("should handle strings without special characters", () => {
			expect(escapeHtml("Hello World")).toBe("Hello World")
		})

		it("should handle the specific Windows crash case", () => {
			const diffContent = `<<<<<<< SEARCH
:start_line:1
-------
def calculate_total(items):
    total = 0
    for item in items:
        total += item
    return total
=======
def calculate_total(items):
    """Calculate total with 10% markup"""
    return sum(item * 1.1 for item in items)
>>>>>>> REPLACE`

			const escaped = escapeHtml(diffContent)
			expect(escaped).toContain("&lt;&lt;&lt;&lt;&lt;&lt;&lt; SEARCH")
			expect(escaped).toContain("&gt;&gt;&gt;&gt;&gt;&gt;&gt; REPLACE")
			expect(escaped).not.toContain("<<<<<<< SEARCH")
			expect(escaped).not.toContain(">>>>>>> REPLACE")
		})
	})

	describe("escapeHtmlInObject", () => {
		it("should escape strings in objects", () => {
			const obj = {
				text: "<div>Hello</div>",
				nested: {
					value: '<script>alert("XSS")</script>',
				},
			}

			const escaped = escapeHtmlInObject(obj)
			expect(escaped.text).toBe("&lt;div&gt;Hello&lt;&#x2F;div&gt;")
			expect(escaped.nested.value).toBe("&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;")
		})

		it("should handle arrays", () => {
			const arr = ["<div>1</div>", "<div>2</div>"]
			const escaped = escapeHtmlInObject(arr)
			expect(escaped[0]).toBe("&lt;div&gt;1&lt;&#x2F;div&gt;")
			expect(escaped[1]).toBe("&lt;div&gt;2&lt;&#x2F;div&gt;")
		})

		it("should handle null and undefined", () => {
			expect(escapeHtmlInObject(null)).toBe(null)
			expect(escapeHtmlInObject(undefined)).toBe(undefined)
		})

		it("should preserve non-string values", () => {
			const obj = {
				text: "<div>Hello</div>",
				number: 123,
				boolean: true,
				date: new Date("2024-01-01"),
			}

			const escaped = escapeHtmlInObject(obj)
			expect(escaped.text).toBe("&lt;div&gt;Hello&lt;&#x2F;div&gt;")
			expect(escaped.number).toBe(123)
			expect(escaped.boolean).toBe(true)
			expect(escaped.date).toEqual(new Date("2024-01-01"))
		})
	})

	describe("escapeClineMessage", () => {
		it("should escape text field in ClineMessage", () => {
			const message = {
				ts: 1234567890,
				type: "say",
				say: "tool",
				text: "<<<<<<< SEARCH\n:start_line:1\n-------\ncode here\n=======\nnew code\n>>>>>>> REPLACE",
			}

			const escaped = escapeClineMessage(message)
			expect(escaped.text).toContain("&lt;&lt;&lt;&lt;&lt;&lt;&lt; SEARCH")
			expect(escaped.text).toContain("&gt;&gt;&gt;&gt;&gt;&gt;&gt; REPLACE")
			expect(escaped.ts).toBe(1234567890)
			expect(escaped.type).toBe("say")
		})

		it("should escape reasoning field if present", () => {
			const message = {
				type: "say",
				reasoning: "<thinking>This is my reasoning</thinking>",
			}

			const escaped = escapeClineMessage(message)
			expect(escaped.reasoning).toBe("&lt;thinking&gt;This is my reasoning&lt;&#x2F;thinking&gt;")
		})

		it("should handle images array", () => {
			const message = {
				type: "say",
				images: ["data:image/png;base64,iVBORw0KGgo...", '<img src="xss">', "https://example.com/image.png"],
			}

			const escaped = escapeClineMessage(message)
			expect(escaped.images[0]).toBe("data:image/png;base64,iVBORw0KGgo...") // Data URIs not escaped
			expect(escaped.images[1]).toBe("&lt;img src=&quot;xss&quot;&gt;")
			expect(escaped.images[2]).toBe("https:&#x2F;&#x2F;example.com&#x2F;image.png")
		})

		it("should handle null or undefined messages", () => {
			expect(escapeClineMessage(null)).toBe(null)
			expect(escapeClineMessage(undefined)).toBe(undefined)
		})

		it("should not modify original message", () => {
			const message = {
				text: "<div>Hello</div>",
			}

			const escaped = escapeClineMessage(message)
			expect(message.text).toBe("<div>Hello</div>")
			expect(escaped.text).toBe("&lt;div&gt;Hello&lt;&#x2F;div&gt;")
		})
	})
})
