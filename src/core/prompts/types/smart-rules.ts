/**
 * Smart Rules types and interfaces for intelligent semantic rule injection
 */

/**
 * Represents a smart rule with context triggers and content
 */
export interface SmartRule {
	/**
	 * The filename where this rule was loaded from
	 */
	filename: string

	/**
	 * The context trigger that describes when this rule should be used
	 * This is matched against user queries to determine relevance
	 */
	useWhen: string

	/**
	 * The actual rule content (markdown)
	 */
	content: string

	/**
	 * Optional priority for rule ordering (higher = more important)
	 * Default is 0
	 */
	priority?: number

	/**
	 * Optional dependencies - other rules that should be included when this rule is selected
	 */
	dependencies?: string[]

	/**
	 * Optional metadata for future extensibility
	 */
	metadata?: Record<string, any>
}

/**
 * Configuration options for smart rules
 */
export interface SmartRulesConfig {
	/**
	 * Whether smart rules are enabled
	 */
	enabled: boolean

	/**
	 * Minimum similarity score for rule matching (0-1)
	 * Default is 0.7
	 */
	minSimilarity?: number

	/**
	 * Maximum number of smart rules to include in a single prompt
	 * Default is 5
	 */
	maxRules?: number

	/**
	 * Whether to show which rules were selected in the UI
	 * Default is false
	 */
	showSelectedRules?: boolean

	/**
	 * Whether to include rule selection reasoning in debug logs
	 * Default is false
	 */
	debugRuleSelection?: boolean
}

/**
 * Result of smart rule selection
 */
export interface SmartRuleSelectionResult {
	/**
	 * The selected rules
	 */
	rules: SmartRule[]

	/**
	 * Reasoning for why each rule was selected (for debugging/transparency)
	 */
	reasoning?: Array<{
		rule: string
		score: number
		reason: string
	}>
}

/**
 * Smart rule file format (YAML frontmatter + markdown content)
 */
export interface SmartRuleFile {
	/**
	 * When to use this rule (from frontmatter)
	 */
	"use-when": string

	/**
	 * Optional priority (from frontmatter)
	 */
	priority?: number

	/**
	 * Optional dependencies (from frontmatter)
	 */
	dependencies?: string[]

	/**
	 * Any other metadata fields
	 */
	[key: string]: any
}
