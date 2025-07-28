import { z } from "zod"

/**
 * Custom error class for workflow configuration validation
 */
export class WorkflowConfigValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "WorkflowConfigValidationError"
	}
}

/**
 * Workflow transition strategies
 */
export const WORKFLOW_STRATEGIES = {
	FIXED: "fixed",
	ORCHESTRATE: "orchestrate",
} as const

export type WorkflowStrategy = (typeof WORKFLOW_STRATEGIES)[keyof typeof WORKFLOW_STRATEGIES]

/**
 * Workflow stage status
 */
export const WORKFLOW_STAGE_STATUS = {
	PENDING: "pending",
	IN_PROGRESS: "in_progress",
	COMPLETED: "completed",
	FAILED: "failed",
	SKIPPED: "skipped",
} as const

export type WorkflowStageStatus = (typeof WORKFLOW_STAGE_STATUS)[keyof typeof WORKFLOW_STAGE_STATUS]

/**
 * Agent definition referencing a mode
 */
export const workflowAgentSchema = z.object({
	id: z.string().min(1, "Agent ID is required"),
	mode: z.string().min(1, "Mode slug is required"),
	description: z.string().optional(),
})

export type WorkflowAgent = z.infer<typeof workflowAgentSchema>

/**
 * Workflow stage definition
 */
export const workflowStageSchema = z.object({
	name: z.string().min(1, "Stage name is required"),
	agent: z.string().min(1, "Agent ID is required"),
	description: z.string().optional(),
	// For fixed transitions
	on_success: z.string().optional(),
	on_failure: z.string().optional(),
	// For dynamic orchestration
	next_steps: z.array(z.string()).optional(),
	strategy: z.enum([WORKFLOW_STRATEGIES.FIXED, WORKFLOW_STRATEGIES.ORCHESTRATE]).optional(),
	// Additional configuration
	timeout: z.number().positive().optional(), // Timeout in seconds
	retry_count: z.number().nonnegative().optional(),
	parallel: z.boolean().optional(), // Can run in parallel with other stages
})

export type WorkflowStage = z.infer<typeof workflowStageSchema>

/**
 * Complete workflow configuration
 */
export const workflowConfigSchema = z.object({
	name: z.string().min(1, "Workflow name is required"),
	description: z.string().optional(),
	version: z.string().optional(),
	agents: z.array(workflowAgentSchema).min(1, "At least one agent is required"),
	workflow: z.array(workflowStageSchema).min(1, "At least one stage is required"),
	// Global settings
	max_parallel_stages: z.number().positive().optional(),
	default_timeout: z.number().positive().optional(),
	enable_checkpoints: z.boolean().optional(),
})

export type WorkflowConfig = z.infer<typeof workflowConfigSchema>

/**
 * Runtime state for a workflow stage
 */
export interface WorkflowStageState {
	name: string
	status: WorkflowStageStatus
	agent: string
	startedAt?: number
	completedAt?: number
	result?: string
	error?: string
	retryCount: number
}

/**
 * Runtime state for the entire workflow
 */
export interface WorkflowState {
	id: string
	name: string
	status: WorkflowStageStatus
	stages: Record<string, WorkflowStageState>
	currentStages: string[] // Currently active stages
	completedStages: string[]
	failedStages: string[]
	startedAt: number
	completedAt?: number
	parentTaskId?: string // For hierarchical workflows
	context: Record<string, unknown> // Shared context between stages
}

/**
 * Workflow execution options
 */
export interface WorkflowExecutionOptions {
	workflowId?: string // Resume existing workflow
	parentTaskId?: string // For hierarchical execution
	initialContext?: Record<string, unknown>
	checkpointInterval?: number // Auto-checkpoint every N stages
}

/**
 * Workflow execution result
 */
export interface WorkflowExecutionResult {
	workflowId: string
	status: WorkflowStageStatus
	stages: WorkflowStageState[]
	context: Record<string, unknown>
	duration: number
}

/**
 * Workflow event types for monitoring
 */
export const WORKFLOW_EVENTS = {
	WORKFLOW_STARTED: "workflow:started",
	WORKFLOW_COMPLETED: "workflow:completed",
	WORKFLOW_FAILED: "workflow:failed",
	STAGE_STARTED: "stage:started",
	STAGE_COMPLETED: "stage:completed",
	STAGE_FAILED: "stage:failed",
	STAGE_RETRYING: "stage:retrying",
	ORCHESTRATOR_DECISION: "orchestrator:decision",
} as const

export type WorkflowEventType = (typeof WORKFLOW_EVENTS)[keyof typeof WORKFLOW_EVENTS]

/**
 * Workflow event payload
 */
export interface WorkflowEvent {
	type: WorkflowEventType
	workflowId: string
	timestamp: number
	data: {
		stageName?: string
		agent?: string
		decision?: string
		error?: string
		[key: string]: unknown
	}
}
