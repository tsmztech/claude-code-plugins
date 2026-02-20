---
name: create-skill
description: Create a new Claude Code skill with proper SKILL.md structure, frontmatter, and file placement.
argument-hint: "[target-project-path]"
allowed-tools: Read, Write, Bash, Glob
---

# Create a Claude Code Skill

**Read first**: `${CLAUDE_PLUGIN_ROOT}/docs/skills.md` — this is the full reference for skill structure, frontmatter fields, content patterns, and examples. Use it to guide every decision.

## Determine target location

Check if the user passed a path as `$ARGUMENTS`.

- Path given → create at `<path>/.claude/skills/<skill-name>/SKILL.md`
- `personal` → create at `~/.claude/skills/<skill-name>/SKILL.md`
- Nothing → ask where. Explain project vs personal scope (see "Where skills live" in the doc)

## Gather requirements

Ask the user what the skill should do. From their answer, use the doc to determine:

- Which content pattern fits (reference vs task — see "Types of skill content")
- Which frontmatter fields are needed (only include non-default values — see "Frontmatter reference")
- Whether it needs arguments, dynamic context, subagent execution, or supporting files (see respective sections in the doc)

## Create the skill

Follow the conventions from the doc for directory structure, naming, and file format. Check if the target already exists before writing — never overwrite without asking.

After creating, tell the user how to test it.