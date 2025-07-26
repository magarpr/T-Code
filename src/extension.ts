import * as vscode from "vscode"
import * as dotenvx from "@dotenvx/dotenvx"
import * as path from "path"

// Load environment variables from .env file
try {
	// Specify path to .env file in the project root directory
	const envPath = path.join(__dirname, "..", ".env")
	dotenvx.config({ path: envPath })
} catch (e) {
	// Silently handle environment loading errors
	console.warn("Failed to load environment variables:", e)
}

import { CloudService } from "@roo-code/cloud"
import { TelemetryService, PostHogTelemetryClient } from "@roo-code/telemetry"

import "./utils/path" // Necessary to have access to String.prototype.toPosix.
import { createOutputChannelLogger, createDualLogger } from "./utils/outputChannelLogger"

import { Package } from "./shared/package"
import { formatLanguage } from "./shared/language"
import { ContextProxy } from "./core/config/ContextProxy"
import { ClineProvider } from "./core/webview/ClineProvider"
import { DIFF_VIEW_URI_SCHEME } from "./integrations/editor/DiffViewProvider"
import { TerminalRegistry } from "./integrations/terminal/TerminalRegistry"
import { McpServerManager } from "./services/mcp/McpServerManager"
import { CodeIndexManager } from "./services/code-index/manager"
import { MdmService } from "./services/mdm/MdmService"
import { migrateSettings } from "./utils/migrateSettings"
import { autoImportSettings } from "./utils/autoImportSettings"
import { API } from "./extension/api"

import {
	handleUri,
	registerCommands,
	registerCodeActions,
	registerTerminalActions,
	CodeActionProvider,
} from "./activate"
import { initializeI18n } from "./i18n"

/**
 * Built using https://github.com/microsoft/vscode-webview-ui-toolkit
 *
 * Inspired by:
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra
 */

let outputChannel: vscode.OutputChannel
let extensionContext: vscode.ExtensionContext

// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.
export async function activate(context: vscode.ExtensionContext) {
	extensionContext = context
	outputChannel = vscode.window.createOutputChannel(Package.outputChannel)
	context.subscriptions.push(outputChannel)
	outputChannel.appendLine(`${Package.name} extension activated - ${JSON.stringify(Package)}`)

	// Set up global error handlers for crash recovery
	setupGlobalErrorHandlers(context, outputChannel)

	// Check for crash recovery
	await checkForCrashRecovery(context, outputChannel)

	// Migrate old settings to new
	await migrateSettings(context, outputChannel)

	// Initialize telemetry service.
	const telemetryService = TelemetryService.createInstance()

	try {
		telemetryService.register(new PostHogTelemetryClient())
	} catch (error) {
		console.warn("Failed to register PostHogTelemetryClient:", error)
	}

	// Create logger for cloud services
	const cloudLogger = createDualLogger(createOutputChannelLogger(outputChannel))

	// Initialize Roo Code Cloud service.
	await CloudService.createInstance(context, {
		stateChanged: () => ClineProvider.getVisibleInstance()?.postStateToWebview(),
		log: cloudLogger,
	})

	// Initialize MDM service
	const mdmService = await MdmService.createInstance(cloudLogger)

	// Initialize i18n for internationalization support
	initializeI18n(context.globalState.get("language") ?? formatLanguage(vscode.env.language))

	// Initialize terminal shell execution handlers.
	TerminalRegistry.initialize()

	// Get default commands from configuration.
	const defaultCommands = vscode.workspace.getConfiguration(Package.name).get<string[]>("allowedCommands") || []

	// Initialize global state if not already set.
	if (!context.globalState.get("allowedCommands")) {
		context.globalState.update("allowedCommands", defaultCommands)
	}

	const contextProxy = await ContextProxy.getInstance(context)
	const codeIndexManager = CodeIndexManager.getInstance(context)

	try {
		await codeIndexManager?.initialize(contextProxy)
	} catch (error) {
		outputChannel.appendLine(
			`[CodeIndexManager] Error during background CodeIndexManager configuration/indexing: ${error.message || error}`,
		)
	}

	const provider = new ClineProvider(context, outputChannel, "sidebar", contextProxy, codeIndexManager, mdmService)
	TelemetryService.instance.setProvider(provider)

	if (codeIndexManager) {
		context.subscriptions.push(codeIndexManager)
	}

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ClineProvider.sideBarId, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	)

	// Auto-import configuration if specified in settings
	try {
		await autoImportSettings(outputChannel, {
			providerSettingsManager: provider.providerSettingsManager,
			contextProxy: provider.contextProxy,
			customModesManager: provider.customModesManager,
		})
	} catch (error) {
		outputChannel.appendLine(
			`[AutoImport] Error during auto-import: ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	registerCommands({ context, outputChannel, provider })

	/**
	 * We use the text document content provider API to show the left side for diff
	 * view by creating a virtual document for the original content. This makes it
	 * readonly so users know to edit the right side if they want to keep their changes.
	 *
	 * This API allows you to create readonly documents in VSCode from arbitrary
	 * sources, and works by claiming an uri-scheme for which your provider then
	 * returns text contents. The scheme must be provided when registering a
	 * provider and cannot change afterwards.
	 *
	 * Note how the provider doesn't create uris for virtual documents - its role
	 * is to provide contents given such an uri. In return, content providers are
	 * wired into the open document logic so that providers are always considered.
	 *
	 * https://code.visualstudio.com/api/extension-guides/virtual-documents
	 */
	const diffContentProvider = new (class implements vscode.TextDocumentContentProvider {
		provideTextDocumentContent(uri: vscode.Uri): string {
			return Buffer.from(uri.query, "base64").toString("utf-8")
		}
	})()

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(DIFF_VIEW_URI_SCHEME, diffContentProvider),
	)

	context.subscriptions.push(vscode.window.registerUriHandler({ handleUri }))

	// Register code actions provider.
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ pattern: "**/*" }, new CodeActionProvider(), {
			providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds,
		}),
	)

	registerCodeActions(context)
	registerTerminalActions(context)

	// Allows other extensions to activate once Roo is ready.
	vscode.commands.executeCommand(`${Package.name}.activationCompleted`)

	// Implements the `RooCodeAPI` interface.
	const socketPath = process.env.ROO_CODE_IPC_SOCKET_PATH
	const enableLogging = typeof socketPath === "string"

	// Watch the core files and automatically reload the extension host.
	if (process.env.NODE_ENV === "development") {
		const pattern = "**/*.ts"

		const watchPaths = [
			{ path: context.extensionPath, name: "extension" },
			{ path: path.join(context.extensionPath, "../packages/types"), name: "types" },
			{ path: path.join(context.extensionPath, "../packages/telemetry"), name: "telemetry" },
			{ path: path.join(context.extensionPath, "../packages/cloud"), name: "cloud" },
		]

		console.log(
			`♻️♻️♻️ Core auto-reloading is ENABLED. Watching for changes in: ${watchPaths.map(({ name }) => name).join(", ")}`,
		)

		watchPaths.forEach(({ path: watchPath, name }) => {
			const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(watchPath, pattern))

			watcher.onDidChange((uri) => {
				console.log(`♻️ ${name} file changed: ${uri.fsPath}. Reloading host…`)
				vscode.commands.executeCommand("workbench.action.reloadWindow")
			})

			context.subscriptions.push(watcher)
		})
	}

	return new API(outputChannel, provider, socketPath, enableLogging)
}

// This method is called when your extension is deactivated.
export async function deactivate() {
	outputChannel.appendLine(`${Package.name} extension deactivated`)
	await McpServerManager.cleanup(extensionContext)
	TelemetryService.instance.shutdown()
	TerminalRegistry.cleanup()
}

// Global error handlers for crash recovery
function setupGlobalErrorHandlers(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
	// Handle uncaught exceptions
	process.on("uncaughtException", async (error: Error) => {
		const errorMessage = `[CRASH] Uncaught Exception: ${error.message}\nStack: ${error.stack}`
		outputChannel.appendLine(errorMessage)
		console.error(errorMessage)

		// Save crash information
		await saveCrashInfo(context, error, "uncaughtException")

		// Attempt to save current task state
		await saveTaskStateOnCrash(context)

		// Log telemetry
		// Log crash telemetry
		try {
			if (TelemetryService.hasInstance()) {
				TelemetryService.instance.captureEvent("extension_crash" as any, {
					type: "uncaughtException",
					error: error.message,
					stack: error.stack,
					platform: process.platform,
				})
			}
		} catch (e) {
			console.error("Failed to log telemetry:", e)
		}

		// Show user-friendly error message
		vscode.window
			.showErrorMessage(
				"Roo Code encountered an unexpected error. Your work has been saved. Please restart VS Code.",
				"Restart VS Code",
			)
			.then((selection) => {
				if (selection === "Restart VS Code") {
					vscode.commands.executeCommand("workbench.action.reloadWindow")
				}
			})
	})

	// Handle unhandled promise rejections
	process.on("unhandledRejection", async (reason: any, promise: Promise<any>) => {
		const errorMessage = `[CRASH] Unhandled Promise Rejection: ${reason}\nPromise: ${promise}`
		outputChannel.appendLine(errorMessage)
		console.error(errorMessage)

		// Save crash information
		await saveCrashInfo(context, reason, "unhandledRejection")

		// Attempt to save current task state
		await saveTaskStateOnCrash(context)

		// Log telemetry
		// Log crash telemetry
		try {
			if (TelemetryService.hasInstance()) {
				TelemetryService.instance.captureEvent("extension_crash" as any, {
					type: "unhandledRejection",
					reason: String(reason),
					platform: process.platform,
				})
			}
		} catch (e) {
			console.error("Failed to log telemetry:", e)
		}
	})

	// Windows-specific error handling
	if (process.platform === "win32") {
		// Handle Windows-specific errors
		process.on("SIGTERM", async () => {
			outputChannel.appendLine("[CRASH] Received SIGTERM signal (Windows termination)")
			await saveCrashInfo(context, new Error("SIGTERM received"), "SIGTERM")
			await saveTaskStateOnCrash(context)
		})

		process.on("SIGINT", async () => {
			outputChannel.appendLine("[CRASH] Received SIGINT signal (Windows interruption)")
			await saveCrashInfo(context, new Error("SIGINT received"), "SIGINT")
			await saveTaskStateOnCrash(context)
		})

		// Handle Windows-specific exit events
		process.on("exit", async (code) => {
			if (code !== 0) {
				outputChannel.appendLine(`[CRASH] Process exiting with code ${code}`)
				await saveCrashInfo(context, new Error(`Process exit with code ${code}`), "exit")
				await saveTaskStateOnCrash(context)
			}
		})

		// Handle Windows-specific errors that might cause crashes
		process.on("uncaughtExceptionMonitor", (error: Error, origin: string) => {
			// This event is emitted before uncaughtException, useful for logging
			outputChannel.appendLine(`[CRASH] Uncaught exception monitor: ${error.message} from ${origin}`)

			// Check for Windows-specific error patterns
			if (error.message.includes("EPERM") || error.message.includes("EACCES")) {
				outputChannel.appendLine("[CRASH] Windows permission error detected")
			} else if (error.message.includes("ENOENT")) {
				outputChannel.appendLine("[CRASH] Windows file not found error detected")
			} else if (error.message.includes("spawn") || error.message.includes("ENOBUFS")) {
				outputChannel.appendLine("[CRASH] Windows process spawn error detected")
			}
		})
	}
}

// Save crash information for recovery
async function saveCrashInfo(context: vscode.ExtensionContext, error: any, type: string) {
	try {
		const crashInfo = {
			timestamp: new Date().toISOString(),
			type,
			error:
				error instanceof Error
					? {
							message: error.message,
							stack: error.stack,
							name: error.name,
						}
					: String(error),
			platform: process.platform,
			vscodeVersion: vscode.version,
			extensionVersion: context.extension?.packageJSON?.version,
		}

		await context.globalState.update("lastCrashInfo", crashInfo)
		await context.globalState.update("hasCrashRecovery", true)
	} catch (e) {
		console.error("Failed to save crash info:", e)
	}
}

// Save current task state on crash
async function saveTaskStateOnCrash(context: vscode.ExtensionContext) {
	try {
		const provider = ClineProvider.getVisibleInstance()
		if (provider) {
			const currentTask = provider.getCurrentCline()
			if (currentTask) {
				// Save current task state
				// Force save current state
				await provider.postStateToWebview()

				// Save task recovery info
				const recoveryInfo = {
					taskId: currentTask.taskId,
					parentTaskId: currentTask.parentTask?.taskId,
					taskStack: provider.getCurrentTaskStack(),
					timestamp: new Date().toISOString(),
				}

				await context.globalState.update("taskRecoveryInfo", recoveryInfo)
				outputChannel.appendLine(`[CRASH] Saved task recovery info for task ${currentTask.taskId}`)
			}
		}
	} catch (e) {
		console.error("Failed to save task state on crash:", e)
	}
}

// Check for crash recovery on startup
async function checkForCrashRecovery(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
	try {
		const hasCrashRecovery = context.globalState.get<boolean>("hasCrashRecovery")
		const lastCrashInfo = context.globalState.get<any>("lastCrashInfo")
		const taskRecoveryInfo = context.globalState.get<any>("taskRecoveryInfo")

		if (hasCrashRecovery && lastCrashInfo) {
			outputChannel.appendLine(
				`[RECOVERY] Detected previous crash: ${lastCrashInfo.type} at ${lastCrashInfo.timestamp}`,
			)

			// Clear the crash flag
			await context.globalState.update("hasCrashRecovery", false)

			// Show recovery notification with Windows-specific messaging if applicable
			const isWindows = process.platform === "win32"
			const crashMessage =
				isWindows && (lastCrashInfo.type === "SIGTERM" || lastCrashInfo.type === "SIGINT")
					? "Roo Code was terminated unexpectedly on Windows. Would you like to restore your last session?"
					: "Roo Code recovered from a previous crash. Would you like to restore your last session?"

			const selection = await vscode.window.showInformationMessage(crashMessage, "Restore Session", "Start Fresh")

			if (selection === "Restore Session" && taskRecoveryInfo) {
				outputChannel.appendLine(`[RECOVERY] Attempting to restore task ${taskRecoveryInfo.taskId}`)

				// Delay to ensure extension is fully initialized
				setTimeout(async () => {
					try {
						const provider = ClineProvider.getVisibleInstance()
						if (provider && taskRecoveryInfo.taskId) {
							// Check if this was a subtask
							if (taskRecoveryInfo.parentTaskId) {
								outputChannel.appendLine(
									`[RECOVERY] Detected subtask recovery. Parent task: ${taskRecoveryInfo.parentTaskId}`,
								)

								// First, try to restore the parent task
								try {
									await provider.showTaskWithId(taskRecoveryInfo.parentTaskId)
									outputChannel.appendLine(
										`[RECOVERY] Restored parent task ${taskRecoveryInfo.parentTaskId}`,
									)

									// Then show information about the subtask that was interrupted
									vscode.window
										.showInformationMessage(
											`Restored to parent task. The subtask that was running during the crash has been saved and can be resumed.`,
											"View Subtask",
										)
										.then(async (selection) => {
											if (selection === "View Subtask") {
												// Show the subtask that was interrupted
												await provider.showTaskWithId(taskRecoveryInfo.taskId)
											}
										})
								} catch (parentError) {
									// If parent task can't be restored, just restore the subtask
									outputChannel.appendLine(
										`[RECOVERY] Failed to restore parent task, restoring subtask instead`,
									)
									await provider.showTaskWithId(taskRecoveryInfo.taskId)

									vscode.window.showInformationMessage(
										`Restored subtask from before the crash. The parent task context may need to be re-established.`,
									)
								}
							} else {
								// Regular task recovery
								await provider.showTaskWithId(taskRecoveryInfo.taskId)

								vscode.window.showInformationMessage(`Restored task from before the crash.`)
							}

							// If there was a task stack, log it for debugging
							if (taskRecoveryInfo.taskStack && taskRecoveryInfo.taskStack.length > 1) {
								outputChannel.appendLine(
									`[RECOVERY] Task stack at crash: ${taskRecoveryInfo.taskStack.join(" -> ")}`,
								)
							}
						}
					} catch (e) {
						console.error("Failed to restore task:", e)
						vscode.window.showErrorMessage(
							"Could not restore the previous task, but your work has been saved.",
						)
					}
				}, 2000)
			}

			// Clear recovery info
			await context.globalState.update("taskRecoveryInfo", undefined)
			await context.globalState.update("lastCrashInfo", undefined)
		}
	} catch (e) {
		console.error("Error checking for crash recovery:", e)
	}
}
