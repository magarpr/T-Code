import { describe, it, expect } from "vitest"
import { DEFAULT_MODES, modeConfigSchema } from "../mode.js"

describe("DEFAULT_MODES", () => {
	it("should include the Frontend Developer mode", () => {
		const frontEndMode = DEFAULT_MODES.find((mode) => mode.slug === "front-end-developer")
		expect(frontEndMode).toBeDefined()
		expect(frontEndMode?.name).toBe("🎨 Front End Developer")
	})

	it("should have valid configuration for Frontend Developer mode", () => {
		const frontEndMode = DEFAULT_MODES.find((mode) => mode.slug === "front-end-developer")
		expect(frontEndMode).toBeDefined()

		// Validate against schema
		const result = modeConfigSchema.safeParse(frontEndMode)
		expect(result.success).toBe(true)
	})

	it("should have correct groups for Frontend Developer mode", () => {
		const frontEndMode = DEFAULT_MODES.find((mode) => mode.slug === "front-end-developer")
		expect(frontEndMode).toBeDefined()
		expect(frontEndMode?.groups).toHaveLength(3)
		expect(frontEndMode?.groups[0]).toBe("read")
		expect(frontEndMode?.groups[2]).toBe("command")

		// Check edit group with file regex
		const editGroup = frontEndMode?.groups[1]
		expect(Array.isArray(editGroup)).toBe(true)
		if (Array.isArray(editGroup)) {
			expect(editGroup[0]).toBe("edit")
			expect(editGroup[1]).toHaveProperty("fileRegex")
			expect(editGroup[1]).toHaveProperty("description", "UI code and design asset files only")
		}
	})

	it("should have correct file regex pattern for Frontend Developer mode", () => {
		const frontEndMode = DEFAULT_MODES.find((mode) => mode.slug === "front-end-developer")
		const editGroup = frontEndMode?.groups[1]

		if (Array.isArray(editGroup) && editGroup[1]?.fileRegex) {
			const regex = new RegExp(editGroup[1].fileRegex)

			// Test valid UI files
			expect(regex.test("src/components/Button.tsx")).toBe(true)
			expect(regex.test("src/styles/main.css")).toBe(true)
			expect(regex.test("src/pages/Home.jsx")).toBe(true)
			expect(regex.test("src/ui/Modal.tsx")).toBe(true)
			expect(regex.test("src/hooks/useAuth.ts")).toBe(true)
			expect(regex.test("src/main.css")).toBe(true)
			expect(regex.test("public/index.html")).toBe(true)
			expect(regex.test("assets/logo.svg")).toBe(true)
			expect(regex.test("static/banner.png")).toBe(true)

			// Test invalid files (backend/server files)
			expect(regex.test("server.js")).toBe(false)
			expect(regex.test("README.md")).toBe(false)
			expect(regex.test("package.json")).toBe(false)
			expect(regex.test("src/api/routes.ts")).toBe(false)
			expect(regex.test("src/App.jsx")).toBe(false) // App.jsx at root of src is not in allowed folders
			expect(regex.test("src/server/index.ts")).toBe(false)
		}
	})

	it("should have all required fields for Frontend Developer mode", () => {
		const frontEndMode = DEFAULT_MODES.find((mode) => mode.slug === "front-end-developer")

		expect(frontEndMode).toMatchObject({
			slug: "front-end-developer",
			name: "🎨 Front End Developer",
			roleDefinition: expect.stringContaining("front end development specialist"),
			whenToUse: expect.stringContaining("UI code"),
			description: "Create stunning UI/UX with mobile-first design",
			groups: expect.any(Array),
		})
	})

	it("should maintain correct order of modes with Frontend Developer added", () => {
		const modeNames = DEFAULT_MODES.map((mode) => mode.slug)
		expect(modeNames).toContain("architect")
		expect(modeNames).toContain("code")
		expect(modeNames).toContain("ask")
		expect(modeNames).toContain("debug")
		expect(modeNames).toContain("orchestrator")
		expect(modeNames).toContain("front-end-developer")

		// Frontend Developer should be the last mode
		expect(modeNames[modeNames.length - 1]).toBe("front-end-developer")
	})
})
