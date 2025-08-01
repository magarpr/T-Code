/* eslint-disable @typescript-eslint/no-explicit-any */

// npx vitest run src/__tests__/ConnectionMonitor.test.ts

import { ConnectionMonitor } from "../ConnectionMonitor"

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch as any

// Mock Config module
vi.mock("../Config", () => ({
	getRooCodeApiUrl: vi.fn(() => "https://app.roocode.com"),
}))

// Mock timers
vi.useFakeTimers()

describe("ConnectionMonitor", () => {
	let monitor: ConnectionMonitor

	beforeEach(() => {
		vi.clearAllMocks()
		vi.clearAllTimers()
		monitor = new ConnectionMonitor()

		// Default to successful fetch
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
		})
	})

	afterEach(() => {
		monitor.dispose()
		vi.restoreAllMocks()
	})

	describe("checkConnection", () => {
		it("should return true when fetch succeeds", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
			})

			const result = await monitor.checkConnection()
			expect(result).toBe(true)
			expect(mockFetch).toHaveBeenCalledWith(
				"https://app.roocode.com/api/health",
				expect.objectContaining({
					method: "GET",
					signal: expect.any(AbortSignal),
				}),
			)
		})

		it("should return false when fetch fails", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"))

			const result = await monitor.checkConnection()
			expect(result).toBe(false)
		})

		it("should return false when response is not ok", async () => {
			mockFetch.mockResolvedValue({
				ok: false,
				status: 500,
			})

			const result = await monitor.checkConnection()
			expect(result).toBe(false)
		})

		it("should handle timeout", async () => {
			// Mock fetch to simulate abort
			mockFetch.mockImplementation((url, options) => {
				return new Promise((resolve, reject) => {
					// Listen for abort signal
					if (options?.signal) {
						options.signal.addEventListener("abort", () => {
							reject(new Error("The operation was aborted"))
						})
					}
					// Never resolve naturally
				})
			})

			const resultPromise = monitor.checkConnection()

			// Fast-forward past the timeout (5 seconds)
			await vi.advanceTimersByTimeAsync(5001)

			const result = await resultPromise
			expect(result).toBe(false)
		})
	})

	describe("startMonitoring", () => {
		it("should start periodic connection checks", async () => {
			const checkSpy = vi.spyOn(monitor, "checkConnection")

			monitor.startMonitoring()

			// Should check immediately
			expect(checkSpy).toHaveBeenCalledTimes(1)

			// Advance timer to trigger next check
			await vi.advanceTimersByTimeAsync(30000)
			expect(checkSpy).toHaveBeenCalledTimes(2)

			// Advance timer again
			await vi.advanceTimersByTimeAsync(30000)
			expect(checkSpy).toHaveBeenCalledTimes(3)
		})

		it("should not start multiple monitoring sessions", async () => {
			const checkSpy = vi.spyOn(monitor, "checkConnection")

			monitor.startMonitoring()
			monitor.startMonitoring() // Second call should stop first and restart

			// Should check once for each startMonitoring call
			expect(checkSpy).toHaveBeenCalledTimes(2)

			// Advance timer - should only increment by 1
			await vi.advanceTimersByTimeAsync(30000)
			expect(checkSpy).toHaveBeenCalledTimes(3)
		})

		it("should accept custom interval", async () => {
			const checkSpy = vi.spyOn(monitor, "checkConnection")

			monitor.startMonitoring(10000) // 10 seconds

			expect(checkSpy).toHaveBeenCalledTimes(1)

			// Advance by 10 seconds
			await vi.advanceTimersByTimeAsync(10000)
			expect(checkSpy).toHaveBeenCalledTimes(2)
		})
	})

	describe("stopMonitoring", () => {
		it("should stop periodic checks", async () => {
			const checkSpy = vi.spyOn(monitor, "checkConnection")

			monitor.startMonitoring()
			expect(checkSpy).toHaveBeenCalledTimes(1)

			monitor.stopMonitoring()

			// Advance timer - no more checks should occur
			await vi.advanceTimersByTimeAsync(60000)
			expect(checkSpy).toHaveBeenCalledTimes(1)
		})
	})

	describe("connection state changes", () => {
		it("should emit connectionRestored event when connection is restored", async () => {
			const restoredCallback = vi.fn()
			monitor.onConnectionRestored(restoredCallback)

			// Start with offline state
			mockFetch.mockRejectedValue(new Error("Network error"))
			await monitor.checkConnection()

			// Connection should be offline
			expect(monitor.getConnectionStatus()).toBe(false)
			expect(restoredCallback).not.toHaveBeenCalled()

			// Restore connection
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
			})

			await monitor.checkConnection()

			// Should emit restored event
			expect(restoredCallback).toHaveBeenCalledTimes(1)
			expect(monitor.getConnectionStatus()).toBe(true)
		})

		it("should emit connectionLost event when connection is lost", async () => {
			const lostCallback = vi.fn()
			monitor.onConnectionLost(lostCallback)

			// Start with online state (default)
			expect(monitor.getConnectionStatus()).toBe(true)

			// Lose connection
			mockFetch.mockRejectedValue(new Error("Network error"))
			await monitor.checkConnection()

			// Should emit lost event
			expect(lostCallback).toHaveBeenCalledTimes(1)
			expect(monitor.getConnectionStatus()).toBe(false)
		})

		it("should not emit events when state doesn't change", async () => {
			const restoredCallback = vi.fn()
			const lostCallback = vi.fn()
			monitor.onConnectionRestored(restoredCallback)
			monitor.onConnectionLost(lostCallback)

			// Multiple successful checks
			await monitor.checkConnection()
			await monitor.checkConnection()
			await monitor.checkConnection()

			// Should not emit any events
			expect(restoredCallback).not.toHaveBeenCalled()
			expect(lostCallback).not.toHaveBeenCalled()
		})
	})

	describe("getConnectionStatus", () => {
		it("should return current connection status", () => {
			// Default is true
			expect(monitor.getConnectionStatus()).toBe(true)
		})

		it("should update status after checks", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"))

			await monitor.checkConnection()

			expect(monitor.getConnectionStatus()).toBe(false)
		})
	})

	describe("dispose", () => {
		it("should stop monitoring and remove listeners", async () => {
			const restoredCallback = vi.fn()
			const lostCallback = vi.fn()

			monitor.onConnectionRestored(restoredCallback)
			monitor.onConnectionLost(lostCallback)
			monitor.startMonitoring()

			monitor.dispose()

			// Try to trigger events - callbacks should not be called
			mockFetch.mockRejectedValue(new Error("Network error"))
			await vi.advanceTimersByTimeAsync(30000)

			expect(restoredCallback).not.toHaveBeenCalled()
			expect(lostCallback).not.toHaveBeenCalled()
		})
	})

	describe("error handling", () => {
		it("should handle check errors gracefully", async () => {
			// Mock an error during the check
			mockFetch.mockRejectedValue(new Error("Unexpected error"))

			const result = await monitor.checkConnection()

			// Should treat as offline
			expect(result).toBe(false)
			expect(monitor.getConnectionStatus()).toBe(false)
		})
	})

	describe("multiple listeners", () => {
		it("should support multiple connectionRestored listeners", async () => {
			const callback1 = vi.fn()
			const callback2 = vi.fn()

			monitor.onConnectionRestored(callback1)
			monitor.onConnectionRestored(callback2)

			// Start offline
			mockFetch.mockRejectedValue(new Error("Network error"))
			await monitor.checkConnection()

			// Restore connection
			mockFetch.mockResolvedValue({ ok: true, status: 200 })
			await monitor.checkConnection()

			expect(callback1).toHaveBeenCalledTimes(1)
			expect(callback2).toHaveBeenCalledTimes(1)
		})

		it("should support multiple connectionLost listeners", async () => {
			const callback1 = vi.fn()
			const callback2 = vi.fn()

			monitor.onConnectionLost(callback1)
			monitor.onConnectionLost(callback2)

			// Lose connection
			mockFetch.mockRejectedValue(new Error("Network error"))
			await monitor.checkConnection()

			expect(callback1).toHaveBeenCalledTimes(1)
			expect(callback2).toHaveBeenCalledTimes(1)
		})
	})

	describe("integration with monitoring", () => {
		it("should emit events during periodic monitoring", async () => {
			const restoredCallback = vi.fn()
			const lostCallback = vi.fn()

			monitor.onConnectionRestored(restoredCallback)
			monitor.onConnectionLost(lostCallback)

			// Start monitoring with shorter interval for testing
			monitor.startMonitoring(1000)

			// First check succeeds (default)
			await vi.runOnlyPendingTimersAsync()

			// Next check fails
			mockFetch.mockRejectedValue(new Error("Network error"))
			await vi.advanceTimersByTimeAsync(1000)

			expect(lostCallback).toHaveBeenCalledTimes(1)

			// Next check succeeds
			mockFetch.mockResolvedValue({ ok: true, status: 200 })
			await vi.advanceTimersByTimeAsync(1000)

			expect(restoredCallback).toHaveBeenCalledTimes(1)
		})
	})
})
