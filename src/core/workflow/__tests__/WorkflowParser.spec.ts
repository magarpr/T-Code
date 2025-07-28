import { describe, it, expect, beforeEach, vi } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"

import { WorkflowParser } from "../WorkflowParser"
import { WorkflowConfigValidationError } from "@roo-code/types"

vi.mock("fs/promises")
vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockResolvedValue(true),
}))

describe("WorkflowParser", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("parseYaml", () => {
		it("should parse valid workflow YAML", () => {
			const yamlContent = `
name: Test Workflow
description: A test workflow
agents:
  - id: agent1
    mode: code
workflow:
  - name: stage1
    agent: agent1
    on_success: end
`
			const result = WorkflowParser.parseYaml(yamlContent)
			expect(result.name).toBe("Test Workflow")
			expect(result.agents).toHaveLength(1)
			expect(result.workflow).toHaveLength(1)
		})

		it("should throw error for invalid YAML", () => {
			const invalidYaml = `
name: Test
agents: [
  invalid yaml
`
			expect(() => WorkflowParser.parseYaml(invalidYaml)).toThrow(WorkflowConfigValidationError)
		})

		it("should validate agent references", () => {
			const yamlContent = `
name: Test Workflow
agents:
  - id: agent1
    mode: code
workflow:
  - name: stage1
    agent: nonexistent_agent
    on_success: end
`
			expect(() => WorkflowParser.parseYaml(yamlContent)).toThrow(
				"Stage 'stage1' references unknown agent 'nonexistent_agent'",
			)
		})

		it("should validate stage references", () => {
			const yamlContent = `
name: Test Workflow
agents:
  - id: agent1
    mode: code
workflow:
  - name: stage1
    agent: agent1
    on_success: nonexistent_stage
`
			expect(() => WorkflowParser.parseYaml(yamlContent)).toThrow(
				"Stage 'stage1' has invalid on_success transition to 'nonexistent_stage'",
			)
		})

		it("should validate orchestrate strategy", () => {
			const yamlContent = `
name: Test Workflow
agents:
  - id: agent1
    mode: orchestrator
workflow:
  - name: stage1
    agent: agent1
    strategy: orchestrate
`
			expect(() => WorkflowParser.parseYaml(yamlContent)).toThrow(
				"Stage 'stage1' with orchestrate strategy must have next_steps defined",
			)
		})

		it("should validate fixed strategy", () => {
			const yamlContent = `
name: Test Workflow
agents:
  - id: agent1
    mode: code
workflow:
  - name: stage1
    agent: agent1
    next_steps: [stage2]
`
			expect(() => WorkflowParser.parseYaml(yamlContent)).toThrow(
				"Stage 'stage1' has invalid next_step reference to 'stage2'",
			)
		})

		it("should allow 'end' as a valid transition target", () => {
			const yamlContent = `
name: Test Workflow
agents:
  - id: agent1
    mode: code
workflow:
  - name: stage1
    agent: agent1
    on_success: end
`
			const result = WorkflowParser.parseYaml(yamlContent)
			expect(result.workflow[0].on_success).toBe("end")
		})
	})

	describe("loadFromFile", () => {
		it("should load and parse workflow from file", async () => {
			const mockContent = `
name: Test Workflow
agents:
  - id: agent1
    mode: code
workflow:
  - name: stage1
    agent: agent1
    on_success: end
`
			vi.mocked(fs.readFile).mockResolvedValue(mockContent)

			const result = await WorkflowParser.loadFromFile("/test/workflow.yaml")
			expect(result.name).toBe("Test Workflow")
			expect(fs.readFile).toHaveBeenCalledWith("/test/workflow.yaml", "utf-8")
		})

		it("should throw error if file does not exist", async () => {
			const { fileExistsAtPath } = await import("../../../utils/fs")
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)

			await expect(WorkflowParser.loadFromFile("/test/missing.yaml")).rejects.toThrow(
				"Workflow file not found: /test/missing.yaml",
			)
		})
	})

	describe("toYaml", () => {
		it("should convert workflow config to YAML", () => {
			const config = {
				name: "Test Workflow",
				agents: [{ id: "agent1", mode: "code" }],
				workflow: [
					{
						name: "stage1",
						agent: "agent1",
						on_success: "end",
					},
				],
			}

			const yaml = WorkflowParser.toYaml(config)
			expect(yaml).toContain("name: Test Workflow")
			expect(yaml).toContain("id: agent1")
			expect(yaml).toContain("mode: code")
		})
	})

	describe("createSampleWorkflow", () => {
		it("should create a valid sample workflow", () => {
			const sample = WorkflowParser.createSampleWorkflow()
			expect(sample.name).toBe("Web App Development Workflow")
			expect(sample.agents.length).toBeGreaterThan(0)
			expect(sample.workflow.length).toBeGreaterThan(0)

			// Validate the sample workflow
			expect(() => WorkflowParser.parseYaml(WorkflowParser.toYaml(sample))).not.toThrow()
		})
	})

	describe("complex workflow validation", () => {
		it("should validate a complex hierarchical workflow", () => {
			const complexWorkflow = `
name: Complex Workflow
agents:
  - id: orchestrator1
    mode: orchestrator
  - id: orchestrator2
    mode: orchestrator
  - id: worker1
    mode: code
  - id: worker2
    mode: code
  - id: reviewer
    mode: pr-reviewer
workflow:
  - name: planning
    agent: orchestrator1
    strategy: orchestrate
    next_steps: [frontend_work, backend_work]
  
  - name: frontend_work
    agent: orchestrator2
    strategy: orchestrate
    next_steps: [ui_development, state_management]
    
  - name: backend_work
    agent: worker2
    on_success: backend_review
    on_failure: planning
    retry_count: 2
    
  - name: ui_development
    agent: worker1
    on_success: frontend_review
    parallel: true
    
  - name: state_management
    agent: worker1
    on_success: frontend_review
    parallel: true
    
  - name: frontend_review
    agent: reviewer
    on_success: integration
    on_failure: frontend_work
    
  - name: backend_review
    agent: reviewer
    on_success: integration
    on_failure: backend_work
    
  - name: integration
    agent: orchestrator1
    on_success: end
`
			const result = WorkflowParser.parseYaml(complexWorkflow)
			expect(result.workflow).toHaveLength(8)
			expect(result.workflow[0].strategy).toBe("orchestrate")
			expect(result.workflow[0].next_steps).toEqual(["frontend_work", "backend_work"])
		})
	})
})
