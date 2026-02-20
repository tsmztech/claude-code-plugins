---
name: create-command
description: Create a new Claude Code slash command. Commands are single markdown files in .claude/commands/. For the newer skills format (directory with SKILL.md and supporting files), use create-skill instead.
argument-hint: "[target-project-path]"
allowed-tools: Read, Write, Bash, Glob
---

# Create a Claude Code Slash Command

**Read first**: `${CLAUDE_PLUGIN_ROOT}/docs/skills.md` — commands use the same frontmatter and content patterns as skills. The key difference is file placement: commands are single `.md` files in `.claude/commands/`, not directories with `SKILL.md`. See the note at the top about how "Custom slash commands have been merged into skills."

## Determine target location

Check if the user passed a path as `$ARGUMENTS`.

- Path given → create at `<path>/.claude/commands/<command-name>.md`
- `personal` → create at `~/.claude/commands/<command-name>.md`
- Nothing → ask where. Explain project vs personal scope (see "Where skills live" in the doc — same scoping rules apply to commands)

## Gather requirements

Ask the user what the command should do. Use the doc to determine frontmatter fields and content patterns — they work identically to skills.

If the user needs supporting files or auto-invocation by Claude, suggest using create-skill instead, since commands don't support those features.

## Create the command

Follow the conventions from the doc for file format and naming. Check if the target already exists before writing — never overwrite without asking.

After creating, tell the user how to test it.