import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type HuggingFaceProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const HuggingFace = ({ apiConfiguration, setApiConfigurationField }: HuggingFaceProps) => {
	const { t } = useAppTranslation()

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	return (
		<>
			<VSCodeTextField
				value={apiConfiguration?.huggingFaceApiKey || ""}
				type="password"
				onInput={handleInputChange("huggingFaceApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.huggingFaceApiKey")}</label>
			</VSCodeTextField>
			<VSCodeTextField
				value={apiConfiguration?.huggingFaceModelId || ""}
				onInput={handleInputChange("huggingFaceModelId")}
				placeholder="meta-llama/Llama-3.3-70B-Instruct"
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.huggingFaceModelId")}</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>
			{!apiConfiguration?.huggingFaceApiKey && (
				<VSCodeButtonLink href="https://huggingface.co/settings/tokens" appearance="secondary">
					{t("settings:providers.getHuggingFaceApiKey")}
				</VSCodeButtonLink>
			)}
		</>
	)
}
