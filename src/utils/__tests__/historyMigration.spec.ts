import { describe, it, expect, vi, beforeEach } from "vitest"
import * as vscode from "vscode"
import type { HistoryItem } from "@roo-code/types"
import {
	migrateHistoryToWorkspaceHash,
	isMigrationNeeded,
	findOrphanedHistory,
	relinkHistoryItem,
} from "../historyMigration"
import * as workspaceHashModule from "../workspaceHash"
import * as pathModule from "../path"

// Mock vscode
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: undefined,
	},
}))

// Mock workspaceHash module
vi.mock("../workspaceHash", () => ({
	getWorkspaceHash: vi.fn(),
	areWorkspaceHashesEqual: vi.fn(),
}))

// Mock path module
vi.mock("../path", () => ({
	arePathsEqual: vi.fn(),
}))

describe("historyMigration", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("migrateHistoryToWorkspaceHash", () => {
		it("should skip items that already have workspace hash", () => {
			vi.mocked(workspaceHashModule.getWorkspaceHash).mockReturnValue("current-hash")

			const historyItems: HistoryItem[] = [
				{
					id: "1",
					number: 1,
					ts: Date.now(),
					task: "Test task",
					tokensIn: 100,
					tokensOut: 50,
					totalCost: 0.01,
					workspace: "/test/workspace",
					workspaceHash: "existing-hash",
				},
			]

			const result = migrateHistoryToWorkspaceHash(historyItems)
			expect(result[0].workspaceHash).toBe("existing-hash")
		})

		it("should add workspace hash for items matching current workspace", () => {
			vi.mocked(workspaceHashModule.getWorkspaceHash).mockReturnValue("current-hash")
			vi.mocked(pathModule.arePathsEqual).mockReturnValue(true)
			;(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: "/test/workspace" } }]

			const historyItems: HistoryItem[] = [
				{
					id: "1",
					number: 1,
					ts: Date.now(),
					task: "Test task",
					tokensIn: 100,
					tokensOut: 50,
					totalCost: 0.01,
					workspace: "/test/workspace",
				},
			]

			const result = migrateHistoryToWorkspaceHash(historyItems)
			expect(result[0].workspaceHash).toBe("current-hash")
		})

		it("should not add workspace hash for items from different workspace", () => {
			vi.mocked(workspaceHashModule.getWorkspaceHash).mockReturnValue("current-hash")
			vi.mocked(pathModule.arePathsEqual).mockReturnValue(false)
			;(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: "/test/workspace" } }]

			const historyItems: HistoryItem[] = [
				{
					id: "1",
					number: 1,
					ts: Date.now(),
					task: "Test task",
					tokensIn: 100,
					tokensOut: 50,
					totalCost: 0.01,
					workspace: "/different/workspace",
				},
			]

			const result = migrateHistoryToWorkspaceHash(historyItems)
			expect(result[0].workspaceHash).toBeUndefined()
		})
	})

	describe("isMigrationNeeded", () => {
		it("should return true when items without workspace hash exist", () => {
			const historyItems: HistoryItem[] = [
				{
					id: "1",
					number: 1,
					ts: Date.now(),
					task: "Test task",
					tokensIn: 100,
					tokensOut: 50,
					totalCost: 0.01,
					workspace: "/test/workspace",
				},
			]

			expect(isMigrationNeeded(historyItems)).toBe(true)
		})

		it("should return false when all items have workspace hash", () => {
			const historyItems: HistoryItem[] = [
				{
					id: "1",
					number: 1,
					ts: Date.now(),
					task: "Test task",
					tokensIn: 100,
					tokensOut: 50,
					totalCost: 0.01,
					workspace: "/test/workspace",
					workspaceHash: "hash",
				},
			]

			expect(isMigrationNeeded(historyItems)).toBe(false)
		})

		it("should return false for empty history", () => {
			expect(isMigrationNeeded([])).toBe(false)
		})
	})

	describe("findOrphanedHistory", () => {
		it("should find items with different workspace hash", () => {
			vi.mocked(workspaceHashModule.getWorkspaceHash).mockReturnValue("current-hash")
			vi.mocked(workspaceHashModule.areWorkspaceHashesEqual).mockReturnValue(false)

			const historyItems: HistoryItem[] = [
				{
					id: "1",
					number: 1,
					ts: Date.now(),
					task: "Test task",
					tokensIn: 100,
					tokensOut: 50,
					totalCost: 0.01,
					workspace: "/test/workspace",
					workspaceHash: "different-hash",
				},
			]

			const result = findOrphanedHistory(historyItems)
			expect(result).toHaveLength(1)
			expect(result[0].id).toBe("1")
		})

		it("should find items with different workspace path", () => {
			vi.mocked(workspaceHashModule.getWorkspaceHash).mockReturnValue("current-hash")
			vi.mocked(pathModule.arePathsEqual).mockReturnValue(false)
			;(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: "/test/workspace" } }]

			const historyItems: HistoryItem[] = [
				{
					id: "1",
					number: 1,
					ts: Date.now(),
					task: "Test task",
					tokensIn: 100,
					tokensOut: 50,
					totalCost: 0.01,
					workspace: "/different/workspace",
				},
			]

			const result = findOrphanedHistory(historyItems)
			expect(result).toHaveLength(1)
			expect(result[0].id).toBe("1")
		})
	})

	describe("relinkHistoryItem", () => {
		it("should update workspace information", () => {
			const item: HistoryItem = {
				id: "1",
				number: 1,
				ts: Date.now(),
				task: "Test task",
				tokensIn: 100,
				tokensOut: 50,
				totalCost: 0.01,
				workspace: "/old/workspace",
				workspaceHash: "old-hash",
			}

			const result = relinkHistoryItem(item, "/new/workspace", "new-hash")

			expect(result.workspace).toBe("/new/workspace")
			expect(result.workspaceHash).toBe("new-hash")
			expect(result.id).toBe("1") // Other properties preserved
		})

		it("should handle null workspace hash", () => {
			const item: HistoryItem = {
				id: "1",
				number: 1,
				ts: Date.now(),
				task: "Test task",
				tokensIn: 100,
				tokensOut: 50,
				totalCost: 0.01,
				workspace: "/old/workspace",
			}

			const result = relinkHistoryItem(item, "/new/workspace", null)

			expect(result.workspace).toBe("/new/workspace")
			expect(result.workspaceHash).toBeUndefined()
		})
	})
})
