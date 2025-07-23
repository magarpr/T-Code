import React, { useState, useRef, useCallback } from "react"
import { ChevronUp, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRooPortal } from "@/components/ui/hooks/useRooPortal"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
	StandardTooltip,
	Command,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandItem,
	CommandGroup,
} from "@/components/ui"
import { IconButton } from "./IconButton"
import { vscode } from "@/utils/vscode"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { Mode, getAllModes } from "@roo/modes"
import { ModeConfig, CustomModePrompts } from "@roo-code/types"
import { telemetryClient } from "@/utils/TelemetryClient"
import { TelemetryEventName } from "@roo-code/types"

interface ModeSelectorProps {
	value: Mode
	onChange: (value: Mode) => void
	disabled?: boolean
	title?: string
	triggerClassName?: string
	modeShortcutText: string
	customModes?: ModeConfig[]
	customModePrompts?: CustomModePrompts
}

export const ModeSelector = ({
	value,
	onChange,
	disabled = false,
	title = "",
	triggerClassName = "",
	modeShortcutText,
	customModes,
	customModePrompts,
}: ModeSelectorProps) => {
	const [open, setOpen] = useState(false)
	const [searchValue, setSearchValue] = useState("")
	const searchInputRef = useRef<HTMLInputElement>(null)
	const portalContainer = useRooPortal("roo-portal")
	const { hasOpenedModeSelector, setHasOpenedModeSelector } = useExtensionState()
	const { t } = useAppTranslation()

	const trackModeSelectorOpened = () => {
		// Track telemetry every time the mode selector is opened
		telemetryClient.capture(TelemetryEventName.MODE_SELECTOR_OPENED)

		// Track first-time usage for UI purposes
		if (!hasOpenedModeSelector) {
			setHasOpenedModeSelector(true)
			vscode.postMessage({ type: "hasOpenedModeSelector", bool: true })
		}
	}

	// Get all modes including custom modes and merge custom prompt descriptions
	const modes = React.useMemo(() => {
		const allModes = getAllModes(customModes)
		return allModes.map((mode) => ({
			...mode,
			description: customModePrompts?.[mode.slug]?.description ?? mode.description,
		}))
	}, [customModes, customModePrompts])

	// Find the selected mode
	const selectedMode = React.useMemo(() => modes.find((mode) => mode.slug === value), [modes, value])

	// Filter modes based on search
	const filteredModes = React.useMemo(() => {
		if (!searchValue) return modes
		const searchLower = searchValue.toLowerCase()
		return modes.filter(
			(mode) => mode.name.toLowerCase().includes(searchLower) || mode.slug.toLowerCase().includes(searchLower),
		)
	}, [modes, searchValue])

	// Handler for clearing search input
	const onClearSearch = useCallback(() => {
		setSearchValue("")
		searchInputRef.current?.focus()
	}, [])

	// Handler for mode selection
	const handleModeSelect = useCallback(
		(modeSlug: string) => {
			onChange(modeSlug as Mode)
			setOpen(false)
			// Clear search after selection
			setTimeout(() => setSearchValue(""), 100)
		},
		[onChange],
	)

	const trigger = (
		<PopoverTrigger
			disabled={disabled}
			data-testid="mode-selector-trigger"
			className={cn(
				"inline-flex items-center gap-1.5 relative whitespace-nowrap px-1.5 py-1 text-xs",
				"bg-transparent border border-[rgba(255,255,255,0.08)] rounded-md text-vscode-foreground",
				"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder focus-visible:ring-inset",
				disabled
					? "opacity-50 cursor-not-allowed"
					: "opacity-90 hover:opacity-100 hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer",
				triggerClassName,
				!disabled && !hasOpenedModeSelector
					? "bg-primary opacity-90 hover:bg-primary-hover text-vscode-button-foreground"
					: null,
			)}>
			<ChevronUp className="pointer-events-none opacity-80 flex-shrink-0 size-3" />
			<span className="truncate">{selectedMode?.name || ""}</span>
		</PopoverTrigger>
	)

	return (
		<Popover
			open={open}
			onOpenChange={(isOpen) => {
				if (isOpen) trackModeSelectorOpened()
				setOpen(isOpen)
				// Clear search when closing
				if (!isOpen) {
					setTimeout(() => setSearchValue(""), 100)
				}
			}}
			data-testid="mode-selector-root">
			{title ? <StandardTooltip content={title}>{trigger}</StandardTooltip> : trigger}

			<PopoverContent
				align="start"
				sideOffset={4}
				container={portalContainer}
				className="p-0 overflow-hidden min-w-80 max-w-9/10">
				<Command className="flex flex-col h-full">
					{/* Header with title and info icon */}
					<div className="p-3 border-b border-vscode-dropdown-border">
						<div className="flex items-center justify-between mb-2">
							<h4 className="m-0">{t("chat:modeSelector.title")}</h4>
							<StandardTooltip
								content={
									<div>
										{t("chat:modeSelector.description")}
										<br />
										{modeShortcutText}
									</div>
								}
								side="left"
								maxWidth={300}>
								<span className="codicon codicon-info text-vscode-descriptionForeground cursor-help" />
							</StandardTooltip>
						</div>

						{/* Search input */}
						<div className="relative">
							<CommandInput
								ref={searchInputRef}
								value={searchValue}
								onValueChange={setSearchValue}
								placeholder={t("chat:modeSelector.searchPlaceholder")}
								className="h-9 pr-8"
								data-testid="mode-search-input"
							/>
							{searchValue.length > 0 && (
								<div className="absolute right-2 top-0 bottom-0 flex items-center justify-center">
									<X
										className="text-vscode-input-foreground opacity-50 hover:opacity-100 size-4 p-0.5 cursor-pointer"
										onClick={onClearSearch}
									/>
								</div>
							)}
						</div>
					</div>

					{/* Mode List */}
					<CommandList className="flex-1 overflow-y-auto">
						<CommandEmpty>
							{searchValue && (
								<div className="py-4 px-3 text-sm text-vscode-descriptionForeground text-center">
									{t("chat:modeSelector.noMatchFound")}
								</div>
							)}
						</CommandEmpty>
						<CommandGroup>
							{filteredModes.map((mode) => (
								<CommandItem
									key={mode.slug}
									value={mode.slug}
									onSelect={() => handleModeSelect(mode.slug)}
									className={cn(
										"p-2 cursor-pointer",
										mode.slug === value && "bg-vscode-list-activeSelectionBackground",
									)}
									data-testid="mode-selector-item">
									<div className="flex items-center gap-4 w-full">
										<div className="flex-grow min-w-0">
											<p className="m-0 font-bold">{mode.name}</p>
											{mode.description && (
												<p className="m-0 mt-0.5 text-xs text-vscode-descriptionForeground truncate">
													{mode.description}
												</p>
											)}
										</div>
										{mode.slug === value ? (
											<Check className="size-4 flex-shrink-0" />
										) : (
											<div className="size-4 flex-shrink-0" />
										)}
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>

					{/* Footer with marketplace and settings buttons */}
					<div className="p-3 border-t border-vscode-dropdown-border flex justify-end gap-2">
						<IconButton
							iconClass="codicon-extensions"
							title={t("chat:modeSelector.marketplace")}
							onClick={() => {
								window.postMessage(
									{
										type: "action",
										action: "marketplaceButtonClicked",
										values: { marketplaceTab: "mode" },
									},
									"*",
								)
								setOpen(false)
							}}
						/>
						<IconButton
							iconClass="codicon-settings-gear"
							title={t("chat:modeSelector.settings")}
							onClick={() => {
								vscode.postMessage({
									type: "switchTab",
									tab: "modes",
								})
								setOpen(false)
							}}
						/>
					</div>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

export default ModeSelector
