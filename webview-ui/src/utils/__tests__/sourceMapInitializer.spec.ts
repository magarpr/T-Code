import { exposeSourceMapsForDebugging } from "../sourceMapInitializer"

describe("sourceMapInitializer", () => {
	describe("exposeSourceMapsForDebugging", () => {
		let originalNodeEnv: string | undefined

		beforeEach(() => {
			originalNodeEnv = process.env.NODE_ENV
			// Clear any existing debugging functions
			delete (window as any).__testSourceMaps
			delete (window as any).__applySourceMaps
			delete (window as any).__checkSourceMap
		})

		afterEach(() => {
			process.env.NODE_ENV = originalNodeEnv
			// Clean up any debugging functions
			delete (window as any).__testSourceMaps
			delete (window as any).__applySourceMaps
			delete (window as any).__checkSourceMap
		})

		it("should not expose debugging functions in production mode", () => {
			// Set production mode
			process.env.NODE_ENV = "production"

			// Call the function
			exposeSourceMapsForDebugging()

			// Verify that debugging functions are NOT exposed
			expect((window as any).__testSourceMaps).toBeUndefined()
			expect((window as any).__applySourceMaps).toBeUndefined()
			expect((window as any).__checkSourceMap).toBeUndefined()
		})

		it("should expose debugging functions in development mode", () => {
			// Set development mode
			process.env.NODE_ENV = "development"

			// Call the function
			exposeSourceMapsForDebugging()

			// Verify that debugging functions ARE exposed
			expect((window as any).__testSourceMaps).toBeDefined()
			expect((window as any).__applySourceMaps).toBeDefined()
			expect((window as any).__checkSourceMap).toBeDefined()
			expect(typeof (window as any).__testSourceMaps).toBe("function")
			expect(typeof (window as any).__applySourceMaps).toBe("function")
			expect(typeof (window as any).__checkSourceMap).toBe("function")
		})

		it("should expose debugging functions in test mode", () => {
			// Set test mode
			process.env.NODE_ENV = "test"

			// Call the function
			exposeSourceMapsForDebugging()

			// Verify that debugging functions ARE exposed
			expect((window as any).__testSourceMaps).toBeDefined()
			expect((window as any).__applySourceMaps).toBeDefined()
			expect((window as any).__checkSourceMap).toBeDefined()
		})

		it("should not throw errors when called multiple times in production", () => {
			// Set production mode
			process.env.NODE_ENV = "production"

			// Should not throw when called multiple times
			expect(() => {
				exposeSourceMapsForDebugging()
				exposeSourceMapsForDebugging()
				exposeSourceMapsForDebugging()
			}).not.toThrow()

			// Functions should still not be exposed
			expect((window as any).__testSourceMaps).toBeUndefined()
			expect((window as any).__applySourceMaps).toBeUndefined()
			expect((window as any).__checkSourceMap).toBeUndefined()
		})
	})
})
