# claude-craft

A Claude Code plugin that scaffolds skills, commands, sub-agents, and hooks with best-practice templates — and keeps reference documentation synced with the latest Claude Code release.

## Prerequisites

- [Claude Code](https://claude.ai/claude-code) v1.0.33+

## Installation

Via marketplace:

```
/plugin install claude-craft@tsmztech
```

Or load locally for development:

```bash
claude --plugin-dir ./claude-craft
```

## Skills

| Skill | Description |
|---|---|
| `create-skill` | Scaffold a new Claude Code skill with proper frontmatter and content patterns |
| `create-command` | Scaffold a new slash command as a single markdown file |
| `create-sub-agent` | Scaffold a new sub-agent with system prompt, tools, and permissions |
| `create-hook` | Scaffold a new lifecycle hook for project, personal, or plugin scope |

## Commands

| Command | Description |
|---|---|
| `/claude-craft:check-docs` | Check if reference docs are up to date with the installed Claude Code version |
| `/claude-craft:update-docs` | Fetch and clean the latest Claude Code documentation into local reference docs |

## Getting Started

1. Install the plugin
2. Run `/claude-craft:check-docs` to verify your reference docs are current
3. Start scaffolding — Claude will guide you through creating each component

### Examples

```
Create a new skill for generating API clients
Scaffold a hook that runs linting on file save
Create a sub-agent for database migrations
Check if my claude-craft docs are up to date
```

## Reference Docs

The plugin bundles reference documentation for key Claude Code concepts:

- Skills, commands, and slash command authoring
- Sub-agent configuration and permissions
- Lifecycle hooks and event matchers
- MCP server integration
- Plugin structure and conventions
- Output styles and agent teams

Run `/claude-craft:update-docs` to sync these docs with the latest Claude Code release.

## Author

Tapas Mukherjee
