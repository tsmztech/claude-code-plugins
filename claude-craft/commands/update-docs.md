---
name: update-docs
description: Fetch and clean latest Claude Code documentation into local reference docs.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Update claude-craft Reference Docs

Fetch all docs in parallel using background sub-agents, then update the manifest.

## Step 1: Check versions

Run `claude --version` for the installed version and `npm view @anthropic-ai/claude-code version` for the latest available. If they differ, inform the user that a newer Claude Code version is available and suggest running `claude update` first — but proceed with the fetch if they want to continue.

## Step 2: Spawn parallel sub-agents

Launch one background sub-agent per doc. Each sub-agent should:

1. Read `${CLAUDE_PLUGIN_ROOT}/docs/cleanup-rules.md` for what to strip
2. Fetch its assigned URL
3. Apply the cleanup rules
4. Save the cleaned content to `${CLAUDE_PLUGIN_ROOT}/docs/<filename>`

| Fetch from | Save as |
|---|---|
| https://code.claude.com/docs/en/skills.md | skills.md |
| https://code.claude.com/docs/en/sub-agents.md | sub-agents.md |
| https://code.claude.com/docs/en/hooks-guide.md | hooks-guide.md |
| https://code.claude.com/docs/en/mcp.md | mcp.md |
| https://code.claude.com/docs/en/plugins.md | plugins.md |
| https://code.claude.com/docs/en/output-styles.md | output-styles.md |
| https://code.claude.com/docs/en/agent-teams.md | agent-teams.md |

Run all 7 in the background so they fetch concurrently.

## Step 3: Update manifest

After all sub-agents complete, update `${CLAUDE_PLUGIN_ROOT}/docs/manifest.json`:

- Set `claude_code_version` by running `claude --version`
- Set `fetched_at` to UTC now
- Set `status` to `"current"`