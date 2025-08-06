import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import { type ProviderSettings, tarsDefaultModelId } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"

import { inputEventTransform } from "../transforms"

type TarsProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const Tars = ({ apiConfiguration, setApiConfigurationField }: TarsProps) => {
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
				value={apiConfiguration?.tarsApiKey || ""}
				type="password"
				onInput={handleInputChange("tarsApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<div className="flex justify-between items-center mb-1">
					<label className="block font-medium">{t("settings:providers.tarsApiKey")}</label>
				</div>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>
			<div className="text-sm text-vscode-descriptionForeground">{t("settings:providers.tarsDescription")}</div>
			<VSCodeTextField
				value={apiConfiguration?.tarsModelId || tarsDefaultModelId}
				onInput={handleInputChange("tarsModelId")}
				placeholder={tarsDefaultModelId}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.model")}</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground">
				{t("settings:providers.tarsModelDescription")}
			</div>
		</>
	)
}
