import { describe, it, expect, vi, beforeEach } from "vitest"
import * as child_process from "child_process"
import { promisify } from "util"

import {
	checkSvnInstalled,
	searchSvnCommits,
	getSvnCommitInfo,
	getSvnWorkingState,
	extractSvnRepositoryName,
	getSvnRepositoryInfo,
} from "../svn"

// Mock child_process.exec
vi.mock("child_process", () => ({
	exec: vi.fn(),
}))

// Mock promisify to return a proper async function
vi.mock("util", () => ({
	promisify: vi.fn((fn) => {
		return (...args: any[]) => {
			return new Promise((resolve, reject) => {
				const callback = (err: any, result: any) => {
					if (err) reject(err)
					else resolve(result)
				}
				// Call the original function with all args plus our callback
				fn(...args, callback)
			})
		}
	}),
}))

// Mock fs/promises
vi.mock("fs/promises", () => ({
	access: vi.fn(),
}))

describe("SVN utilities", () => {
	let mockExec: any

	beforeEach(() => {
		vi.clearAllMocks()
		mockExec = vi.mocked(child_process.exec)
	})

	describe("checkSvnInstalled", () => {
		it("should return true when SVN is installed", async () => {
			mockExec.mockImplementation((cmd: string, options: any, callback?: any) => {
				const cb = callback || options
				cb(null, { stdout: "svn, version 1.14.0", stderr: "" })
			})

			const result = await checkSvnInstalled()
			expect(result).toBe(true)
			expect(mockExec).toHaveBeenCalled()
		})

		it("should return false when SVN is not installed", async () => {
			mockExec.mockImplementation((cmd: string, options: any, callback?: any) => {
				const cb = callback || options
				cb(new Error("command not found"), null)
			})

			const result = await checkSvnInstalled()
			expect(result).toBe(false)
		})
	})

	describe("extractSvnRepositoryName", () => {
		it("should extract repository name from standard layout", () => {
			expect(extractSvnRepositoryName("https://svn.example.com/repos/myproject/trunk")).toBe("myproject")
			expect(extractSvnRepositoryName("https://svn.example.com/repos/myproject/branches/feature")).toBe(
				"myproject",
			)
			expect(extractSvnRepositoryName("https://svn.example.com/repos/myproject/tags/v1.0")).toBe("myproject")
		})

		it("should extract repository name from simple SVN URL", () => {
			expect(extractSvnRepositoryName("https://svn.example.com/svn/myproject")).toBe("myproject")
			expect(extractSvnRepositoryName("svn://svn.example.com/svn/myproject")).toBe("myproject")
		})

		it("should handle URLs with trailing slashes", () => {
			expect(extractSvnRepositoryName("https://svn.example.com/repos/myproject/trunk/")).toBe("myproject")
			expect(extractSvnRepositoryName("https://svn.example.com/svn/myproject/")).toBe("myproject")
		})

		it("should return empty string for invalid URLs", () => {
			expect(extractSvnRepositoryName("")).toBe("")
			expect(extractSvnRepositoryName("not-a-url")).toBe("")
		})
	})

	describe("searchSvnCommits", () => {
		it("should return commits when searching by message", async () => {
			mockExec.mockImplementation((cmd: string, options: any, callback?: any) => {
				const cb = callback || options
				if (cmd.includes("svn info")) {
					cb(null, { stdout: "Path: .", stderr: "" })
				} else if (cmd.includes("svn log")) {
					const xmlOutput = `<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="123">
<author>john</author>
<date>2024-01-15T10:30:00.000000Z</date>
<msg>Fix bug in login</msg>
</logentry>
<logentry revision="122">
<author>jane</author>
<date>2024-01-14T15:45:00.000000Z</date>
<msg>Add new feature</msg>
</logentry>
</log>`
					cb(null, { stdout: xmlOutput, stderr: "" })
				} else if (cmd === "svn --version") {
					cb(null, { stdout: "svn, version 1.14.0", stderr: "" })
				}
			})

			const commits = await searchSvnCommits("bug", "/test/path")
			expect(commits).toHaveLength(1)
			expect(commits[0]).toEqual({
				revision: "r123",
				author: "john",
				date: "2024-01-15",
				message: "Fix bug in login",
			})
		})

		it("should return specific commit when searching by revision", async () => {
			mockExec.mockImplementation((cmd: string, options: any, callback?: any) => {
				const cb = callback || options
				if (cmd.includes("svn info")) {
					cb(null, { stdout: "Path: .", stderr: "" })
				} else if (cmd.includes("svn log -r 123")) {
					const xmlOutput = `<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="123">
<author>john</author>
<date>2024-01-15T10:30:00.000000Z</date>
<msg>Fix bug in login</msg>
</logentry>
</log>`
					cb(null, { stdout: xmlOutput, stderr: "" })
				} else if (cmd === "svn --version") {
					cb(null, { stdout: "svn, version 1.14.0", stderr: "" })
				}
			})

			const commits = await searchSvnCommits("r123", "/test/path")
			expect(commits).toHaveLength(1)
			expect(commits[0].revision).toBe("r123")
		})

		it("should return empty array when SVN is not installed", async () => {
			mockExec.mockImplementation((cmd: string, options: any, callback?: any) => {
				const cb = callback || options
				cb(new Error("command not found"), null)
			})

			const commits = await searchSvnCommits("test", "/test/path")
			expect(commits).toEqual([])
		})
	})

	describe("getSvnCommitInfo", () => {
		it("should return commit info with diff", async () => {
			mockExec.mockImplementation((cmd: string, options: any, callback?: any) => {
				const cb = callback || options
				if (cmd.includes("svn info")) {
					cb(null, { stdout: "Path: .", stderr: "" })
				} else if (cmd.includes("svn log -r 123")) {
					const xmlOutput = `<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="123">
<author>john</author>
<date>2024-01-15T10:30:00.000000Z</date>
<msg>Fix bug in login</msg>
<paths>
<path action="M">/trunk/src/login.js</path>
</paths>
</logentry>
</log>`
					cb(null, { stdout: xmlOutput, stderr: "" })
				} else if (cmd.includes("svn diff -c 123")) {
					const diffOutput = `Index: src/login.js
===================================================================
--- src/login.js	(revision 122)
+++ src/login.js	(revision 123)
@@ -10,7 +10,7 @@
 function login(username, password) {
-    if (username && password) {
+    if (username && password && password.length > 0) {
         return authenticate(username, password);
     }
     return false;
 }`
					cb(null, { stdout: diffOutput, stderr: "" })
				} else if (cmd === "svn --version") {
					cb(null, { stdout: "svn, version 1.14.0", stderr: "" })
				}
			})

			const info = await getSvnCommitInfo("r123", "/test/path")
			expect(info).toContain("Revision: r123")
			expect(info).toContain("Author: john")
			expect(info).toContain("Message: Fix bug in login")
			expect(info).toContain("M: /trunk/src/login.js")
			expect(info).toContain("function login(username, password)")
		})

		it("should handle errors gracefully", async () => {
			mockExec.mockImplementation((cmd: string, options: any, callback?: any) => {
				const cb = callback || options
				if (cmd === "svn --version") {
					cb(null, { stdout: "svn, version 1.14.0", stderr: "" })
				} else {
					cb(new Error("Not an SVN repository"), null)
				}
			})

			const info = await getSvnCommitInfo("r123", "/test/path")
			expect(info).toBe("Not an SVN repository")
		})
	})

	describe("getSvnWorkingState", () => {
		it("should return working directory changes", async () => {
			mockExec.mockImplementation((cmd: string, options: any, callback?: any) => {
				const cb = callback || options
				if (cmd === "svn --version") {
					cb(null, { stdout: "svn, version 1.14.0", stderr: "" })
				} else if (cmd.includes("svn info")) {
					cb(null, { stdout: "Path: .", stderr: "" })
				} else if (cmd === "svn status") {
					cb(null, { stdout: "M       src/app.js\nA       src/new-file.js", stderr: "" })
				} else if (cmd === "svn diff") {
					const diffOutput = `Index: src/app.js
===================================================================
--- src/app.js	(revision 123)
+++ src/app.js	(working copy)
@@ -1,5 +1,5 @@
	const express = require('express');
-const app = express();
+const app = express(); // Initialize Express app`
					cb(null, { stdout: diffOutput, stderr: "" })
				}
			})

			const state = await getSvnWorkingState("/test/path")
			expect(state).toContain("Working directory changes:")
			expect(state).toContain("M       src/app.js")
			expect(state).toContain("A       src/new-file.js")
			expect(state).toContain("// Initialize Express app")
		})

		it("should return message when no changes", async () => {
			mockExec.mockImplementation((cmd: string, options: any, callback?: any) => {
				const cb = callback || options
				if (cmd.includes("svn info")) {
					cb(null, { stdout: "Path: .", stderr: "" })
				} else if (cmd === "svn status") {
					cb(null, { stdout: "", stderr: "" })
				} else if (cmd === "svn --version") {
					cb(null, { stdout: "svn, version 1.14.0", stderr: "" })
				}
			})

			const state = await getSvnWorkingState("/test/path")
			expect(state).toBe("No changes in working directory")
		})
	})

	describe("getSvnRepositoryInfo", () => {
		it("should extract repository info from svn info command", async () => {
			// Mock fs.access to simulate .svn directory exists
			const fs = await import("fs/promises")
			vi.mocked(fs.access).mockResolvedValue(undefined)

			mockExec.mockImplementation((cmd: string, options: any, callback?: any) => {
				const cb = callback || (typeof options === "function" ? options : undefined)
				if (cb) {
					if (cmd === "svn info --xml") {
						const xmlOutput = `<?xml version="1.0" encoding="UTF-8"?>
<info>
<entry>
<url>https://svn.example.com/repos/myproject/trunk</url>
<repository>
<root>https://svn.example.com/repos/myproject</root>
</repository>
<commit revision="123">
</commit>
</entry>
</info>`
						cb(null, { stdout: xmlOutput, stderr: "" })
					} else {
						cb(null, { stdout: "", stderr: "" })
					}
				}
			})

			const info = await getSvnRepositoryInfo("/test/path")

			expect(info).toEqual({
				repositoryUrl: "https://svn.example.com/repos/myproject/trunk",
				repositoryName: "myproject",
				repositoryRoot: "https://svn.example.com/repos/myproject",
				revision: "123",
			})
		})

		it("should return empty object for non-SVN directory", async () => {
			const fs = await import("fs/promises")
			vi.mocked(fs.access).mockRejectedValue(new Error("Not found"))

			const info = await getSvnRepositoryInfo("/test/path")
			expect(info).toEqual({})
		})
	})
})
