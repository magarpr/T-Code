import { describe, it, expect, vi, beforeEach } from "vitest"
import * as vscode from "vscode"
import { getWorkspaceHash, getWorkspaceStoragePath, areWorkspaceHashesEqual } from "../workspaceHash"

// Mock vscode
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: undefined,
	},
}))

describe("workspaceHash", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("getWorkspaceHash", () => {
		it("should return null when no workspace folders exist", () => {
			;(vscode.workspace as any).workspaceFolders = undefined
			expect(getWorkspaceHash()).toBeNull()
		})

		it("should return null when workspace folders array is empty", () => {
			;(vscode.workspace as any).workspaceFolders = []
			expect(getWorkspaceHash()).toBeNull()
		})

		it("should return a hash when workspace folder exists", () => {
			;(vscode.workspace as any).workspaceFolders = [
				{
					uri: {
						toString: () => "file:///test/workspace",
					},
				},
			]

			const hash = getWorkspaceHash()
			expect(hash).toBeTruthy()
			expect(typeof hash).toBe("string")
			expect(hash).toHaveLength(40) // SHA1 hash length
		})

		it("should return consistent hash for same workspace URI", () => {
			const mockUri = "file:///test/workspace"
			;(vscode.workspace as any).workspaceFolders = [
				{
					uri: {
						toString: () => mockUri,
					},
				},
			]

			const hash1 = getWorkspaceHash()
			const hash2 = getWorkspaceHash()
			expect(hash1).toBe(hash2)
		})

		it("should return different hashes for different workspace URIs", () => {
			;(vscode.workspace as any).workspaceFolders = [
				{
					uri: {
						toString: () => "file:///test/workspace1",
					},
				},
			]
			const hash1 = getWorkspaceHash()

			;(vscode.workspace as any).workspaceFolders = [
				{
					uri: {
						toString: () => "file:///test/workspace2",
					},
				},
			]
			const hash2 = getWorkspaceHash()

			expect(hash1).not.toBe(hash2)
		})
	})

	describe("getWorkspaceStoragePath", () => {
		it("should return null when no workspace hash is available", () => {
			;(vscode.workspace as any).workspaceFolders = undefined
			expect(getWorkspaceStoragePath()).toBeNull()
		})

		it("should return the hash when workspace is available", () => {
			;(vscode.workspace as any).workspaceFolders = [
				{
					uri: {
						toString: () => "file:///test/workspace",
					},
				},
			]

			const storagePath = getWorkspaceStoragePath()
			const hash = getWorkspaceHash()
			expect(storagePath).toBe(hash)
		})
	})

	describe("areWorkspaceHashesEqual", () => {
		it("should return true when both hashes are null", () => {
			expect(areWorkspaceHashesEqual(null, null)).toBe(true)
		})

		it("should return false when one hash is null and the other is not", () => {
			expect(areWorkspaceHashesEqual(null, "hash")).toBe(false)
			expect(areWorkspaceHashesEqual("hash", null)).toBe(false)
		})

		it("should return true when hashes are identical", () => {
			const hash = "abc123def456"
			expect(areWorkspaceHashesEqual(hash, hash)).toBe(true)
		})

		it("should return false when hashes are different", () => {
			expect(areWorkspaceHashesEqual("hash1", "hash2")).toBe(false)
		})
	})
})
