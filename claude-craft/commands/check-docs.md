---
name: check-docs
description: Check if claude-craft reference docs are up to date by comparing the fetched version against installed and latest available Claude Code versions.
disable-model-invocation: true
allowed-tools: Read, Bash
---

# Check claude-craft Doc Freshness

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/docs/manifest.json` to get `claude_code_version` and `fetched_at`
2. Run `claude --version` to get the installed Claude Code version
3. Run `npm view @anthropic-ai/claude-code version` to get the latest available version
4. Compare all three

## Report

- **Docs version** vs **installed version**: if they differ → ⚠️ Docs were fetched on an older install, suggest running `/claude-craft:update-docs`
- **Installed version** vs **latest available**: if they differ → ⚠️ Claude Code itself has an update available, suggest updating Claude Code first (`claude update`), then running `/claude-craft:update-docs`
- **All three match** → ✅ Everything is up to date
- **Docs version is empty** or **status is `"seeded"`** → ❌ Docs have never been fetched, suggest running `/claude-craft:update-docs`