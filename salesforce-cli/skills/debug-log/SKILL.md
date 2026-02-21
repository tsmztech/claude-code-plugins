---
name: debug-log
description: >
  Manage Salesforce debug logs and trace flags. Set or remove trace flags for any user,
  list and retrieve debug logs, and analyze log content for performance issues and errors.
  Use when the user wants to enable debugging, check debug logs, troubleshoot issues,
  analyze governor limits, or investigate Apex execution.
  Examples: 'enable debug log for user', 'set trace flag', 'get debug logs',
  'show my logs', 'analyze this log', 'remove trace flag', 'check governor limits in log'.
argument-hint: '<action: set|remove|list|get|analyze> [options]'
allowed-tools: Bash, Read
---

# Debug Log Management

Manage Salesforce debug logs and trace flags. This skill provides four scripts for the full debugging lifecycle: enable logging, retrieve logs, analyze them, and clean up.

## Prerequisites

You must be authenticated to a Salesforce org before managing debug logs.
If not authenticated, run the authentication script first.

## Authentication

If the user is not authenticated or gets an auth error, run the authentication script:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sf-auth.js --status
```

To authenticate interactively (opens browser):
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sf-auth.js --alias <alias>
```

To authenticate to a sandbox:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sf-auth.js --alias <alias> --instance-url https://test.salesforce.com
```

## CRITICAL: User is Mandatory for Trace Flag Actions

When the user asks to set or remove a trace flag, you **MUST** know which Salesforce user to target. The scripts require either `--username` (exact username) or `--name` (search by name).

- If the user does not specify who to trace, **ASK** them before running the script.
- Do NOT assume the current authenticated user — always confirm explicitly.
- You can use `--name` for a friendlier search (e.g., `--name "John"`) which does exact match first, then partial (`LIKE '%John%'`).
- If `--name` returns multiple matches, the script will list them and exit — ask the user to pick one, then re-run with `--username`.

## Actions & Scripts

This skill provides **four scripts**, one for each debugging action.

---

### 1. Set User Trace Flag

Enable debug logging for a user by creating a debug level and trace flag. User is **required**.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/set-trace-flag.js --username <user> | --name <name> [options]
```

#### Options

| Option | Description |
|---|---|
| `--username, -u <username>` | Exact username of the user to trace (e.g., `john@example.com`). **Required** unless `--name` is provided. |
| `--name, -n <name>` | Search by user name — tries exact match first, then partial (`LIKE`). **Required** unless `--username` is provided. |
| `--level, -l <preset>` | Debug level preset: `finest`, `debug`, `apex` (default: `debug`) |
| `--duration, -d <minutes>` | Duration in minutes the trace flag stays active (default: `30`, max: `1440`) |
| `--log-type, -t <type>` | Log type: `DEVELOPER_LOG` or `USER_DEBUG` (default: `DEVELOPER_LOG`) |
| `--target-org, -o <alias>` | Target org alias or username |
| `--json` | Output raw JSON |
| `--help, -h` | Show help |

#### Debug Level Presets

| Preset | ApexCode | ApexProfiling | Callout | Database | System | Validation | Visualforce | Workflow | Wave | Nba |
|---|---|---|---|---|---|---|---|---|---|---|
| `finest` | FINEST | FINEST | FINEST | FINEST | DEBUG | INFO | FINER | FINER | FINEST | FINE |
| `debug` | DEBUG | INFO | INFO | INFO | DEBUG | INFO | NONE | INFO | NONE | NONE |
| `apex` | FINEST | FINE | NONE | INFO | DEBUG | NONE | NONE | NONE | NONE | NONE |

#### Examples

```bash
# Set trace flag by exact username
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/set-trace-flag.js --username admin@myorg.com

# Search by name with finest logging for 1 hour
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/set-trace-flag.js --name "John Doe" --level finest --duration 60

# Partial name search with apex-focused logging on a sandbox
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/set-trace-flag.js --name Doe --level apex --target-org mySandbox

# USER_DEBUG log type instead of DEVELOPER_LOG
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/set-trace-flag.js --username user@myorg.com --log-type USER_DEBUG
```

---

### 2. Remove User Trace Flag

Remove trace flags to stop debug logging for a user. User is **required** unless `--all` is specified.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/remove-trace-flag.js --username <user> | --name <name> | --all [options]
```

#### Options

| Option | Description |
|---|---|
| `--username, -u <username>` | Exact username whose trace flags to remove. **Required** unless `--name` or `--all` is provided. |
| `--name, -n <name>` | Search by user name — tries exact match first, then partial (`LIKE`). **Required** unless `--username` or `--all` is provided. |
| `--all` | Remove ALL trace flags in the org (not just for one user) |
| `--target-org, -o <alias>` | Target org alias or username |
| `--json` | Output raw JSON |
| `--help, -h` | Show help |

#### Examples

```bash
# Remove trace flags by exact username
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/remove-trace-flag.js --username admin@myorg.com

# Remove by name search
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/remove-trace-flag.js --name "John Doe"

# Remove all trace flags in the org
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/remove-trace-flag.js --all

# Against a specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/remove-trace-flag.js --username admin@myorg.com --target-org mySandbox
```

---

### 3. Get / List Debug Logs

List available debug logs or retrieve specific log content.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/get-log.js [options]
```

#### Options

| Option | Description |
|---|---|
| `--list` | List available debug logs (default action if no --log-id or --number given) |
| `--log-id, -i <id>` | Retrieve a specific log by its ID |
| `--number, -n <count>` | Retrieve the N most recent logs (default: `1`) |
| `--username, -u <username>` | Filter logs by username |
| `--target-org, -o <alias>` | Target org alias or username |
| `--json` | Output raw JSON |
| `--help, -h` | Show help |

#### Examples

```bash
# List all available debug logs
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/get-log.js --list

# Get the most recent log
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/get-log.js

# Get a specific log by ID
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/get-log.js --log-id 07L5w00000abcdef

# Get the 5 most recent logs
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/get-log.js --number 5

# List logs for a specific user
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/get-log.js --list --username admin@myorg.com

# Against a specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/get-log.js --list --target-org mySandbox
```

---

### 4. Analyze Debug Log

Parse a debug log and extract actionable insights: governor limit usage, SOQL/DML details, performance bottlenecks, errors, and System.debug() output.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/analyze-log.js [options]
```

#### Options

| Option | Description |
|---|---|
| `--log-id, -i <id>` | Fetch and analyze a specific log by ID |
| `--file, -f <path>` | Analyze a log from a local file |
| `--target-org, -o <alias>` | Target org alias or username (used with --log-id) |
| `--json` | Output analysis as JSON |
| `--help, -h` | Show help |

One of `--log-id` or `--file` is required.

#### What Gets Analyzed

| Area | Details |
|---|---|
| **Governor Limits** | SOQL queries, DML statements, CPU time, heap size, callouts — with usage vs. limit |
| **SOQL Queries** | Each query executed, row counts, and whether queries appear inside loops |
| **DML Operations** | Each DML statement, row counts, and DML-in-loop detection |
| **System.debug() Output** | All `USER_DEBUG` log lines extracted and displayed |
| **Errors & Exceptions** | Fatal errors, unhandled exceptions, LIMIT_USAGE warnings |
| **Execution Units** | Code units executed (triggers, classes, validation rules, flows) |
| **Performance** | Total execution time, slowest operations |

#### Examples

```bash
# Analyze a specific log by ID
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/analyze-log.js --log-id 07L5w00000abcdef

# Analyze a log from a file
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/analyze-log.js --file /path/to/debug.log

# Analyze with JSON output
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/analyze-log.js --log-id 07L5w00000abcdef --json

# Analyze from a specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/debug-log/scripts/analyze-log.js --log-id 07L5w00000abcdef --target-org mySandbox
```

## How to Choose the Right Script

| User wants... | Script | Key indicator |
|---|---|---|
| Enable debugging / set trace flag | `set-trace-flag.js` | "enable debug", "set trace flag", "start logging" |
| Stop debugging / remove trace flag | `remove-trace-flag.js` | "remove debug", "stop logging", "delete trace flag" |
| View available logs / get log content | `get-log.js` | "show logs", "list logs", "get log", "fetch log" |
| Understand what happened in a log | `analyze-log.js` | "analyze log", "check limits", "what went wrong", "debug this" |

## Workflow

### Full Debugging Workflow

1. **Check authentication** — run `sf-auth.js --status` to see if an org is connected
2. **Ask for the user** — if not specified, ask who to enable debugging for
3. **Enable logging** — run `set-trace-flag.js` with the user's username or name
4. **User performs the action** — tell the user to reproduce the issue in Salesforce
5. **Retrieve logs** — run `get-log.js --list` to see available logs, then `get-log.js --log-id <id>` to fetch content
6. **Analyze** — run `analyze-log.js --log-id <id>` to extract insights
7. **Clean up** — run `remove-trace-flag.js` with the same user to stop logging

### Quick Log Check

1. **List logs** — `get-log.js --list` to see what's available
2. **Get the latest** — `get-log.js --number 1` to fetch the most recent log
3. **Analyze** — `analyze-log.js --log-id <id>` or pipe the log content

## Tips

- Trace flags expire automatically based on the `--duration` setting (default 30 minutes, max 24 hours).
- Debug logs are capped at **2 MB** per log. Use targeted debug level presets (like `apex`) instead of `finest` to reduce noise.
- The `finest` preset generates very verbose logs — use it only when you need maximum detail.
- The `apex` preset is ideal for debugging Apex code without the noise from other categories.
- If no logs appear after setting a trace flag, the user needs to perform an action in Salesforce to trigger logging.
- Governor limit analysis in `analyze-log.js` will highlight any limits above 70% usage as warnings.
- When analyzing performance, look for SOQL or DML inside loops — this is the most common cause of limit exceptions.
- To check if a trace flag is already active, use `remove-trace-flag.js` which lists existing trace flags before deleting.
- Only active users (`IsActive = true`) are returned when looking up users.
