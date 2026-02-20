---
name: create-hook
description: Create a new Claude Code hook that runs shell commands at specific lifecycle points — formatting after edits, blocking commands, notifications, context injection, and more. Hooks are added to settings.json files.
argument-hint: "[target-project-path]"
allowed-tools: Read, Write, Bash, Glob
---

# Create a Claude Code Hook

**Read first**: `${CLAUDE_PLUGIN_ROOT}/docs/hooks-guide.md` — this is the full reference for hook events, matchers, input/output formats, hook types, and examples. Use it to guide every decision.

## Determine target location

Hooks live in JSON settings files, not standalone files. Check if the user passed a path as `$ARGUMENTS`.

- Path given → add to `<path>/.claude/settings.json` (project, shareable) or `<path>/.claude/settings.local.json` (project, gitignored)
- `personal` → add to `~/.claude/settings.json` (all projects)
- Nothing → ask where. Explain the scoping options (see "Configure hook location" in the doc)

**Plugin note**: If the user is creating a hook for a plugin, hooks go in `hooks/hooks.json` at the plugin root — not in `settings.json`. The format is the same. See "Migrate hooks" in the plugins doc (`${CLAUDE_PLUGIN_ROOT}/docs/plugins.md`).

## Gather requirements

Ask the user what they want to automate. From their answer, use the doc to determine:

- Which event to hook into (see the event table in "How hooks work")
- Whether a matcher is needed to narrow when it fires (see "Filter hooks with matchers")
- Which hook type fits — `command` for shell scripts, `prompt` for LLM judgment, `agent` for multi-turn verification (see respective sections in the doc)
- What the hook should output (exit codes, JSON, stderr — see "Read input and return output")

## Create the hook

Read the existing settings file at the target location first — merge the new hook into the existing `hooks` object without clobbering other settings or hooks. If the file doesn't exist, create it with just the hooks config.

If the hook needs an external script, create it alongside and make it executable.

After creating, tell the user how to test it.