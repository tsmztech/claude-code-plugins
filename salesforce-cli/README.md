# salesforce-cli

A Claude Code plugin that adds Salesforce skills for working with orgs, objects, data, and bulk operations — all from natural language.

## Prerequisites

- [Claude Code](https://claude.ai/claude-code) v1.0.33+
- [Salesforce CLI (`sf`)](https://developer.salesforce.com/tools/salesforcecli) installed
- An authenticated Salesforce org

## Installation

Via marketplace:

```
/plugin install salesforce-cli@tsmztech
```

Or load locally for development:

```bash
claude --plugin-dir ./salesforce-cli
```

## Skills

| Skill | Description |
|---|---|
| `describe-object` | Inspect an object's fields, relationships, picklist values, and metadata |
| `search-objects` | Search for standard and custom objects by name pattern |
| `data-query` | Run SOQL queries — SELECT, COUNT, aggregate, subqueries, and all SOQL clauses |
| `aggregate-query` | Run SOQL aggregate queries — SUM, AVG, MIN, MAX, COUNT with GROUP BY, ROLLUP, CUBE, and HAVING |
| `dml-operations` | Insert, update, and upsert single records using field=value pairs |
| `bulk-import` | Bulk insert, upsert, or update records from a CSV file via Bulk API v2 |
| `data-export` | Export query results to CSV or JSON files with automatic pagination |
| `apex-execute` | Execute Anonymous Apex code against a Salesforce org |
| `debug-log` | Manage debug logs and trace flags — set, remove, list, retrieve, and analyze logs |
| `dashboard` | Generate interactive HTML dashboards with Chart.js charts, data tables, and KPI cards from Salesforce data |

## Commands

| Command | Description |
|---|---|
| `/salesforce-cli:check-setup` | Verify SF CLI installation, org authentication, and API access |

## Getting Started

1. Install the plugin
2. Run `/salesforce-cli:check-setup` to verify your environment
3. Start using natural language — Claude will automatically invoke the right skills

### Examples

```
Describe the Account object
Query all opportunities closed this quarter
Get total revenue by stage for this quarter
Insert a new Contact named John Smith
Export all leads to leads.csv
Bulk import accounts from data.csv
Execute anonymous Apex to update all stale leads
Set a debug trace flag and analyze the latest log
Create a dashboard showing my opportunity pipeline
Visualize revenue by stage as a bar chart
```

## Authentication

The plugin handles auth through the included `sf-auth.js` script. It supports:

- **Web login** — interactive browser-based auth
- **Sandbox orgs** — via `--instance-url https://test.salesforce.com`
- **JWT flow** — for CI/CD environments
- **Multi-org** — target specific orgs with `--target-org <alias>`

## Safety

DML and bulk operations follow strict safety rules:

- Claude always confirms the operation details before executing
- Large bulk operations trigger explicit warnings
- Sandbox use is recommended before running against production

## Author

Tapas Mukherjee
