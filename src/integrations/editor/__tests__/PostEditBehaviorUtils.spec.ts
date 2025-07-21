// npx vitest src/integrations/editor/__tests__/PostEditBehaviorUtils.spec.ts

import * as vscode from "vscode"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PostEditBehaviorUtils } from "../PostEditBehaviorUtils"

// Mock vscode module
vi.mock("vscode", () => ({
	window: {
		tabGroups: {
			all: [],
			close: vi.fn(),
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
			close: vi.fn().mockResolvedValue(true),
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
						isDirty: false,
					},
					{
						input: { uri: { fsPath: "/path/to/file2.ts" } },
						isDirty: false,
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
			expect(vi.mocked(vscode.window).tabGroups.close).not.toHaveBeenCalled()
		})

		it("should close only the edited file tab when autoCloseRooTabs is true and autoCloseAllRooTabs is false", async () => {
			// Arrange
			const rooOpenedTabs = new Set(["/path/to/file1.ts", "/path/to/file2.ts"])
			const editedFilePath = "/path/to/file1.ts"
			const mockTabGroup = {
				tabs: [
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file1.ts")),
						isDirty: false,
					},
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file2.ts")),
						isDirty: false,
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
			expect(vi.mocked(vscode.window).tabGroups.close).toHaveBeenCalledWith(mockTabGroup.tabs[0])
			expect(vi.mocked(vscode.window).tabGroups.close).not.toHaveBeenCalledWith(mockTabGroup.tabs[1])
		})

		it("should close all Roo-opened tabs when autoCloseAllRooTabs is true", async () => {
			// Arrange
			const rooOpenedTabs = new Set(["/path/to/file1.ts", "/path/to/file2.ts"])
			const editedFilePath = "/path/to/file1.ts"
			const mockTabGroup = {
				tabs: [
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file1.ts")),
						isDirty: false,
					},
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file2.ts")),
						isDirty: false,
					},
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file3.ts")),
						isDirty: false,
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
			expect(vi.mocked(vscode.window).tabGroups.close).toHaveBeenCalledWith(mockTabGroup.tabs[0])
			expect(vi.mocked(vscode.window).tabGroups.close).toHaveBeenCalledWith(mockTabGroup.tabs[1])
			expect(vi.mocked(vscode.window).tabGroups.close).not.toHaveBeenCalledWith(mockTabGroup.tabs[2]) // file3 was not opened by Roo
		})

		it("should not close tabs that were not opened by Roo", async () => {
			// Arrange
			const rooOpenedTabs = new Set(["/path/to/file1.ts"])
			const editedFilePath = "/path/to/file1.ts"
			const mockTabGroup = {
				tabs: [
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file1.ts")),
						isDirty: false,
					},
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file2.ts")), // Not in rooOpenedTabs
						isDirty: false,
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
			expect(vi.mocked(vscode.window).tabGroups.close).toHaveBeenCalledWith(mockTabGroup.tabs[0])
			expect(vi.mocked(vscode.window).tabGroups.close).not.toHaveBeenCalledWith(mockTabGroup.tabs[1])
		})

		it("should handle tabs without URI input gracefully", async () => {
			// Arrange
			const rooOpenedTabs = new Set(["/path/to/file1.ts"])
			const mockTabGroup = {
				tabs: [
					{
						input: new (vi.mocked(vscode).TabInputText)(vscode.Uri.file("/path/to/file1.ts")),
						isDirty: false,
					},
					{
						input: {}, // No URI
						isDirty: false,
					},
					{
						input: null, // Null input
						isDirty: false,
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
			expect(vi.mocked(vscode.window).tabGroups.close).toHaveBeenCalledWith(mockTabGroup.tabs[0])
			expect(vi.mocked(vscode.window).tabGroups.close).not.toHaveBeenCalledWith(mockTabGroup.tabs[1])
			expect(vi.mocked(vscode.window).tabGroups.close).not.toHaveBeenCalledWith(mockTabGroup.tabs[2])
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
