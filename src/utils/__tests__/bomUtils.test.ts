import { describe, it, expect } from "vitest"
import { stripBOM, hasBOM, stripBOMFromBuffer, UTF8_BOM, UTF8_BOM_BYTES } from "../bomUtils"

describe("bomUtils", () => {
	describe("stripBOM", () => {
		it("should strip BOM from string with BOM", () => {
			const contentWithBOM = UTF8_BOM + "Hello World"
			const result = stripBOM(contentWithBOM)
			expect(result).toBe("Hello World")
		})

		it("should return unchanged string without BOM", () => {
			const contentWithoutBOM = "Hello World"
			const result = stripBOM(contentWithoutBOM)
			expect(result).toBe("Hello World")
		})

		it("should handle empty string", () => {
			const result = stripBOM("")
			expect(result).toBe("")
		})

		it("should handle string with only BOM", () => {
			const result = stripBOM(UTF8_BOM)
			expect(result).toBe("")
		})

		it("should only strip BOM from beginning", () => {
			const content = UTF8_BOM + "Hello" + UTF8_BOM + "World"
			const result = stripBOM(content)
			expect(result).toBe("Hello" + UTF8_BOM + "World")
		})
	})

	describe("hasBOM", () => {
		it("should detect BOM in buffer", () => {
			const bufferWithBOM = Buffer.concat([UTF8_BOM_BYTES, Buffer.from("Hello")])
			expect(hasBOM(bufferWithBOM)).toBe(true)
		})

		it("should return false for buffer without BOM", () => {
			const bufferWithoutBOM = Buffer.from("Hello")
			expect(hasBOM(bufferWithoutBOM)).toBe(false)
		})

		it("should return false for empty buffer", () => {
			const emptyBuffer = Buffer.alloc(0)
			expect(hasBOM(emptyBuffer)).toBe(false)
		})

		it("should return false for buffer too short to contain BOM", () => {
			const shortBuffer = Buffer.from([0xef, 0xbb]) // Only 2 bytes
			expect(hasBOM(shortBuffer)).toBe(false)
		})
	})

	describe("stripBOMFromBuffer", () => {
		it("should strip BOM from buffer with BOM", () => {
			const bufferWithBOM = Buffer.concat([UTF8_BOM_BYTES, Buffer.from("Hello")])
			const result = stripBOMFromBuffer(bufferWithBOM)
			expect(result.toString()).toBe("Hello")
		})

		it("should return unchanged buffer without BOM", () => {
			const bufferWithoutBOM = Buffer.from("Hello")
			const result = stripBOMFromBuffer(bufferWithoutBOM)
			expect(result.toString()).toBe("Hello")
		})

		it("should handle empty buffer", () => {
			const emptyBuffer = Buffer.alloc(0)
			const result = stripBOMFromBuffer(emptyBuffer)
			expect(result.length).toBe(0)
		})

		it("should handle buffer with only BOM", () => {
			const result = stripBOMFromBuffer(UTF8_BOM_BYTES)
			expect(result.length).toBe(0)
		})
	})
})
