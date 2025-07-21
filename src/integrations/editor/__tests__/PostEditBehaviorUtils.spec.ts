// npx vitest src/integrations/editor/__tests__/PostEditBehaviorUtils.spec.ts

import * as vscode from "vscode"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PostEditBehaviorUtils } from "../PostEditBehaviorUtils"

// Mock vscode module
vi.mock("vscode", () => ({
	window: {
		tabGroups: {
			all: [],
		},
		showTextDocument: vi.fn(),
		createTextEditorDecorationType: vi.fn(() => ({
			dispose: vi.fn(),
		})),
		visibleTextEditors: [],
	},
	ViewColumn: {
		One: 1,
	},
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path, scheme: "file" })),
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(),
		})),
	},
	TabInputTextDiff: class TabInputTextDiff {
		constructor(
			public original: any,
			public modified: any,
		) {}
	},
	TabInputText: class TabInputText {
		constructor(public uri: any) {}
	},
}))

describe("PostEditBehaviorUtils", () => {
	let mockTabGroups: any[]
	let mockShowTextDocument: any
	let mockVisibleTextEditors: any[]

	beforeEach(() => {
		mockTabGroups = []
		mockShowTextDocument = vi.fn()
		mockVisibleTextEditors = []

		// Reset mocks
		vi.mocked(vscode.window).tabGroups = {
			all: mockTabGroups,
		} as any
		vi.mocked(vscode.window).showTextDocument = mockShowTextDocument
		vi.mocked(vscode.window).visibleTextEditors = mockVisibleTextEditors
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("closeRooTabs", () => {
		it("should not close any tabs when autoCloseRooTabs is false", async () => {
			// Arrange
			const rooOpenedTabs = new Set(["/path/to/file1.ts", "/path/to/file2.ts"])
			const mockTabGroup = {
				tabs: [
					{
						input: { uri: { fsPath: "/path/to/file1.ts" } },
						close: vi.fn(),
					},
					{
						input: { uri: { fsPath: "/path/to/file2.ts" } },
						close: vi.fn(),
					},
				],
			}
			mockTabGroups.push(mockTabGroup)

			// Act
			await PostEditBehaviorUtils.closeRooTabs(
				false, // autoCloseRooTabs
				false, // autoCloseAllRooTabs
				rooOpenedTabs,
				undefined,
			)

			// Assert
			expect(mockTabGroup.tabs[0].close).not.toHaveBeenCalled()
			expect(mockTabGroup.tabs[1].close).not.toHaveBeenCalled()
		})

		it("should close only the edited file tab when autoCloseRooTabs is true and autoCloseAllRooTabs is false", async () => {
			// Arrange
			const rooOpenedTabs = new Set(["/path/to/file1.ts", "/path/to/file2.ts"])
			const editedFilePath = "/path/to/file1.ts"
			const mockTabGroup = {
				tabs: [
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file1.ts")),
						close: vi.fn().mockResolvedValue(true),
					},
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file2.ts")),
						close: vi.fn().mockResolvedValue(true),
					},
				],
			}
			mockTabGroups.push(mockTabGroup)

			// Act
			await PostEditBehaviorUtils.closeRooTabs(
				true, // autoCloseRooTabs
				false, // autoCloseAllRooTabs
				rooOpenedTabs,
				editedFilePath,
			)

			// Assert
			expect(mockTabGroup.tabs[0].close).toHaveBeenCalled()
			expect(mockTabGroup.tabs[1].close).not.toHaveBeenCalled()
		})

		it("should close all Roo-opened tabs when autoCloseAllRooTabs is true", async () => {
			// Arrange
			const rooOpenedTabs = new Set(["/path/to/file1.ts", "/path/to/file2.ts"])
			const editedFilePath = "/path/to/file1.ts"
			const mockTabGroup = {
				tabs: [
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file1.ts")),
						close: vi.fn().mockResolvedValue(true),
					},
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file2.ts")),
						close: vi.fn().mockResolvedValue(true),
					},
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file3.ts")),
						close: vi.fn().mockResolvedValue(true),
					},
				],
			}
			mockTabGroups.push(mockTabGroup)

			// Act
			await PostEditBehaviorUtils.closeRooTabs(
				true, // autoCloseRooTabs
				true, // autoCloseAllRooTabs
				rooOpenedTabs,
				editedFilePath,
			)

			// Assert
			expect(mockTabGroup.tabs[0].close).toHaveBeenCalled()
			expect(mockTabGroup.tabs[1].close).toHaveBeenCalled()
			expect(mockTabGroup.tabs[2].close).not.toHaveBeenCalled() // file3 was not opened by Roo
		})

		it("should not close tabs that were not opened by Roo", async () => {
			// Arrange
			const rooOpenedTabs = new Set(["/path/to/file1.ts"])
			const editedFilePath = "/path/to/file1.ts"
			const mockTabGroup = {
				tabs: [
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file1.ts")),
						close: vi.fn().mockResolvedValue(true),
					},
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file2.ts")), // Not in rooOpenedTabs
						close: vi.fn().mockResolvedValue(true),
					},
				],
			}
			mockTabGroups.push(mockTabGroup)

			// Act
			await PostEditBehaviorUtils.closeRooTabs(
				true, // autoCloseRooTabs
				true, // autoCloseAllRooTabs
				rooOpenedTabs,
				editedFilePath,
			)

			// Assert
			expect(mockTabGroup.tabs[0].close).toHaveBeenCalled()
			expect(mockTabGroup.tabs[1].close).not.toHaveBeenCalled()
		})

		it("should handle tabs without URI input gracefully", async () => {
			// Arrange
			const rooOpenedTabs = new Set(["/path/to/file1.ts"])
			const mockTabGroup = {
				tabs: [
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file1.ts")),
						close: vi.fn().mockResolvedValue(true),
					},
					{
						input: {}, // No URI
						close: vi.fn().mockResolvedValue(true),
					},
					{
						input: null, // Null input
						close: vi.fn().mockResolvedValue(true),
					},
				],
			}
			mockTabGroups.push(mockTabGroup)

			// Act
			await PostEditBehaviorUtils.closeRooTabs(
				true, // autoCloseRooTabs
				true, // autoCloseAllRooTabs
				rooOpenedTabs,
				undefined,
			)

			// Assert
			expect(mockTabGroup.tabs[0].close).toHaveBeenCalled()
			expect(mockTabGroup.tabs[1].close).not.toHaveBeenCalled()
			expect(mockTabGroup.tabs[2].close).not.toHaveBeenCalled()
		})
	})

	describe("restoreFocus", () => {
		it("should restore focus to the pre-edit active editor", async () => {
			// Arrange
			const mockEditor = {
				document: {
					uri: {
						fsPath: "/path/to/original.ts",
						toString: () => "file:///path/to/original.ts",
					},
				},
			}
			mockVisibleTextEditors.push(mockEditor)

			// Act
			await PostEditBehaviorUtils.restoreFocus(mockEditor as any)

			// Assert
			expect(mockShowTextDocument).toHaveBeenCalledWith(mockEditor.document, {
				preview: false,
				preserveFocus: false,
			})
		})

		it("should not restore focus when no pre-edit editor is provided", async () => {
			// Act
			await PostEditBehaviorUtils.restoreFocus(undefined)

			// Assert
			expect(mockShowTextDocument).not.toHaveBeenCalled()
		})

		it("should handle errors gracefully when restoring focus", async () => {
			// Arrange
			const mockEditor = {
				document: {
					uri: {
						fsPath: "/path/to/original.ts",
						toString: () => "file:///path/to/original.ts",
					},
				},
			}
			mockVisibleTextEditors.push(mockEditor)
			mockShowTextDocument.mockRejectedValue(new Error("Failed to show document"))

			// Act & Assert - should not throw (errors are caught internally)
			await expect(PostEditBehaviorUtils.restoreFocus(mockEditor as any)).resolves.toBeUndefined()
		})
	})
})
