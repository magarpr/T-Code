import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
	test: {
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
		watch: false,
		reporters: ["dot"],
		silent: true,
		environment: "jsdom",
		include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
		// Add timeout configurations to prevent flaky tests in CI
		testTimeout: 15000, // 15 seconds for individual tests (increased from default 5s)
		hookTimeout: 10000, // 10 seconds for setup/teardown hooks
		teardownTimeout: 10000, // 10 seconds for teardown
		// Retry flaky tests once in CI environments
		retry: process.env.CI ? 1 : 0,
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@src": path.resolve(__dirname, "./src"),
			"@roo": path.resolve(__dirname, "../src/shared"),
		},
	},
})
