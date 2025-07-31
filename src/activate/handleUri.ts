import * as vscode from "vscode"

import { CloudService } from "@roo-code/cloud"

import { ClineProvider } from "../core/webview/ClineProvider"

export const handleUri = async (uri: vscode.Uri) => {
	const path = uri.path
	const query = new URLSearchParams(uri.query.replace(/\+/g, "%2B"))
	const visibleProvider = ClineProvider.getVisibleInstance()

	console.log(`[URI Handler] Received URI: ${uri.toString()}`)
	console.log(`[URI Handler] Path: ${path}`)
	console.log(`[URI Handler] Query params:`, Object.fromEntries(query.entries()))

	if (!visibleProvider) {
		console.error(`[URI Handler] No visible provider found`)
		return
	}

	switch (path) {
		case "/glama": {
			const code = query.get("code")
			if (code) {
				await visibleProvider.handleGlamaCallback(code)
			}
			break
		}
		case "/openrouter": {
			const code = query.get("code")
			if (code) {
				try {
					await visibleProvider.handleOpenRouterCallback(code)
				} catch (error) {
					console.error(`[URI Handler] Failed to handle OpenRouter callback:`, error)
					// Error is already shown to user in handleOpenRouterCallback
				}
			} else {
				console.error(`[URI Handler] OpenRouter callback received without code parameter`)
				vscode.window.showErrorMessage(
					"OpenRouter authorization failed: No authorization code received. Please try again.",
				)
			}
			break
		}
		case "/requesty": {
			const code = query.get("code")
			if (code) {
				await visibleProvider.handleRequestyCallback(code)
			}
			break
		}
		case "/auth/clerk/callback": {
			const code = query.get("code")
			const state = query.get("state")
			const organizationId = query.get("organizationId")

			await CloudService.instance.handleAuthCallback(
				code,
				state,
				organizationId === "null" ? null : organizationId,
			)
			break
		}
		default:
			break
	}
}
