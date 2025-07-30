import { describe, it, expect, vi, beforeEach } from "vitest"
import * as vscode from "vscode"
import { getWorkspaceHash, getWorkspaceHashFromPath, getShortWorkspaceHash } from "../workspaceHash"

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: undefined,
	},
	Uri: {
		file: vi.fn(),
	},
}))

describe("workspaceHash", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("getWorkspaceHash", () => {
		it("should return null when no workspace folders are available", () => {
			// @ts-ignore
			vscode.workspace.workspaceFolders = undefined

			const result = getWorkspaceHash()

			expect(result).toBeNull()
		})

		it("should return null when workspace folders array is empty", () => {
			// @ts-ignore
			vscode.workspace.workspaceFolders = []

			const result = getWorkspaceHash()

			expect(result).toBeNull()
		})

		it("should return a hash when workspace folder is available", () => {
			const mockUri = {
				toString: () => "file:///Users/test/project",
			}

			// @ts-ignore
			vscode.workspace.workspaceFolders = [{ uri: mockUri }]

			const result = getWorkspaceHash()

			expect(result).toBeTruthy()
			expect(typeof result).toBe("string")
			expect(result).toHaveLength(40) // SHA1 hash length
		})

		it("should return consistent hash for same workspace URI", () => {
			const mockUri = {
				toString: () => "file:///Users/test/project",
			}

			// @ts-ignore
			vscode.workspace.workspaceFolders = [{ uri: mockUri }]

			const result1 = getWorkspaceHash()
			const result2 = getWorkspaceHash()

			expect(result1).toBe(result2)
		})

		it("should return different hashes for different workspace URIs", () => {
			const mockUri1 = {
				toString: () => "file:///Users/test/project1",
			}
			const mockUri2 = {
				toString: () => "file:///Users/test/project2",
			}

			// @ts-ignore
			vscode.workspace.workspaceFolders = [{ uri: mockUri1 }]
			const result1 = getWorkspaceHash()

			// @ts-ignore
			vscode.workspace.workspaceFolders = [{ uri: mockUri2 }]
			const result2 = getWorkspaceHash()

			expect(result1).not.toBe(result2)
		})
	})

	describe("getWorkspaceHashFromPath", () => {
		it("should return a hash for a given workspace path", () => {
			const mockUri = {
				toString: () => "file:///Users/test/project",
			}

			vi.mocked(vscode.Uri.file).mockReturnValue(mockUri as any)

			const result = getWorkspaceHashFromPath("/Users/test/project")

			expect(result).toBeTruthy()
			expect(typeof result).toBe("string")
			expect(result).toHaveLength(40) // SHA1 hash length
			expect(vscode.Uri.file).toHaveBeenCalledWith("/Users/test/project")
		})

		it("should return consistent hash for same path", () => {
			const mockUri = {
				toString: () => "file:///Users/test/project",
			}

			vi.mocked(vscode.Uri.file).mockReturnValue(mockUri as any)

			const result1 = getWorkspaceHashFromPath("/Users/test/project")
			const result2 = getWorkspaceHashFromPath("/Users/test/project")

			expect(result1).toBe(result2)
		})

		it("should return different hashes for different paths", () => {
			vi.mocked(vscode.Uri.file)
				.mockReturnValueOnce({ toString: () => "file:///Users/test/project1" } as any)
				.mockReturnValueOnce({ toString: () => "file:///Users/test/project2" } as any)

			const result1 = getWorkspaceHashFromPath("/Users/test/project1")
			const result2 = getWorkspaceHashFromPath("/Users/test/project2")

			expect(result1).not.toBe(result2)
		})
	})

	describe("getShortWorkspaceHash", () => {
		it("should return first 16 characters of the hash", () => {
			const fullHash = "abcdef1234567890abcdef1234567890abcdef12"

			const result = getShortWorkspaceHash(fullHash)

			expect(result).toBe("abcdef1234567890")
			expect(result).toHaveLength(16)
		})

		it("should handle hashes shorter than 16 characters", () => {
			const shortHash = "abc123"

			const result = getShortWorkspaceHash(shortHash)

			expect(result).toBe("abc123")
		})
	})
})
