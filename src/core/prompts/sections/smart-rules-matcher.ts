import type { SmartRule, SmartRuleSelectionResult, SmartRulesConfig } from "../types/smart-rules"
import { logger } from "../../../utils/logging"

/**
 * Default configuration for smart rules
 */
const DEFAULT_CONFIG: Required<SmartRulesConfig> = {
	enabled: true,
	minSimilarity: 0.7,
	maxRules: 5,
	showSelectedRules: false,
	debugRuleSelection: false,
}

/**
 * Tokenize text for similarity comparison
 * @param text The text to tokenize
 * @returns Array of normalized tokens
 */
function tokenize(text: string): string[] {
	// Convert to lowercase and split on word boundaries
	return text
		.toLowerCase()
		.replace(/[^\w\s]/g, " ") // Replace punctuation with spaces
		.split(/\s+/)
		.filter((token) => token.length > 2) // Filter out very short tokens
}

/**
 * Calculate Jaccard similarity between two sets of tokens
 * @param tokens1 First set of tokens
 * @param tokens2 Second set of tokens
 * @returns Similarity score between 0 and 1
 */
function jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
	const set1 = new Set(tokens1)
	const set2 = new Set(tokens2)

	// Calculate intersection
	const intersection = new Set()
	set1.forEach((item) => {
		if (set2.has(item)) {
			intersection.add(item)
		}
	})

	// Calculate union
	const union = new Set(set1)
	set2.forEach((item) => union.add(item))

	if (union.size === 0) return 0
	return intersection.size / union.size
}

/**
 * Calculate semantic similarity between query and rule trigger
 * This is a simple implementation that can be enhanced with more sophisticated NLP
 * @param query The user query
 * @param trigger The rule trigger text
 * @returns Similarity score between 0 and 1
 */
function calculateSimilarity(query: string, trigger: string): number {
	const queryTokens = tokenize(query)
	const triggerTokens = tokenize(trigger)

	// Calculate Jaccard similarity
	const jaccardScore = jaccardSimilarity(queryTokens, triggerTokens)

	// Check for key phrase matches (boost score if trigger phrases appear in query)
	const triggerPhrases = trigger
		.toLowerCase()
		.split(/,|\sor\s/)
		.map((phrase) => phrase.trim())
		.filter((phrase) => phrase.length > 0)

	let phraseMatchBoost = 0
	const queryLower = query.toLowerCase()
	for (const phrase of triggerPhrases) {
		if (queryLower.includes(phrase)) {
			phraseMatchBoost += 0.3
		}
	}

	// Combine scores (cap at 1.0)
	return Math.min(1.0, jaccardScore + phraseMatchBoost)
}

/**
 * Select smart rules based on user query
 * @param query The user query/task description
 * @param availableRules All available smart rules
 * @param config Smart rules configuration
 * @returns Selection result with matched rules and reasoning
 */
export function selectSmartRules(
	query: string,
	availableRules: SmartRule[],
	config: Partial<SmartRulesConfig> = {},
): SmartRuleSelectionResult {
	const finalConfig = { ...DEFAULT_CONFIG, ...config }

	if (!finalConfig.enabled || availableRules.length === 0) {
		return { rules: [] }
	}

	// Calculate similarity scores for all rules
	const scoredRules = availableRules.map((rule) => {
		const score = calculateSimilarity(query, rule.useWhen)
		return { rule, score }
	})

	// Filter by minimum similarity and sort by score (descending)
	const eligibleRules = scoredRules
		.filter(({ score }) => score >= finalConfig.minSimilarity)
		.sort((a, b) => {
			// First sort by score
			const scoreDiff = b.score - a.score
			if (scoreDiff !== 0) return scoreDiff
			// Then by priority
			const priorityDiff = (b.rule.priority ?? 0) - (a.rule.priority ?? 0)
			if (priorityDiff !== 0) return priorityDiff
			// Finally by filename for stability
			return a.rule.filename.localeCompare(b.rule.filename)
		})
		.slice(0, finalConfig.maxRules)

	// Collect selected rules and handle dependencies
	const selectedRules = new Map<string, SmartRule>()
	const reasoning: SmartRuleSelectionResult["reasoning"] = []

	for (const { rule, score } of eligibleRules) {
		selectedRules.set(rule.filename, rule)

		if (finalConfig.debugRuleSelection || finalConfig.showSelectedRules) {
			reasoning.push({
				rule: rule.filename,
				score: Math.round(score * 100) / 100,
				reason: `Matched "${rule.useWhen}" with score ${(score * 100).toFixed(0)}%`,
			})
		}

		// Add dependencies
		if (rule.dependencies) {
			for (const depFilename of rule.dependencies) {
				const depRule = availableRules.find((r) => r.filename === depFilename)
				if (depRule && !selectedRules.has(depFilename)) {
					selectedRules.set(depFilename, depRule)

					if (finalConfig.debugRuleSelection || finalConfig.showSelectedRules) {
						reasoning.push({
							rule: depFilename,
							score: 0,
							reason: `Included as dependency of ${rule.filename}`,
						})
					}
				}
			}
		}
	}

	// Log selection results if debugging is enabled
	if (finalConfig.debugRuleSelection) {
		logger.info("Smart rule selection completed", {
			query: query.substring(0, 100) + "...",
			totalRules: availableRules.length,
			selectedCount: selectedRules.size,
			reasoning,
		})
	}

	return {
		rules: Array.from(selectedRules.values()),
		reasoning: reasoning.length > 0 ? reasoning : undefined,
	}
}

/**
 * Format selected smart rules for inclusion in the prompt
 * @param rules The selected smart rules
 * @param showRuleNames Whether to include rule filenames in the output
 * @returns Formatted rules content
 */
export function formatSmartRules(rules: SmartRule[], showRuleNames = false): string {
	if (rules.length === 0) return ""

	const sections = rules.map((rule) => {
		const header = showRuleNames ? `# Smart Rule from ${rule.filename}:\n` : ""
		return header + rule.content
	})

	return sections.join("\n\n")
}
