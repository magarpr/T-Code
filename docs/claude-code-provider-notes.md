# Claude Code Provider - CLAUDE.md Injection Notice

## Overview

When using the Claude Code Provider in Roo-Code, users may notice that the Claude CLI tool automatically injects content from `CLAUDE.md` files if they exist in the repository root. This is a behavior of the Claude CLI tool itself (as of version 1.0.62), not a feature implemented by Roo-Code.

## How It Works

1. Roo-Code integrates with the Claude CLI tool by executing it as a subprocess
2. The system prompt is passed to the Claude CLI via:
    - `--system-prompt` flag on non-Windows systems
    - stdin on Windows systems (to avoid command length limitations)
3. The Claude CLI tool independently checks for and injects `CLAUDE.md` content

## Important Notes

- This injection happens at the Claude CLI level, before Roo-Code receives any response
- Roo-Code does not read or inject `CLAUDE.md` files - this is entirely handled by the Claude CLI
- The behavior may change in future versions of the Claude CLI tool

## Implications

If you have a `CLAUDE.md` file in your repository root and are using the Claude Code Provider:

- The contents will be automatically included in the context sent to Claude
- This happens transparently without explicit indication in the Roo-Code interface
- The AI will be aware of the `CLAUDE.md` contents even without using file reading tools

## Recommendations

- Be aware that `CLAUDE.md` files are automatically injected when using Claude Code Provider
- If you don't want this behavior, avoid naming files `CLAUDE.md` in your repository root
- This behavior is specific to the Claude Code Provider and does not affect other API providers

## Reference

This behavior was reported in [Issue #6604](https://github.com/RooCodeInc/Roo-Code/issues/6604).
