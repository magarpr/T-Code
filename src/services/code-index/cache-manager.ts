import * as vscode from "vscode"
import { createHash } from "crypto"
import { ICacheManager } from "./interfaces/cache"
import debounce from "lodash.debounce"
import { safeWriteJson } from "../../utils/safeWriteJson"
import { TelemetryService } from "@roo-code/telemetry"
import { TelemetryEventName } from "@roo-code/types"
import * as path from "path"
import * as os from "os"

/**
 * Manages the cache for code indexing
 */
export class CacheManager implements ICacheManager {
	private cachePath: vscode.Uri
	private fileHashes: Record<string, string> = {}
	private _debouncedSaveCache: () => void

	/**
	 * Creates a new cache manager
	 * @param context VS Code extension context
	 * @param workspacePath Path to the workspace
	 */
	constructor(
		private context: vscode.ExtensionContext,
		private workspacePath: string,
	) {
		// Generate a stable cache key that persists across SSH sessions
		const cacheKey = this.generateStableCacheKey(workspacePath)
		this.cachePath = vscode.Uri.joinPath(context.globalStorageUri, `roo-index-cache-${cacheKey}.json`)
		this._debouncedSaveCache = debounce(async () => {
			await this._performSave()
		}, 1500)
	}

	/**
	 * Generates a stable cache key for the workspace that persists across SSH sessions
	 * @param workspacePath The workspace path
	 * @returns A stable hash key
	 */
	private generateStableCacheKey(workspacePath: string): string {
		// Get the workspace folder name
		const workspaceName = path.basename(workspacePath)

		// Try to get a relative path from home directory for additional stability
		const homedir = os.homedir()
		let relativePath = workspacePath

		try {
			// If the workspace is under the home directory, use the relative path
			if (workspacePath.startsWith(homedir)) {
				relativePath = path.relative(homedir, workspacePath)
			}
		} catch (error) {
			// If we can't get relative path, just use the full path
			console.warn("Failed to get relative path from home directory:", error)
		}

		// Normalize path separators to forward slashes for consistency across platforms
		// This ensures the same cache key is generated regardless of the OS
		const normalizedRelativePath = relativePath.replace(/\\/g, "/")

		// Create a composite key using workspace name and normalized relative path
		// This should be more stable across SSH sessions where the absolute path might change
		// but the relative structure remains the same
		const compositeKey = `${workspaceName}::${normalizedRelativePath}`

		// Generate hash from the composite key
		return createHash("sha256").update(compositeKey).digest("hex")
	}

	/**
	 * Initializes the cache manager by loading the cache file
	 */
	async initialize(): Promise<void> {
		try {
			const cacheData = await vscode.workspace.fs.readFile(this.cachePath)
			this.fileHashes = JSON.parse(cacheData.toString())
		} catch (error) {
			this.fileHashes = {}
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				location: "initialize",
			})
		}
	}

	/**
	 * Saves the cache to disk
	 */
	private async _performSave(): Promise<void> {
		try {
			await safeWriteJson(this.cachePath.fsPath, this.fileHashes)
		} catch (error) {
			console.error("Failed to save cache:", error)
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				location: "_performSave",
			})
		}
	}

	/**
	 * Clears the cache file by writing an empty object to it
	 */
	async clearCacheFile(): Promise<void> {
		try {
			await safeWriteJson(this.cachePath.fsPath, {})
			this.fileHashes = {}
		} catch (error) {
			console.error("Failed to clear cache file:", error, this.cachePath)
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				location: "clearCacheFile",
			})
		}
	}

	/**
	 * Gets the hash for a file path
	 * @param filePath Path to the file
	 * @returns The hash for the file or undefined if not found
	 */
	getHash(filePath: string): string | undefined {
		return this.fileHashes[filePath]
	}

	/**
	 * Updates the hash for a file path
	 * @param filePath Path to the file
	 * @param hash New hash value
	 */
	updateHash(filePath: string, hash: string): void {
		this.fileHashes[filePath] = hash
		this._debouncedSaveCache()
	}

	/**
	 * Deletes the hash for a file path
	 * @param filePath Path to the file
	 */
	deleteHash(filePath: string): void {
		delete this.fileHashes[filePath]
		this._debouncedSaveCache()
	}

	/**
	 * Gets a copy of all file hashes
	 * @returns A copy of the file hashes record
	 */
	getAllHashes(): Record<string, string> {
		return { ...this.fileHashes }
	}
}
