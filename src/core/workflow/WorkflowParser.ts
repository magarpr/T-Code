import * as yaml from "yaml"
import * as path from "path"
import * as fs from "fs/promises"

import {
	type WorkflowConfig,
	type WorkflowAgent,
	workflowConfigSchema,
	WorkflowConfigValidationError,
} from "@roo-code/types"

import { fileExistsAtPath } from "../../utils/fs"
import { logger } from "../../utils/logging"

/**
 * Parser for workflow configuration files
 */
export class WorkflowParser {
	/**
	 * Parse workflow configuration from YAML content
	 */
	public static parseYaml(yamlContent: string): WorkflowConfig {
		try {
			const parsed = yaml.parse(yamlContent)
			return this.validateConfig(parsed)
		} catch (error) {
			if (error instanceof WorkflowConfigValidationError) {
				throw error
			}
			throw new WorkflowConfigValidationError(
				`Failed to parse workflow YAML: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Load and parse workflow configuration from file
	 */
	public static async loadFromFile(filePath: string): Promise<WorkflowConfig> {
		try {
			const exists = await fileExistsAtPath(filePath)
			if (!exists) {
				throw new WorkflowConfigValidationError(`Workflow file not found: ${filePath}`)
			}

			const content = await fs.readFile(filePath, "utf-8")
			return this.parseYaml(content)
		} catch (error) {
			if (error instanceof WorkflowConfigValidationError) {
				throw error
			}
			throw new WorkflowConfigValidationError(
				`Failed to load workflow from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Validate workflow configuration against schema
	 */
	private static validateConfig(config: unknown): WorkflowConfig {
		const result = workflowConfigSchema.safeParse(config)

		if (!result.success) {
			const errors = result.error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join(", ")
			throw new WorkflowConfigValidationError(`Invalid workflow configuration: ${errors}`)
		}

		// Additional validation
		const workflow = result.data
		this.validateAgentReferences(workflow)
		this.validateStageReferences(workflow)
		this.validateTransitions(workflow)

		return workflow
	}

	/**
	 * Validate that all agent references in stages exist
	 */
	private static validateAgentReferences(config: WorkflowConfig): void {
		const agentIds = new Set(config.agents.map((agent) => agent.id))

		for (const stage of config.workflow) {
			if (!agentIds.has(stage.agent)) {
				throw new WorkflowConfigValidationError(
					`Stage '${stage.name}' references unknown agent '${stage.agent}'`,
				)
			}
		}
	}

	/**
	 * Validate that all stage references in transitions exist
	 */
	private static validateStageReferences(config: WorkflowConfig): void {
		const stageNames = new Set(config.workflow.map((stage) => stage.name))
		stageNames.add("end") // Special end marker

		for (const stage of config.workflow) {
			// Check fixed transitions
			if (stage.on_success && !stageNames.has(stage.on_success)) {
				throw new WorkflowConfigValidationError(
					`Stage '${stage.name}' has invalid on_success transition to '${stage.on_success}'`,
				)
			}

			if (stage.on_failure && !stageNames.has(stage.on_failure)) {
				throw new WorkflowConfigValidationError(
					`Stage '${stage.name}' has invalid on_failure transition to '${stage.on_failure}'`,
				)
			}

			// Check orchestration candidates
			if (stage.next_steps) {
				for (const nextStep of stage.next_steps) {
					if (!stageNames.has(nextStep)) {
						throw new WorkflowConfigValidationError(
							`Stage '${stage.name}' has invalid next_step reference to '${nextStep}'`,
						)
					}
				}
			}
		}
	}

	/**
	 * Validate transition logic
	 */
	private static validateTransitions(config: WorkflowConfig): void {
		for (const stage of config.workflow) {
			// Ensure stage has either fixed transition or orchestration strategy
			if (stage.strategy === "orchestrate") {
				if (!stage.next_steps || stage.next_steps.length === 0) {
					throw new WorkflowConfigValidationError(
						`Stage '${stage.name}' with orchestrate strategy must have next_steps defined`,
					)
				}
				if (stage.on_success) {
					throw new WorkflowConfigValidationError(
						`Stage '${stage.name}' cannot have both orchestrate strategy and on_success transition`,
					)
				}
			} else {
				// Default is fixed strategy
				if (!stage.on_success && !stage.on_failure) {
					throw new WorkflowConfigValidationError(
						`Stage '${stage.name}' with fixed strategy must have at least on_success or on_failure defined`,
					)
				}
				if (stage.next_steps) {
					throw new WorkflowConfigValidationError(
						`Stage '${stage.name}' with fixed strategy cannot have next_steps defined`,
					)
				}
			}
		}
	}

	/**
	 * Convert workflow config to YAML string
	 */
	public static toYaml(config: WorkflowConfig): string {
		return yaml.stringify(config, {
			lineWidth: 0,
			defaultStringType: "PLAIN",
			defaultKeyType: "PLAIN",
		})
	}

	/**
	 * Save workflow configuration to file
	 */
	public static async saveToFile(config: WorkflowConfig, filePath: string): Promise<void> {
		try {
			const yamlContent = this.toYaml(config)
			await fs.writeFile(filePath, yamlContent, "utf-8")
			logger.info(`Workflow configuration saved to ${filePath}`)
		} catch (error) {
			throw new WorkflowConfigValidationError(
				`Failed to save workflow to ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Create a sample workflow configuration
	 */
	public static createSampleWorkflow(): WorkflowConfig {
		return {
			name: "Web App Development Workflow",
			description: "A sample workflow for developing a web application",
			version: "1.0.0",
			agents: [
				{
					id: "project_manager",
					mode: "architect",
					description: "Analyzes requirements and creates project plan",
				},
				{
					id: "dev_team_lead",
					mode: "orchestrator",
					description: "Coordinates development tasks",
				},
				{
					id: "frontend_dev",
					mode: "code",
					description: "Implements frontend features",
				},
				{
					id: "backend_dev",
					mode: "code",
					description: "Implements backend features",
				},
				{
					id: "code_reviewer",
					mode: "pr-reviewer",
					description: "Reviews code quality and standards",
				},
				{
					id: "tester",
					mode: "test",
					description: "Writes and runs tests",
				},
			],
			workflow: [
				{
					name: "requirement_analysis",
					agent: "project_manager",
					description: "Analyze requirements and create project plan",
					on_success: "development_planning",
					strategy: "fixed",
				},
				{
					name: "development_planning",
					agent: "dev_team_lead",
					description: "Plan development tasks and assign to team",
					next_steps: ["frontend_development", "backend_development"],
					strategy: "orchestrate",
				},
				{
					name: "frontend_development",
					agent: "frontend_dev",
					description: "Implement frontend features",
					on_success: "frontend_review",
					retry_count: 2,
				},
				{
					name: "backend_development",
					agent: "backend_dev",
					description: "Implement backend features",
					on_success: "backend_review",
					retry_count: 2,
					parallel: true,
				},
				{
					name: "frontend_review",
					agent: "code_reviewer",
					description: "Review frontend code",
					on_success: "frontend_testing",
					on_failure: "frontend_development",
				},
				{
					name: "backend_review",
					agent: "code_reviewer",
					description: "Review backend code",
					on_success: "backend_testing",
					on_failure: "backend_development",
				},
				{
					name: "frontend_testing",
					agent: "tester",
					description: "Test frontend functionality",
					on_success: "integration_planning",
					on_failure: "frontend_development",
				},
				{
					name: "backend_testing",
					agent: "tester",
					description: "Test backend functionality",
					on_success: "integration_planning",
					on_failure: "backend_development",
				},
				{
					name: "integration_planning",
					agent: "dev_team_lead",
					description: "Plan integration and deployment",
					on_success: "end",
				},
			],
			max_parallel_stages: 2,
			default_timeout: 3600,
			enable_checkpoints: true,
		}
	}
}
