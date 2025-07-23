import { describe, it, expect } from "vitest"
import { parseCommandString, extractPatternsFromCommand, detectCommandSecurityIssues } from "../command-parser"

describe("parseCommandString", () => {
	it("should parse simple command", () => {
		const result = parseCommandString("ls -la")
		expect(result.subCommands).toEqual(["ls -la"])
		expect(result.hasSubshells).toBe(false)
		expect(result.subshellCommands).toEqual([])
	})

	it("should parse command with && operator", () => {
		const result = parseCommandString("npm install && npm test")
		expect(result.subCommands).toEqual(["npm install", "npm test"])
		expect(result.hasSubshells).toBe(false)
	})

	it("should parse command with || operator", () => {
		const result = parseCommandString("npm test || npm run test:ci")
		expect(result.subCommands).toEqual(["npm test", "npm run test:ci"])
		expect(result.hasSubshells).toBe(false)
	})

	it("should parse command with pipe", () => {
		const result = parseCommandString("ls -la | grep test")
		expect(result.subCommands).toEqual(["ls -la", "grep test"])
		expect(result.hasSubshells).toBe(false)
	})

	it("should detect and extract subshells with $()", () => {
		const result = parseCommandString("echo $(date)")
		expect(result.subCommands).toEqual(["echo", "date"])
		expect(result.hasSubshells).toBe(true)
		expect(result.subshellCommands).toEqual(["date"])
	})

	it("should detect and extract subshells with backticks", () => {
		const result = parseCommandString("echo `whoami`")
		expect(result.subCommands).toEqual(["echo", "whoami"])
		expect(result.hasSubshells).toBe(true)
		expect(result.subshellCommands).toEqual(["whoami"])
	})

	it("should handle PowerShell redirections", () => {
		const result = parseCommandString("command 2>&1")
		expect(result.subCommands).toEqual(["command 2>&1"])
		expect(result.hasSubshells).toBe(false)
	})

	it("should handle quoted strings", () => {
		const result = parseCommandString('echo "hello world"')
		expect(result.subCommands).toEqual(['echo "hello world"'])
		expect(result.hasSubshells).toBe(false)
	})

	it("should handle array indexing expressions", () => {
		const result = parseCommandString("echo ${array[0]}")
		expect(result.subCommands).toEqual(["echo ${array[0]}"])
		expect(result.hasSubshells).toBe(false)
	})

	it("should handle empty command", () => {
		const result = parseCommandString("")
		expect(result.subCommands).toEqual([])
		expect(result.hasSubshells).toBe(false)
		expect(result.subshellCommands).toEqual([])
	})

	it("should handle complex command with multiple operators", () => {
		const result = parseCommandString("npm install && npm test | grep success || echo 'failed'")
		expect(result.subCommands).toEqual(["npm install", "npm test", "grep success", "echo failed"])
		expect(result.hasSubshells).toBe(false)
	})
})

describe("extractPatternsFromCommand", () => {
	it("should extract simple command pattern", () => {
		const patterns = extractPatternsFromCommand("ls")
		expect(patterns).toEqual(["ls"])
	})

	it("should extract command with arguments", () => {
		const patterns = extractPatternsFromCommand("npm install express")
		expect(patterns).toEqual(["npm", "npm install", "npm install express"])
	})

	it("should stop at flags", () => {
		const patterns = extractPatternsFromCommand("git commit -m 'test'")
		expect(patterns).toEqual(["git", "git commit"])
	})

	it("should stop at paths", () => {
		const patterns = extractPatternsFromCommand("cd /usr/local/bin")
		expect(patterns).toEqual(["cd"])
	})

	it("should handle piped commands", () => {
		const patterns = extractPatternsFromCommand("ls -la | grep test")
		expect(patterns).toContain("ls")
		expect(patterns).toContain("grep")
		expect(patterns).toContain("grep test")
	})

	it("should remove subshells before extracting patterns", () => {
		const patterns = extractPatternsFromCommand("echo $(malicious)")
		expect(patterns).toEqual(["echo"])
		expect(patterns).not.toContain("malicious")
	})

	it("should skip numeric commands", () => {
		const patterns = extractPatternsFromCommand("0 total")
		expect(patterns).toEqual([])
	})

	it("should skip common output words", () => {
		const patterns = extractPatternsFromCommand("error")
		expect(patterns).toEqual([])
	})

	it("should handle empty command", () => {
		const patterns = extractPatternsFromCommand("")
		expect(patterns).toEqual([])
	})

	it("should return sorted patterns", () => {
		const patterns = extractPatternsFromCommand("npm run build")
		expect(patterns).toEqual(["npm", "npm run", "npm run build"])
	})
})

describe("detectCommandSecurityIssues", () => {
	it("should detect subshell with $()", () => {
		const warnings = detectCommandSecurityIssues("echo $(malicious)")
		expect(warnings).toHaveLength(1)
		expect(warnings[0].type).toBe("subshell")
		expect(warnings[0].message).toContain("subshell execution")
	})

	it("should detect subshell with backticks", () => {
		const warnings = detectCommandSecurityIssues("echo `malicious`")
		expect(warnings).toHaveLength(1)
		expect(warnings[0].type).toBe("subshell")
		expect(warnings[0].message).toContain("subshell execution")
	})

	it("should detect multiple subshell patterns", () => {
		const warnings = detectCommandSecurityIssues("echo $(date) && echo `whoami`")
		expect(warnings).toHaveLength(1) // Still one warning for subshell presence
		expect(warnings[0].type).toBe("subshell")
	})

	it("should not detect issues in safe commands", () => {
		const warnings = detectCommandSecurityIssues("npm install express")
		expect(warnings).toHaveLength(0)
	})

	it("should handle empty command", () => {
		const warnings = detectCommandSecurityIssues("")
		expect(warnings).toHaveLength(0)
	})
})
