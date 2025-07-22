import React from "react"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { buildDocLink } from "@src/utils/docLinks"

interface GeminiCliProps {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: <K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => void
}

export const GeminiCli: React.FC<GeminiCliProps> = ({ apiConfiguration, setApiConfigurationField }) => {
	return (
		<>
			<div className="text-sm text-vscode-descriptionForeground">
				Use Google Gemini models through the Gemini CLI, which provides free access to Gemini Pro through Google
				Code Assist.
			</div>

			<div className="text-sm text-vscode-descriptionForeground">
				<VSCodeLink href={buildDocLink("providers/gemini-cli", "provider_docs")} target="_blank">
					View setup instructions
				</VSCodeLink>
			</div>

			<div>
				<label className="block font-medium mb-1">Project ID (Optional)</label>
				<input
					type="text"
					value={apiConfiguration.geminiCliProjectId || ""}
					onChange={(e) => setApiConfigurationField("geminiCliProjectId", e.target.value)}
					className="w-full px-3 py-1.5 bg-vscode-input text-vscode-foreground border border-vscode-inputBorder rounded focus:outline-none focus:border-vscode-focusBorder"
					placeholder="your-gcp-project-id"
				/>
				<div className="text-xs text-vscode-descriptionForeground mt-1">
					For paid Google Cloud accounts. Leave empty for free tier access.
				</div>
			</div>

			<div className="p-3 bg-vscode-editorWidget-background border border-vscode-editorWidget-border rounded">
				<h4 className="font-medium mb-2">Authentication</h4>
				<div className="text-sm text-vscode-descriptionForeground space-y-2">
					<p>
						1. Install the Gemini CLI: <code>npm install -g @google/generative-ai-cli</code>
					</p>
					<p>2. When you send your first message, a browser window will open for Google authentication</p>
					<p>3. After authenticating, your session will be saved for future use</p>
				</div>
			</div>

			<div className="p-3 bg-vscode-editorWidget-background border border-vscode-editorWidget-border rounded">
				<h4 className="font-medium mb-2">Features</h4>
				<ul className="text-sm text-vscode-descriptionForeground space-y-1 list-disc list-inside">
					<li>Free access to Gemini Pro models through Google Code Assist</li>
					<li>Automatic OAuth authentication flow</li>
					<li>Built-in telemetry for token usage tracking</li>
					<li>Support for advanced features like debug mode and IDE mode</li>
				</ul>
			</div>
		</>
	)
}
