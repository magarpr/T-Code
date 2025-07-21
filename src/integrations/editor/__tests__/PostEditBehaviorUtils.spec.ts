// npx vitest src/integrations/editor/__tests__/PostEditBehaviorUtils.spec.ts

import * as vscode from "vscode"
import { PostEditBehaviorUtils } from "../PostEditBehaviorUtils"

// Mock DecorationController to avoid vscode.window.createTextEditorDecorationType error
vi.mock("../DecorationController", () => ({
	DecorationController: {
		instance: {
			clearDecorations: vi.fn(),
			decorateLines: vi.fn(),
		},
	},
}))

// Mock vscode module
vi.mock("vscode", () => {
	const mockTab = (input: any, isDirty = false) => ({
		input,
		isDirty,
		group: { close: vi.fn() },
	})

	const mockTabGroups = {
		all: [],
		close: vi.fn().mockResolvedValue(true),
	}

	return {
		window: {
			tabGroups: mockTabGroups,
		},
		TabInputText: class {
			constructor(public uri: any) {}
		},
		TabInputTextDiff: class {
			constructor(
				public original: any,
				public modified: any,
			) {}
		},
		Uri: {
			parse: (str: string) => ({
				scheme: str.split(":")[0],
				fsPath: str.replace(/^[^:]+:/, ""),
				toString: () => str,
			}),
			file: (path: string) => ({
				scheme: "file",
				fsPath: path,
				toString: () => `file:${path}`,
			}),
		},
	}
})

describe("PostEditBehaviorUtils", () => {
	let mockTabGroups: any

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks()
		mockTabGroups = vi.mocked(vscode.window.tabGroups)
		mockTabGroups.all = []
		// Reset the close mock for each test
		mockTabGroups.close = vi.fn().mockResolvedValue(true)
	})

	describe("closeRooTabs", () => {
		it("should not close any tabs when both settings are false", async () => {
			const rooOpenedTabs = new Set(["/test/file1.ts", "/test/file2.ts"])
			const mockTabGroup = {
				tabs: [
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file1.ts")),
						isDirty: false,
						group: { close: vi.fn() },
					},
				],
			}
			mockTabGroups.all = [mockTabGroup]

			await PostEditBehaviorUtils.closeRooTabs(false, false, rooOpenedTabs)

			expect(vi.mocked(vscode.window.tabGroups).close).not.toHaveBeenCalled()
		})

		it("should close only tabs opened during current task when autoCloseRooTabs is true", async () => {
			const rooOpenedTabs = new Set(["/test/file1.ts", "/test/file2.ts"])
			const closeMock1 = vi.fn()
			const closeMock2 = vi.fn()
			const closeMock3 = vi.fn()

			const mockTabGroup = {
				tabs: [
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file1.ts")),
						isDirty: false,
						group: { close: closeMock1 },
					},
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file2.ts")),
						isDirty: false,
						group: { close: closeMock2 },
					},
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file3.ts")),
						isDirty: false,
						group: { close: closeMock3 },
					},
				],
			}
			mockTabGroups.all = [mockTabGroup]

			await PostEditBehaviorUtils.closeRooTabs(true, false, rooOpenedTabs)

			// Should close file1 and file2 (in rooOpenedTabs), but not file3
			const closeMock = vi.mocked(vscode.window.tabGroups).close
			expect(closeMock).toHaveBeenCalledTimes(2)
			expect(closeMock).toHaveBeenCalledWith(mockTabGroup.tabs[0])
			expect(closeMock).toHaveBeenCalledWith(mockTabGroup.tabs[1])
		})

		it("should close all Roo tabs when autoCloseAllRooTabs is true", async () => {
			const rooOpenedTabs = new Set(["/test/file1.ts"])
			const closeMock1 = vi.fn()
			const closeMock2 = vi.fn()
			const closeMock3 = vi.fn()

			const mockTabGroup = {
				tabs: [
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file1.ts")),
						isDirty: false,
						group: { close: closeMock1 },
					},
					{
						input: new vscode.TabInputTextDiff(
							vscode.Uri.parse("cline-diff:original"),
							vscode.Uri.file("/test/file2.ts"),
						),
						isDirty: false,
						group: { close: closeMock2 },
					},
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file3.ts")),
						isDirty: false,
						group: { close: closeMock3 },
					},
				],
			}
			mockTabGroups.all = [mockTabGroup]

			await PostEditBehaviorUtils.closeRooTabs(false, true, rooOpenedTabs)

			// Should close file1 (in rooOpenedTabs) and file2 (diff view), but not file3
			const closeMock = vi.mocked(vscode.window.tabGroups).close
			expect(closeMock).toHaveBeenCalledTimes(2)
			expect(closeMock).toHaveBeenCalledWith(mockTabGroup.tabs[0])
			expect(closeMock).toHaveBeenCalledWith(mockTabGroup.tabs[1])
		})

		it("should not close tabs with unsaved changes", async () => {
			const rooOpenedTabs = new Set(["/test/file1.ts", "/test/file2.ts"])
			const closeMock1 = vi.fn()
			const closeMock2 = vi.fn()

			const mockTabGroup = {
				tabs: [
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file1.ts")),
						isDirty: true, // Has unsaved changes
						group: { close: closeMock1 },
					},
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file2.ts")),
						isDirty: false,
						group: { close: closeMock2 },
					},
				],
			}
			mockTabGroups.all = [mockTabGroup]

			await PostEditBehaviorUtils.closeRooTabs(true, false, rooOpenedTabs)

			// Should not close file1 (dirty), but should close file2
			const closeMock = vi.mocked(vscode.window.tabGroups).close
			expect(closeMock).toHaveBeenCalledTimes(1)
			expect(closeMock).toHaveBeenCalledWith(mockTabGroup.tabs[1])
			expect(closeMock).not.toHaveBeenCalledWith(mockTabGroup.tabs[0])
		})

		it("should not close the edited file when provided", async () => {
			const rooOpenedTabs = new Set(["/test/file1.ts", "/test/file2.ts"])
			const editedFilePath = "/test/file1.ts"
			const closeMock1 = vi.fn()
			const closeMock2 = vi.fn()

			const mockTabGroup = {
				tabs: [
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file1.ts")),
						isDirty: false,
						group: { close: closeMock1 },
					},
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file2.ts")),
						isDirty: false,
						group: { close: closeMock2 },
					},
				],
			}
			mockTabGroups.all = [mockTabGroup]

			await PostEditBehaviorUtils.closeRooTabs(true, false, rooOpenedTabs, editedFilePath)

			// Should not close file1 (edited file), but should close file2
			const closeMock = vi.mocked(vscode.window.tabGroups).close
			expect(closeMock).toHaveBeenCalledTimes(1)
			expect(closeMock).toHaveBeenCalledWith(mockTabGroup.tabs[1])
			expect(closeMock).not.toHaveBeenCalledWith(mockTabGroup.tabs[0])
		})

		it("should handle tabs without input gracefully", async () => {
			const rooOpenedTabs = new Set(["/test/file1.ts"])
			const closeMock = vi.fn()

			const mockTabGroup = {
				tabs: [
					{
						input: undefined, // No input
						isDirty: false,
						group: { close: closeMock },
					},
				],
			}
			mockTabGroups.all = [mockTabGroup]

			await PostEditBehaviorUtils.closeRooTabs(true, false, rooOpenedTabs)

			// Should not crash and should not close tabs without input
			expect(vi.mocked(vscode.window.tabGroups).close).not.toHaveBeenCalled()
		})

		it("should handle multiple tab groups", async () => {
			const rooOpenedTabs = new Set(["/test/file1.ts", "/test/file2.ts"])
			const closeMock1 = vi.fn()
			const closeMock2 = vi.fn()

			const mockTabGroup1 = {
				tabs: [
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file1.ts")),
						isDirty: false,
						group: { close: closeMock1 },
					},
				],
			}

			const mockTabGroup2 = {
				tabs: [
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file2.ts")),
						isDirty: false,
						group: { close: closeMock2 },
					},
				],
			}

			mockTabGroups.all = [mockTabGroup1, mockTabGroup2]

			await PostEditBehaviorUtils.closeRooTabs(true, false, rooOpenedTabs)

			// Should close tabs from both groups
			const closeMock = vi.mocked(vscode.window.tabGroups).close
			expect(closeMock).toHaveBeenCalledTimes(2)
			expect(closeMock).toHaveBeenCalledWith(mockTabGroup1.tabs[0])
			expect(closeMock).toHaveBeenCalledWith(mockTabGroup2.tabs[0])
		})

		it("should handle errors gracefully", async () => {
			const rooOpenedTabs = new Set(["/test/file1.ts"])

			// Mock the close method to reject
			vi.mocked(vscode.window.tabGroups).close.mockRejectedValueOnce(new Error("Close failed"))

			const mockTabGroup = {
				tabs: [
					{
						input: new vscode.TabInputText(vscode.Uri.file("/test/file1.ts")),
						isDirty: false,
						group: { close: vi.fn() },
					},
				],
			}
			mockTabGroups.all = [mockTabGroup]

			// Should not throw
			await expect(PostEditBehaviorUtils.closeRooTabs(true, false, rooOpenedTabs)).resolves.toBeUndefined()

			expect(vi.mocked(vscode.window.tabGroups).close).toHaveBeenCalled()
		})
	})
})
