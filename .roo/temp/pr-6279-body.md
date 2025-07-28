## Description

Fixes #6279

This PR implements a read_file history deduplication feature that removes duplicate file reads from the conversation history while preserving the most recent content for each file. This helps reduce context size and improves efficiency when files are read multiple times during a conversation.

## Changes Made

- Added `READ_FILE_DEDUPLICATION` experimental feature flag in `src/shared/experiments.ts` and `packages/types/src/experiment.ts`
- Implemented `deduplicateReadFileHistory` method in `src/core/task/Task.ts` that:
    - Uses a two-pass approach to identify and remove duplicate file reads
    - Preserves the most recent read for each file path
    - Respects a 5-minute cache window (recent messages are not deduplicated)
    - Handles single files, multi-file reads, and legacy formats
- Integrated deduplication into `src/core/tools/readFileTool.ts` to trigger after successful file reads
- Added comprehensive unit tests in `src/core/task/__tests__/Task.spec.ts`
- Updated related test files to include the new experiment flag

## Testing

- [x] All existing tests pass
- [x] Added tests for deduplication logic:
    - [x] Single file deduplication
    - [x] Multi-file read handling
    - [x] Legacy format support
    - [x] 5-minute cache window behavior
    - [x] Preservation of non-read_file content
- [x] Manual testing completed:
    - [x] Feature works correctly when enabled
    - [x] No impact when feature is disabled
    - [x] Conversation history remains intact

## Verification of Acceptance Criteria

- [x] Criterion 1: Deduplication removes older duplicate read_file entries while preserving the most recent
- [x] Criterion 2: 5-minute cache window is respected - recent reads are not deduplicated
- [x] Criterion 3: Multi-file reads are handled correctly as atomic units
- [x] Criterion 4: Legacy single-file format is supported
- [x] Criterion 5: Feature is behind experimental flag and disabled by default
- [x] Criterion 6: Non-read_file content blocks are preserved

## Checklist

- [x] Code follows project style guidelines
- [x] Self-review completed
- [x] Comments added for complex logic
- [x] Documentation updated (if needed)
- [x] No breaking changes (or documented if any)
- [x] Accessibility checked (for UI changes)

## Additional Notes

This implementation takes a fresh approach to the deduplication problem, using a clean two-pass algorithm that ensures correctness while maintaining performance. The feature is disabled by default and can be enabled through the experimental features settings.

## Get in Touch

@hrudolph
