/**
 * File size and limit constants used across the application
 */

/**
 * Files larger than this threshold will be checked for token count
 * to prevent consuming too much of the context window
 */
export const LARGE_FILE_SIZE_THRESHOLD = 100 * 1024 // 100KB

/**
 * Files larger than this size will have the safeguard applied automatically
 * without token counting
 */
export const VERY_LARGE_FILE_SIZE = 1024 * 1024 // 1MB

/**
 * Default number of lines to read when applying the large file safeguard
 */
export const FALLBACK_MAX_LINES = 2000

/**
 * Maximum character count for file reading when safeguard is applied.
 * Based on typical token-to-character ratio (1 token ≈ 4 characters),
 * this ensures we don't consume too much of the context window.
 * For a 100k token context window at 50%, this would be ~200k characters.
 */
export const MAX_CHAR_LIMIT = 200_000 // 200k characters

/**
 * Percentage of the context window to use as the maximum token threshold
 * for file reading operations
 */
export const CONTEXT_WINDOW_PERCENTAGE = 0.5 // 50%

/**
 * Average characters per token ratio used for estimation
 */
export const CHARS_PER_TOKEN_RATIO = 4
