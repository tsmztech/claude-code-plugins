---
name: create-sub-agent
description: Create a new Claude Code sub-agent with proper markdown structure, frontmatter, and file placement.
argument-hint: "[target-project-path]"
allowed-tools: Read, Write, Bash, Glob
---

# Create a Claude Code Sub-Agent

**Read first**: `${CLAUDE_PLUGIN_ROOT}/docs/sub-agents.md` — this is the full reference for sub-agent structure, frontmatter fields, permission modes, hooks, and examples. Use it to guide every decision.

## Determine target location

Check if the user passed a path as `$ARGUMENTS`.

- Path given → create at `<path>/.claude/agents/<sub-agent-name>.md`
- `personal` → create at `~/.claude/agents/<sub-agent-name>.md`
- Nothing → ask where. Explain project vs personal scope (see "Choose the subagent scope" in the doc)

## Gather requirements

Ask the user what the sub-agent should do. From their answer, use the doc to determine:

- What the system prompt should contain (see "Write subagent files")
- Which tools it needs and which to deny (see "Available tools")
- Which model fits — `haiku` for fast/cheap, `sonnet` for balanced, `opus` for complex, `inherit` for same as parent (see "Choose a model")
- Whether it needs a specific permission mode (see "Permission modes")
- Whether it needs preloaded skills, persistent memory, MCP servers, or hooks (see respective sections in the doc)

## Create the sub-agent

Follow the conventions from the doc for file format and naming. Check if the target already exists before writing — never overwrite without asking.

After creating, tell the user how to test it.