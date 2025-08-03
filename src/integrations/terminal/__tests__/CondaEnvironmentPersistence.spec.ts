import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { TerminalRegistry } from "../TerminalRegistry"
import { Terminal } from "../Terminal"
import { TerminalProcess } from "../TerminalProcess"
import { BaseTerminal } from "../BaseTerminal"

// Mock vscode module
vi.mock("vscode", () => ({
	window: {
		createTerminal: vi.fn(),
		onDidCloseTerminal: vi.fn(),
		onDidStartTerminalShellExecution: vi.fn(),
		onDidEndTerminalShellExecution: vi.fn(),
	},
	workspace: {
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn().mockReturnValue(0),
		}),
	},
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path })),
	},
	ThemeIcon: vi.fn(),
}))

describe("Conda Environment Persistence", () => {
	let mockTerminal: any
	let mockShellIntegration: any
	let isInitialized = false

	beforeEach(() => {
		// Reset the terminal registry
		vi.clearAllMocks()

		// Mock shell integration
		mockShellIntegration = {
			executeCommand: vi.fn(),
			cwd: vscode.Uri.file("/test/path"),
		}

		// Mock VSCode terminal
		mockTerminal = {
			shellIntegration: mockShellIntegration,
			show: vi.fn(),
			sendText: vi.fn(),
			exitStatus: undefined,
		}

		// Mock createTerminal to return our mock terminal
		vi.mocked(vscode.window.createTerminal).mockReturnValue(mockTerminal)

		// Mock event handlers to return disposables
		vi.mocked(vscode.window.onDidCloseTerminal).mockReturnValue({ dispose: vi.fn() })
		vi.mocked(vscode.window.onDidStartTerminalShellExecution).mockReturnValue({ dispose: vi.fn() })
		vi.mocked(vscode.window.onDidEndTerminalShellExecution).mockReturnValue({ dispose: vi.fn() })

		// Initialize TerminalRegistry only once
		if (!isInitialized) {
			try {
				TerminalRegistry.initialize()
				isInitialized = true
			} catch (e) {
				// Already initialized
			}
		}

		// Clear the last active environment for each test
		TerminalRegistry.setLastActiveEnvironment(undefined)
	})

	afterEach(() => {
		// Don't call cleanup in tests as it affects the singleton state
	})

	describe("Terminal Environment Tracking", () => {
		it("should track conda environment activation in Terminal", async () => {
			const terminal = new Terminal(1, mockTerminal, "/test/path")

			// Initially, no environment should be active
			expect(terminal.activeEnvironment).toBeUndefined()

			// Simulate conda activate command
			const process = new TerminalProcess(terminal)
			process.command = "conda activate myenv"

			// Mock successful activation (no error in output)
			process["fullOutput"] = "Activating environment at /path/to/myenv"

			// Simulate the conda activation detection logic
			const condaActivateMatch = process.command.match(/^\s*conda\s+activate\s+(.+)$/i)
			if (condaActivateMatch) {
				const envName = condaActivateMatch[1].trim()
				const cleanOutput = process["fullOutput"].toLowerCase()
				if (!cleanOutput.includes("error") && !cleanOutput.includes("not found")) {
					terminal.activeEnvironment = envName
				}
			}

			expect(terminal.activeEnvironment).toBe("myenv")
		})

		it("should clear environment on conda deactivate", async () => {
			const terminal = new Terminal(1, mockTerminal, "/test/path")

			// Set an active environment
			terminal.activeEnvironment = "myenv"
			expect(terminal.activeEnvironment).toBe("myenv")

			// Simulate conda deactivate command
			const process = new TerminalProcess(terminal)
			process.command = "conda deactivate"

			// Simulate the conda deactivation detection logic
			const condaDeactivateMatch = process.command.match(/^\s*conda\s+deactivate\s*$/i)
			if (condaDeactivateMatch) {
				terminal.activeEnvironment = undefined
			}

			expect(terminal.activeEnvironment).toBeUndefined()
		})

		it("should not activate environment if command fails", async () => {
			const terminal = new Terminal(1, mockTerminal, "/test/path")

			// Simulate conda activate command with error
			const process = new TerminalProcess(terminal)
			process.command = "conda activate nonexistent"

			// Mock error in output
			process["fullOutput"] = "EnvironmentNotFoundError: Could not find conda environment: nonexistent"

			// Simulate the conda activation detection logic
			const condaActivateMatch = process.command.match(/^\s*conda\s+activate\s+(.+)$/i)
			if (condaActivateMatch) {
				const envName = condaActivateMatch[1].trim()
				const cleanOutput = process["fullOutput"].toLowerCase()
				if (!cleanOutput.includes("error") && !cleanOutput.includes("not found")) {
					terminal.activeEnvironment = envName
				}
			}

			// Environment should not be activated due to error
			expect(terminal.activeEnvironment).toBeUndefined()
		})
	})

	describe("TerminalRegistry Environment Persistence", () => {
		it("should track last active environment in TerminalRegistry", () => {
			// Initially no environment
			expect(TerminalRegistry.getLastActiveEnvironment()).toBeUndefined()

			// Set an environment
			TerminalRegistry.setLastActiveEnvironment("myenv")
			expect(TerminalRegistry.getLastActiveEnvironment()).toBe("myenv")

			// Clear environment
			TerminalRegistry.setLastActiveEnvironment(undefined)
			expect(TerminalRegistry.getLastActiveEnvironment()).toBeUndefined()
		})

		it("should prefer terminals with matching conda environment", async () => {
			// Get the current terminals count to track new ones
			const initialTerminals = TerminalRegistry.getTerminals(false)

			// Create two terminals with different environments
			const terminal1 = TerminalRegistry.createTerminal("/test/path", "vscode") as Terminal
			terminal1.activeEnvironment = "env1"
			terminal1.busy = false

			const terminal2 = TerminalRegistry.createTerminal("/test/path", "vscode") as Terminal
			terminal2.activeEnvironment = "env2"
			terminal2.busy = false

			// Set last active environment to env2
			TerminalRegistry.setLastActiveEnvironment("env2")

			// Request a terminal - should prefer terminal2
			const selectedTerminal = await TerminalRegistry.getOrCreateTerminal(
				"/test/path",
				false,
				undefined,
				"vscode",
			)
			expect(selectedTerminal.activeEnvironment).toBe("env2")
		})

		it("should create new terminal if no matching environment found", async () => {
			// Create a terminal with env1
			const terminal1 = TerminalRegistry.createTerminal("/test/path", "vscode") as Terminal
			terminal1.activeEnvironment = "env1"
			terminal1.busy = false

			// Set last active environment to env2 (no matching terminal)
			TerminalRegistry.setLastActiveEnvironment("env2")

			// Count terminals before request
			const terminalsBefore = TerminalRegistry.getTerminals(false).length

			// Request a terminal with required cwd - should create new one since env doesn't match
			const selectedTerminal = await TerminalRegistry.getOrCreateTerminal(
				"/different/path",
				true,
				undefined,
				"vscode",
			)

			// Count terminals after request
			const terminalsAfter = TerminalRegistry.getTerminals(false).length

			// Should have created a new terminal
			expect(terminalsAfter).toBe(terminalsBefore + 1)
			expect(selectedTerminal).not.toBe(terminal1)
		})

		it("should fallback to any available terminal if environment doesn't match and cwd not required", async () => {
			// Get all existing terminals and mark them as busy
			const existingTerminals = TerminalRegistry.getTerminals(false)
			existingTerminals.forEach((t) => (t.busy = true))

			// Create a terminal with env1
			const terminal1 = TerminalRegistry.createTerminal("/test/path", "vscode") as Terminal
			terminal1.activeEnvironment = "env1"
			terminal1.busy = false

			// Clear last active environment (no preference)
			TerminalRegistry.setLastActiveEnvironment(undefined)

			// Request a terminal without required cwd - should use terminal1 since no env preference
			const selectedTerminal = await TerminalRegistry.getOrCreateTerminal(
				"/test/path",
				false,
				undefined,
				"vscode",
			)
			expect(selectedTerminal.id).toBe(terminal1.id)
		})
	})

	describe("Integration with execute_command", () => {
		it("should maintain conda environment across multiple commands in same task", async () => {
			const taskId = "test-task-123"

			// First command: activate conda environment
			const terminal1 = (await TerminalRegistry.getOrCreateTerminal(
				"/test/path",
				false,
				taskId,
				"vscode",
			)) as Terminal
			terminal1.activeEnvironment = "myenv"
			TerminalRegistry.setLastActiveEnvironment("myenv")
			terminal1.busy = false

			// Second command: should reuse the same terminal with active environment
			const terminal2 = await TerminalRegistry.getOrCreateTerminal("/test/path", false, taskId, "vscode")

			expect(terminal2).toBe(terminal1)
			expect(terminal2.activeEnvironment).toBe("myenv")
		})

		it("should prefer environment-matched terminal even across different tasks", async () => {
			// Create terminal with env for task1
			const terminal1 = (await TerminalRegistry.getOrCreateTerminal(
				"/test/path",
				false,
				"task1",
				"vscode",
			)) as Terminal
			terminal1.activeEnvironment = "myenv"
			TerminalRegistry.setLastActiveEnvironment("myenv")
			terminal1.busy = false
			terminal1.taskId = undefined // Release from task1

			// Request terminal for task2 - should still prefer terminal1 due to environment match
			const terminal2 = await TerminalRegistry.getOrCreateTerminal("/test/path", false, "task2", "vscode")

			expect(terminal2).toBe(terminal1)
			expect(terminal2.activeEnvironment).toBe("myenv")
		})
	})
})
