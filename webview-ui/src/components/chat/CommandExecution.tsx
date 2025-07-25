import { useCallback, useState, memo, useMemo } from "react"
import { useEvent } from "react-use"
import { ChevronDown, Skull } from "lucide-react"

import { CommandExecutionStatus, commandExecutionStatusSchema } from "@roo-code/types"

import { ExtensionMessage } from "@roo/ExtensionMessage"
import { safeJsonParse } from "@roo/safeJsonParse"

import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { cn } from "@src/lib/utils"
import { Button } from "@src/components/ui"
import CodeBlock from "../common/CodeBlock"
import { CommandPatternSelector } from "./CommandPatternSelector"

interface CommandExecutionProps {
	executionId: string
	text?: string
	icon?: JSX.Element | null
	title?: JSX.Element | null
}

export const CommandExecution = ({ executionId, text, icon, title }: CommandExecutionProps) => {
	const {
		terminalShellIntegrationDisabled = false,
		allowedCommands = [],
		deniedCommands = [],
		setAllowedCommands,
		setDeniedCommands,
	} = useExtensionState()

	const { command, output: parsedOutput } = useMemo(() => {
		// Parse command and output using the "Output:" separator
		const outputSeparator = "Output:"
		const outputIndex = text?.indexOf(`\n${outputSeparator}`) ?? -1

		if (outputIndex !== -1) {
			// Text is split into command and output
			const cmd = (text ?? "").slice(0, outputIndex).trim()
			// Skip the newline and "Output:" text
			const afterSeparator = outputIndex + 1 + outputSeparator.length
			let startOfOutput = afterSeparator
			if (text![afterSeparator] === "\n") {
				startOfOutput = afterSeparator + 1
			}
			const out = text!.slice(startOfOutput).trim()
			return { command: cmd, output: out }
		} else if (text?.indexOf(outputSeparator) === 0) {
			// Edge case: text starts with "Output:" (no command)
			return { command: "", output: text.slice(outputSeparator.length).trim() }
		} else {
			// No output separator found, the entire text is the command
			return { command: text?.trim() || "", output: "" }
		}
	}, [text])

	// If we aren't opening the VSCode terminal for this command then we default
	// to expanding the command execution output.
	const [isExpanded, setIsExpanded] = useState(terminalShellIntegrationDisabled)
	const [streamingOutput, setStreamingOutput] = useState("")
	const [status, setStatus] = useState<CommandExecutionStatus | null>(null)

	// The command's output can either come from the text associated with the
	// task message (this is the case for completed commands) or from the
	// streaming output (this is the case for running commands).
	const output = streamingOutput || parsedOutput

	// Handle command changes
	const handleAllowCommandChange = (cmd: string) => {
		const isAllowed = allowedCommands.includes(cmd)
		const newAllowed = isAllowed ? allowedCommands.filter((c) => c !== cmd) : [...allowedCommands, cmd]
		const newDenied = deniedCommands.filter((c) => c !== cmd)

		setAllowedCommands(newAllowed)
		setDeniedCommands(newDenied)
		vscode.postMessage({ type: "allowedCommands", commands: newAllowed })
		vscode.postMessage({ type: "deniedCommands", commands: newDenied })
	}

	const handleDenyCommandChange = (cmd: string) => {
		const isDenied = deniedCommands.includes(cmd)
		const newDenied = isDenied ? deniedCommands.filter((c) => c !== cmd) : [...deniedCommands, cmd]
		const newAllowed = allowedCommands.filter((c) => c !== cmd)

		setAllowedCommands(newAllowed)
		setDeniedCommands(newDenied)
		vscode.postMessage({ type: "allowedCommands", commands: newAllowed })
		vscode.postMessage({ type: "deniedCommands", commands: newDenied })
	}

	const onMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type === "commandExecutionStatus") {
				const result = commandExecutionStatusSchema.safeParse(safeJsonParse(message.text, {}))

				if (result.success) {
					const data = result.data

					if (data.executionId !== executionId) {
						return
					}

					switch (data.status) {
						case "started":
							setStatus(data)
							break
						case "output":
							setStreamingOutput(data.output)
							break
						case "fallback":
							setIsExpanded(true)
							break
						default:
							setStatus(data)
							break
					}
				}
			}
		},
		[executionId],
	)

	useEvent("message", onMessage)

	return (
		<>
			<div className="flex flex-row items-center justify-between gap-2 mb-1">
				<div className="flex flex-row items-center gap-1">
					{icon}
					{title}
				</div>
				<div className="flex flex-row items-center justify-between gap-2 px-1">
					<div className="flex flex-row items-center gap-1">
						{status?.status === "started" && (
							<div className="flex flex-row items-center gap-2 font-mono text-xs">
								<div className="rounded-full size-1.5 bg-lime-400" />
								<div>Running</div>
								{status.pid && <div className="whitespace-nowrap">(PID: {status.pid})</div>}
								<Button
									variant="ghost"
									size="icon"
									onClick={() =>
										vscode.postMessage({ type: "terminalOperation", terminalOperation: "abort" })
									}>
									<Skull />
								</Button>
							</div>
						)}
						{status?.status === "exited" && (
							<div className="flex flex-row items-center gap-2 font-mono text-xs">
								<div
									className={cn(
										"rounded-full size-1.5",
										status.exitCode === 0 ? "bg-lime-400" : "bg-red-400",
									)}
								/>
								<div className="whitespace-nowrap">Exited ({status.exitCode})</div>
							</div>
						)}
						{output.length > 0 && (
							<Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)}>
								<ChevronDown
									className={cn("size-4 transition-transform duration-300", {
										"rotate-180": isExpanded,
									})}
								/>
							</Button>
						)}
					</div>
				</div>
			</div>

			<div className="w-full bg-vscode-editor-background border border-vscode-border rounded-xs">
				<div className="p-2">
					<CodeBlock source={command} language="shell" />
					<OutputContainer isExpanded={isExpanded} output={output} />
				</div>
				{command && (
					<CommandPatternSelector
						command={command}
						allowedCommands={allowedCommands}
						deniedCommands={deniedCommands}
						onAllowCommandChange={handleAllowCommandChange}
						onDenyCommandChange={handleDenyCommandChange}
					/>
				)}
			</div>
		</>
	)
}

CommandExecution.displayName = "CommandExecution"

const OutputContainerInternal = ({ isExpanded, output }: { isExpanded: boolean; output: string }) => (
	<div
		className={cn("overflow-hidden", {
			"max-h-0": !isExpanded,
			"max-h-[100%] mt-1 pt-1 border-t border-border/25": isExpanded,
		})}>
		{output.length > 0 && <CodeBlock source={output} language="log" />}
	</div>
)

const OutputContainer = memo(OutputContainerInternal)
