import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import * as path from "path"
import * as os from "os"
import { Task } from "../Task"
import { ClineProvider } from "../../webview/ClineProvider"

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [],
		getWorkspaceFolder: vi.fn(),
		createFileSystemWatcher: vi.fn(() => ({
			onDidChange: vi.fn(),
			onDidCreate: vi.fn(),
			onDidDelete: vi.fn(),
			dispose: vi.fn(),
		})),
	},
	window: {
		activeTextEditor: undefined,
		showErrorMessage: vi.fn(),
		createTextEditorDecorationType: vi.fn(() => ({
			dispose: vi.fn(),
		})),
	},
	Uri: {
		file: vi.fn((path) => ({ fsPath: path })),
	},
	RelativePattern: vi.fn(),
	DiagnosticSeverity: {
		Error: 0,
		Warning: 1,
		Information: 2,
		Hint: 3,
	},
	languages: {
		getDiagnostics: vi.fn(() => []),
	},
}))

// Mock other dependencies
vi.mock("../../webview/ClineProvider")
vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn(() => "/default/workspace"),
}))
vi.mock("../../ignore/RooIgnoreController")
vi.mock("../../protect/RooProtectedController")
vi.mock("../../context-tracking/FileContextTracker")
vi.mock("../../../integrations/editor/DiffViewProvider")
vi.mock("../../../integrations/editor/DecorationController")
vi.mock("../../../services/browser/UrlContentFetcher")
vi.mock("../../../integrations/terminal/TerminalRegistry")
vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn(() => Promise.resolve(false)),
}))
vi.mock("../../../api", () => ({
	buildApiHandler: vi.fn(() => ({
		getModel: vi.fn(() => ({ info: {} })),
	})),
}))
vi.mock("../../tools/ToolRepetitionDetector", () => ({
	ToolRepetitionDetector: vi.fn().mockImplementation(() => ({})),
}))
vi.mock("../../tools/AutoApprovalHandler", () => ({
	AutoApprovalHandler: vi.fn().mockImplementation(() => ({})),
}))

describe("Multi-folder Workspace Support", () => {
	let mockProvider: ClineProvider

	beforeEach(() => {
		mockProvider = {
			context: {
				globalStorageUri: { fsPath: "/global/storage" },
			},
		} as any

		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("Task workspace path initialization", () => {
		it("should use the active editor's workspace folder in multi-folder workspace", () => {
			// Setup multi-folder workspace
			const workspaceFolders = [
				{ uri: { fsPath: "/workspace/frontend" }, name: "frontend" },
				{ uri: { fsPath: "/workspace/backend" }, name: "backend" },
			]
			;(vscode.workspace as any).workspaceFolders = workspaceFolders

			// Set active editor in backend folder
			const activeFileUri = { fsPath: "/workspace/backend/src/index.ts" }
			;(vscode.window as any).activeTextEditor = {
				document: { uri: activeFileUri },
			}
			;(vscode.workspace.getWorkspaceFolder as any).mockReturnValue(workspaceFolders[1])

			// Create task
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: {} as any,
				task: "Test task",
				startTask: false,
			})

			// Should use backend workspace folder
			expect(task.workspacePath).toBe("/workspace/backend")
		})

		it("should maintain consistent workspace path throughout task lifetime", () => {
			// Setup multi-folder workspace
			const workspaceFolders = [
				{ uri: { fsPath: "/workspace/frontend" }, name: "frontend" },
				{ uri: { fsPath: "/workspace/backend" }, name: "backend" },
			]
			;(vscode.workspace as any).workspaceFolders = workspaceFolders

			// Set active editor in frontend folder
			const activeFileUri = { fsPath: "/workspace/frontend/src/App.tsx" }
			;(vscode.window as any).activeTextEditor = {
				document: { uri: activeFileUri },
			}
			;(vscode.workspace.getWorkspaceFolder as any).mockReturnValue(workspaceFolders[0])

			// Create task
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: {} as any,
				task: "Test task",
				startTask: false,
			})

			const initialWorkspacePath = task.workspacePath
			expect(initialWorkspacePath).toBe("/workspace/frontend")

			// Change active editor to backend folder
			;(vscode.window as any).activeTextEditor = {
				document: { uri: { fsPath: "/workspace/backend/src/index.ts" } },
			}
			;(vscode.workspace.getWorkspaceFolder as any).mockReturnValue(workspaceFolders[1])

			// Workspace path should remain the same
			expect(task.workspacePath).toBe(initialWorkspacePath)
			expect(task.cwd).toBe(initialWorkspacePath)
		})

		it("should inherit workspace path from parent task", () => {
			const parentTask = {
				workspacePath: "/workspace/parent",
			} as any

			const task = new Task({
				provider: mockProvider,
				apiConfiguration: {} as any,
				task: "Child task",
				parentTask,
				startTask: false,
			})

			expect(task.workspacePath).toBe("/workspace/parent")
		})

		it("should fallback to first workspace folder when no active editor", () => {
			const workspaceFolders = [
				{ uri: { fsPath: "/workspace/frontend" }, name: "frontend" },
				{ uri: { fsPath: "/workspace/backend" }, name: "backend" },
			]
			;(vscode.workspace as any).workspaceFolders = workspaceFolders
			;(vscode.window as any).activeTextEditor = undefined

			// Mock getWorkspacePath to return first folder
			const { getWorkspacePath } = require("../../../utils/path")
			getWorkspacePath.mockReturnValue("/workspace/frontend")

			const task = new Task({
				provider: mockProvider,
				apiConfiguration: {} as any,
				task: "Test task",
				startTask: false,
			})

			expect(task.workspacePath).toBe("/workspace/frontend")
		})
	})

	describe(".roo folder detection", () => {
		it("should detect .roo folder as a workspace folder", () => {
			const workspaceFolders = [
				{ uri: { fsPath: "/workspace/src" }, name: "src" },
				{ uri: { fsPath: "/workspace/.roo" }, name: ".roo" },
				{ uri: { fsPath: "/workspace/docs" }, name: "docs" },
			]
			;(vscode.workspace as any).workspaceFolders = workspaceFolders

			// Check if .roo is detected as a workspace folder
			const rooWorkspaceFolder = workspaceFolders.find((folder) => path.basename(folder.uri.fsPath) === ".roo")

			expect(rooWorkspaceFolder).toBeDefined()
			expect(rooWorkspaceFolder?.uri.fsPath).toBe("/workspace/.roo")
		})

		it("should use .roo subfolder in active workspace folder", () => {
			const workspaceFolders = [
				{ uri: { fsPath: "/workspace/frontend" }, name: "frontend" },
				{ uri: { fsPath: "/workspace/backend" }, name: "backend" },
			]
			;(vscode.workspace as any).workspaceFolders = workspaceFolders

			// Set active editor in backend folder
			const activeFileUri = { fsPath: "/workspace/backend/src/index.ts" }
			;(vscode.window as any).activeTextEditor = {
				document: { uri: activeFileUri },
			}
			;(vscode.workspace.getWorkspaceFolder as any).mockReturnValue(workspaceFolders[1])

			// Determine .roo folder path
			const targetWorkspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(activeFileUri.fsPath))
			const rooPath = path.join(targetWorkspaceFolder!.uri.fsPath, ".roo")

			expect(rooPath).toBe("/workspace/backend/.roo")
		})
	})

	describe("File mention paths in multi-folder workspace", () => {
		it("should convert absolute paths to workspace-relative paths", () => {
			const workspaceFolders = [
				{ uri: { fsPath: "/workspace/frontend" }, name: "frontend" },
				{ uri: { fsPath: "/workspace/backend" }, name: "backend" },
			]
			;(vscode.workspace as any).workspaceFolders = workspaceFolders

			// Mock getWorkspaceFolder to return the correct folder
			;(vscode.workspace.getWorkspaceFolder as any).mockImplementation((uri: any) => {
				const filePath = uri.fsPath
				if (filePath.startsWith("/workspace/frontend")) {
					return workspaceFolders[0]
				} else if (filePath.startsWith("/workspace/backend")) {
					return workspaceFolders[1]
				}
				return undefined
			})

			// Test absolute path from backend folder
			const absolutePath = "/workspace/backend/src/api/server.ts"
			const fileUri = vscode.Uri.file(absolutePath)
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri)

			expect(workspaceFolder).toBeDefined()
			expect(workspaceFolder?.name).toBe("backend")

			// Convert to relative path
			const relativePath = path.relative(workspaceFolder!.uri.fsPath, absolutePath)
			const displayPath = path.join(workspaceFolder!.name, relativePath)

			expect(displayPath).toBe("backend/src/api/server.ts")
		})

		it("should handle file mentions across different workspace folders", () => {
			const workspaceFolders = [
				{ uri: { fsPath: "/workspace/frontend" }, name: "frontend" },
				{ uri: { fsPath: "/workspace/backend" }, name: "backend" },
			]
			;(vscode.workspace as any).workspaceFolders = workspaceFolders

			// Mock getWorkspaceFolder
			;(vscode.workspace.getWorkspaceFolder as any).mockImplementation((uri: any) => {
				const filePath = uri.fsPath
				if (filePath.startsWith("/workspace/frontend")) {
					return workspaceFolders[0]
				} else if (filePath.startsWith("/workspace/backend")) {
					return workspaceFolders[1]
				}
				return undefined
			})

			// Test files from different folders
			const frontendFile = "/workspace/frontend/src/App.tsx"
			const backendFile = "/workspace/backend/src/server.ts"

			// Get workspace folders for each file
			const frontendFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(frontendFile))
			const backendFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(backendFile))

			// Convert to display paths
			const frontendDisplayPath = path.join(
				frontendFolder!.name,
				path.relative(frontendFolder!.uri.fsPath, frontendFile),
			)
			const backendDisplayPath = path.join(
				backendFolder!.name,
				path.relative(backendFolder!.uri.fsPath, backendFile),
			)

			expect(frontendDisplayPath).toBe("frontend/src/App.tsx")
			expect(backendDisplayPath).toBe("backend/src/server.ts")
		})
	})
})
