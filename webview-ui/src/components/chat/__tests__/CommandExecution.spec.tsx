import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { CommandExecution } from "../CommandExecution"
import { ExtensionStateContext } from "../../../context/ExtensionStateContext"

// Mock dependencies
vi.mock("react-use", () => ({
	useEvent: vi.fn(),
}))

import { vscode } from "../../../utils/vscode"

vi.mock("../../../utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("../../common/CodeBlock", () => ({
	default: ({ source }: { source: string }) => <div data-testid="code-block">{source}</div>,
}))

vi.mock("../CommandPatternSelector", () => ({
	CommandPatternSelector: ({ patterns, onAllowPatternChange, onDenyPatternChange }: any) => (
		<div data-testid="command-pattern-selector">
			{patterns.map((p: any, i: number) => (
				<div key={i}>
					<span>{p.pattern}</span>
					<button onClick={() => onAllowPatternChange(p.pattern)}>Allow {p.pattern}</button>
					<button onClick={() => onDenyPatternChange(p.pattern)}>Deny {p.pattern}</button>
				</div>
			))}
		</div>
	),
}))

// Mock ExtensionStateContext
const mockExtensionState = {
	terminalShellIntegrationDisabled: false,
	allowedCommands: ["npm"],
	deniedCommands: ["rm"],
	setAllowedCommands: vi.fn(),
	setDeniedCommands: vi.fn(),
}

const ExtensionStateWrapper = ({ children }: { children: React.ReactNode }) => (
	<ExtensionStateContext.Provider value={mockExtensionState as any}>{children}</ExtensionStateContext.Provider>
)

describe("CommandExecution", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should render command without output", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="npm install" />
			</ExtensionStateWrapper>,
		)

		expect(screen.getByTestId("code-block")).toHaveTextContent("npm install")
	})

	it("should render command with output", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="npm install\n\nCommand Output:\nInstalling packages..." />
			</ExtensionStateWrapper>,
		)

		const codeBlocks = screen.getAllByTestId("code-block")
		expect(codeBlocks[0]).toHaveTextContent("npm install")
	})

	it("should render with custom icon and title", () => {
		const icon = <span data-testid="custom-icon">📦</span>
		const title = <span data-testid="custom-title">Installing Dependencies</span>

		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="npm install" icon={icon} title={title} />
			</ExtensionStateWrapper>,
		)

		expect(screen.getByTestId("custom-icon")).toBeInTheDocument()
		expect(screen.getByTestId("custom-title")).toBeInTheDocument()
	})

	it("should show command pattern selector for simple commands", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="npm install express" />
			</ExtensionStateWrapper>,
		)

		expect(screen.getByTestId("command-pattern-selector")).toBeInTheDocument()
		expect(screen.getByText("npm")).toBeInTheDocument()
		expect(screen.getByText("npm install")).toBeInTheDocument()
	})

	it("should handle allow pattern change", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="git push" />
			</ExtensionStateWrapper>,
		)

		const allowButton = screen.getByText("Allow git")
		fireEvent.click(allowButton)

		expect(mockExtensionState.setAllowedCommands).toHaveBeenCalledWith(["npm", "git"])
		expect(mockExtensionState.setDeniedCommands).toHaveBeenCalledWith(["rm"])
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "allowedCommands", commands: ["npm", "git"] })
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "deniedCommands", commands: ["rm"] })
	})

	it("should handle deny pattern change", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="docker run" />
			</ExtensionStateWrapper>,
		)

		const denyButton = screen.getByText("Deny docker")
		fireEvent.click(denyButton)

		expect(mockExtensionState.setAllowedCommands).toHaveBeenCalledWith(["npm"])
		expect(mockExtensionState.setDeniedCommands).toHaveBeenCalledWith(["rm", "docker"])
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "allowedCommands", commands: ["npm"] })
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "deniedCommands", commands: ["rm", "docker"] })
	})

	it("should toggle allowed pattern", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="npm test" />
			</ExtensionStateWrapper>,
		)

		const allowButton = screen.getByText("Allow npm")
		fireEvent.click(allowButton)

		// npm is already in allowedCommands, so it should be removed
		expect(mockExtensionState.setAllowedCommands).toHaveBeenCalledWith([])
		expect(mockExtensionState.setDeniedCommands).toHaveBeenCalledWith(["rm"])
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "allowedCommands", commands: [] })
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "deniedCommands", commands: ["rm"] })
	})

	it("should toggle denied pattern", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="rm -rf" />
			</ExtensionStateWrapper>,
		)

		const denyButton = screen.getByText("Deny rm")
		fireEvent.click(denyButton)

		// rm is already in deniedCommands, so it should be removed
		expect(mockExtensionState.setAllowedCommands).toHaveBeenCalledWith(["npm"])
		expect(mockExtensionState.setDeniedCommands).toHaveBeenCalledWith([])
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "allowedCommands", commands: ["npm"] })
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "deniedCommands", commands: [] })
	})

	it("should parse command with $ prefix", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="$ npm install\nInstalling..." />
			</ExtensionStateWrapper>,
		)

		expect(screen.getByTestId("code-block")).toHaveTextContent("npm install")
	})

	it("should parse command with AI suggestions", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution
					executionId="test-1"
					text="$ npm install\nSuggested patterns: npm, npm install, npm run"
				/>
			</ExtensionStateWrapper>,
		)

		expect(screen.getByTestId("command-pattern-selector")).toBeInTheDocument()
		// Check that the patterns are present in the mock
		expect(screen.getByText("npm")).toBeInTheDocument()
	})

	it("should handle commands with pipes", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="ls -la | grep test" />
			</ExtensionStateWrapper>,
		)

		expect(screen.getByTestId("command-pattern-selector")).toBeInTheDocument()
		expect(screen.getByText("ls")).toBeInTheDocument()
		expect(screen.getByText("grep")).toBeInTheDocument()
	})

	it("should handle commands with && operator", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="npm install && npm test" />
			</ExtensionStateWrapper>,
		)

		expect(screen.getByTestId("command-pattern-selector")).toBeInTheDocument()
		expect(screen.getByText("npm")).toBeInTheDocument()
		expect(screen.getByText("npm install")).toBeInTheDocument()
		expect(screen.getByText("npm test")).toBeInTheDocument()
	})

	it("should not show pattern selector for empty commands", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="" />
			</ExtensionStateWrapper>,
		)

		expect(screen.queryByTestId("command-pattern-selector")).not.toBeInTheDocument()
	})

	it("should expand output when terminal shell integration is disabled", () => {
		const disabledState = {
			...mockExtensionState,
			terminalShellIntegrationDisabled: true,
		}

		render(
			<ExtensionStateContext.Provider value={disabledState as any}>
				<CommandExecution executionId="test-1" text="npm install\n\nCommand Output:\nOutput here" />
			</ExtensionStateContext.Provider>,
		)

		// Output should be visible when shell integration is disabled
		expect(screen.getByText(/Output here/)).toBeInTheDocument()
	})

	it("should handle undefined allowedCommands and deniedCommands", () => {
		const stateWithUndefined = {
			...mockExtensionState,
			allowedCommands: undefined,
			deniedCommands: undefined,
		}

		render(
			<ExtensionStateContext.Provider value={stateWithUndefined as any}>
				<CommandExecution executionId="test-1" text="npm install" />
			</ExtensionStateContext.Provider>,
		)

		expect(screen.getByTestId("command-pattern-selector")).toBeInTheDocument()
	})

	it("should handle pattern change when moving from denied to allowed", () => {
		render(
			<ExtensionStateWrapper>
				<CommandExecution executionId="test-1" text="rm file.txt" />
			</ExtensionStateWrapper>,
		)

		const allowButton = screen.getByText("Allow rm")
		fireEvent.click(allowButton)

		// rm should be removed from denied and added to allowed
		expect(mockExtensionState.setAllowedCommands).toHaveBeenCalledWith(["npm", "rm"])
		expect(mockExtensionState.setDeniedCommands).toHaveBeenCalledWith([])
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "allowedCommands", commands: ["npm", "rm"] })
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "deniedCommands", commands: [] })
	})
})
