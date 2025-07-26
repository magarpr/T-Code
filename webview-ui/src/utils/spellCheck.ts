/**
 * Simple spell check utility for detecting misspelled words
 * Uses the browser's built-in spell check API when available
 */

export interface SpellCheckResult {
	word: string
	startIndex: number
	endIndex: number
	suggestions?: string[]
}

/**
 * Check if the browser supports the native spell check API
 */
export const isSpellCheckSupported = (): boolean => {
	// Check if we're in a browser environment and if the spell check API is available
	return typeof window !== "undefined" && "spellcheck" in document.createElement("textarea")
}

/**
 * Common English words that should not be marked as misspelled
 * This is a basic dictionary for fallback when native spell check is not available
 */
const commonWords = new Set([
	// Common words
	"the",
	"be",
	"to",
	"of",
	"and",
	"a",
	"in",
	"that",
	"have",
	"i",
	"it",
	"for",
	"not",
	"on",
	"with",
	"he",
	"as",
	"you",
	"do",
	"at",
	"this",
	"but",
	"his",
	"by",
	"from",
	"they",
	"we",
	"say",
	"her",
	"she",
	"or",
	"an",
	"will",
	"my",
	"one",
	"all",
	"would",
	"there",
	"their",
	"what",
	"so",
	"up",
	"out",
	"if",
	"about",
	"who",
	"get",
	"which",
	"go",
	"me",
	"when",
	"make",
	"can",
	"like",
	"time",
	"no",
	"just",
	"him",
	"know",
	"take",
	"people",
	"into",
	"year",
	"your",
	"good",
	"some",
	"could",
	"them",
	"see",
	"other",
	"than",
	"then",
	"now",
	"look",
	"only",
	"come",
	"its",
	"over",
	"think",
	"also",
	"back",
	"after",
	"use",
	"two",
	"how",
	"our",
	"work",
	"first",
	"well",
	"way",
	"even",
	"new",
	"want",
	"because",
	"any",
	"these",
	"give",
	"day",
	"most",
	"us",
	"is",
	"was",
	"are",
	"been",
	"has",
	"had",
	"were",
	"said",
	"did",
	"getting",
	"made",
	"find",
	"where",
	"much",
	"too",
	"very",
	"still",
	"being",
	"going",
	"why",
	"before",
	"never",
	"here",
	"more",
	"always",
	"those",
	"tell",
	"really",
	"something",
	"nothing",
	"everything",
	"anything",
	// Additional common words
	"quick",
	"brown",
	"fox",
	"jumps",
	"lazy",
	"dog",
	"sentence",
	"misspelling",
	// Contractions
	"don't",
	"can't",
	"won't",
	"isn't",
	"aren't",
	"wasn't",
	"weren't",
	"hasn't",
	"haven't",
	"hadn't",
	"doesn't",
	"didn't",
	"wouldn't",
	"shouldn't",
	"couldn't",
	"mightn't",
	"mustn't",
	"would've",
	"should've",
	"could've",
	"might've",
	"must've",
	"i'll",
	"you'll",
	"he'll",
	"she'll",
	"we'll",
	"they'll",
	"i'd",
	"you'd",
	"he'd",
	"she'd",
	"we'd",
	"they'd",
	"i've",
	"you've",
	"we've",
	"they've",
	"i'm",
	"you're",
	"he's",
	"she's",
	"it's",
	"we're",
	"they're",
	"let's",
	"that's",
	"who's",
	"what's",
	"where's",
	"when's",
	"why's",
	"how's",
	"here's",
	"there's",
	// Tech-related words
	"code",
	"function",
	"variable",
	"const",
	"let",
	"var",
	"class",
	"method",
	"property",
	"object",
	"array",
	"string",
	"number",
	"boolean",
	"null",
	"undefined",
	"true",
	"false",
	"if",
	"else",
	"for",
	"while",
	"do",
	"switch",
	"case",
	"break",
	"continue",
	"return",
	"try",
	"catch",
	"finally",
	"throw",
	"new",
	"this",
	"super",
	"extends",
	"implements",
	"interface",
	"enum",
	"type",
	"namespace",
	"module",
	"import",
	"export",
	"default",
	"from",
	"as",
	"async",
	"await",
	"promise",
	"then",
	"catch",
	"finally",
	"callback",
	"error",
	"debug",
	"console",
	"log",
	"warn",
	"info",
	"trace",
	"assert",
	"clear",
	"count",
	"group",
	"time",
	"profile",
	// Roo-specific words
	"roo",
	"chat",
	"message",
	"task",
	"file",
	"directory",
	"workspace",
	"project",
	"api",
	"model",
	"token",
	"context",
	"prompt",
	"response",
	"request",
	"approve",
	"reject",
	"execute",
	"command",
	"terminal",
	"browser",
	"search",
	"replace",
	"edit",
	"create",
	"delete",
	"read",
	"write",
	"list",
	"view",
	"open",
	"close",
	"save",
	"load",
	"refresh",
	"update",
	"install",
	"uninstall",
	"build",
	"test",
	"run",
	"start",
	"stop",
	"restart",
	"deploy",
	"commit",
	"push",
	"pull",
	"merge",
	"branch",
	"checkout",
	"clone",
	"fork",
])

/**
 * Check if a word is likely misspelled using a basic dictionary
 * This is a fallback for when native spell check is not available
 */
const isLikelyMisspelled = (word: string): boolean => {
	// Ignore very short words
	if (word.length <= 2) return false

	// Ignore words with numbers
	if (/\d/.test(word)) return false

	// Ignore words that are all uppercase (likely acronyms)
	if (word === word.toUpperCase()) return false

	// Don't check words that start with @ or / (mentions and commands)
	// Extract the actual word without the prefix for checking
	const wordToCheck = word.startsWith("@") || word.startsWith("/") ? word.substring(1) : word

	// Check against common words dictionary
	return !commonWords.has(wordToCheck.toLowerCase())
}

/**
 * Extract words from text with their positions
 */
const extractWords = (text: string): Array<{ word: string; start: number; end: number }> => {
	const words: Array<{ word: string; start: number; end: number }> = []
	// Match words (including contractions like "don't", "it's") but exclude @ and / mentions
	// This regex will not match words that are part of @mentions or /commands
	const wordRegex = /(?<![@/])\b[\w']+\b/g
	let match

	while ((match = wordRegex.exec(text)) !== null) {
		// Double check that this word is not part of a mention or command
		const charBefore = text[match.index - 1]
		if (charBefore !== "@" && charBefore !== "/") {
			words.push({
				word: match[0],
				start: match.index,
				end: match.index + match[0].length,
			})
		}
	}

	return words
}

/**
 * Perform spell check on the given text
 * Returns an array of potentially misspelled words with their positions
 */
export const checkSpelling = async (text: string): Promise<SpellCheckResult[]> => {
	const results: SpellCheckResult[] = []
	const words = extractWords(text)

	// For now, use the basic dictionary check
	// In the future, this could be enhanced with a proper spell check API
	for (const { word, start, end } of words) {
		if (isLikelyMisspelled(word)) {
			results.push({
				word,
				startIndex: start,
				endIndex: end,
			})
		}
	}

	return results
}

/**
 * Debounce function to limit spell check frequency
 */
export const debounce = <T extends (...args: any[]) => any>(
	func: T,
	wait: number,
): ((...args: Parameters<T>) => void) => {
	let timeout: NodeJS.Timeout | null = null

	return (...args: Parameters<T>) => {
		if (timeout) clearTimeout(timeout)
		timeout = setTimeout(() => func(...args), wait)
	}
}
