# salesforce-dev

A Claude Code plugin for Salesforce development — Apex code reviews, custom object creation, and field management, all from natural language.

## Prerequisites

- [Claude Code](https://claude.ai/claude-code) v1.0.33+
- [Salesforce CLI (`sf`)](https://developer.salesforce.com/tools/salesforcecli) installed
- An authenticated Salesforce org

## Installation

Via marketplace:

```
/plugin install salesforce-dev@tsmztech
```

Or load locally for development:

```bash
claude --plugin-dir ./salesforce-dev
```

## Skills

| Skill | Description |
|---|---|
| `apex-code-review` | Structured, severity-categorized code review of Apex classes, triggers, and test classes |
| `create-object` | Guided workflow to create custom objects with configurable settings and features |
| `create-field` | Guided workflow to create custom fields on any object with field-level security and layout assignment |

## Getting Started

1. Install the plugin
2. Start using natural language — Claude will automatically invoke the right skills

### Examples

```
Review the AccountService class for best practices
Create a custom object called Property
Add a Currency field called Annual Revenue to the Property object
Review all my Apex triggers for security issues
```

## Skills in Detail

### apex-code-review

Performs multi-phase Apex code reviews with severity-categorized findings:

- **CRITICAL** — Security vulnerabilities, data loss risks (SOQL injection, missing CRUD/FLS, hardcoded credentials)
- **HIGH** — Governor limit violations, performance issues (SOQL/DML in loops, non-bulkified code)
- **MEDIUM** — Design patterns, maintainability, testing quality
- **LOW** — Code style, naming conventions
- **INFO** — Recommendations and suggestions

Supports reviewing code from local files or directly from a Salesforce org. Output formats include chat display, Markdown file, or CSV export. Reviews 50+ rules across security, governor limits, error handling, design, testing, and style categories.

For multi-file reviews, parallel sub-agents are dispatched for scalability, followed by cross-file analysis.

### create-object

Walks you through creating a custom Salesforce object with:

- Label, plural label, and API name
- Record name field (Text or AutoNumber)
- Optional features — Reports, Activities, Field History Tracking, Chatter, Search
- Deployment status and sharing model
- Enterprise features — Bulk API, Streaming API access
- Duplicate checking against existing standard and custom objects

After creation, offers to add fields to the new object via the `create-field` skill.

### create-field

Walks you through creating a custom field with support for 20+ field types:

- **Basic** — Text, Text Area, Number, Currency, Percent, Checkbox, Date, Date/Time, Time, Email, Phone, URL
- **Selection** — Picklist, Picklist (Multi-Select)
- **Relationships** — Lookup, Master-Detail
- **Computed** — Formula, Roll-Up Summary, Auto Number
- **Special** — Geolocation, Text (Encrypted)

Includes duplicate field checking, field-level security configuration, and page layout assignment.

## Utility Scripts

The plugin includes shared scripts used by skills and available for direct use:

| Script | Description |
|---|---|
| `sf-auth.js` | Authenticate to Salesforce orgs (web, JWT, SFDX URL, device code flows) |
| `describe-object.js` | Retrieve detailed schema metadata for any object |
| `fetch-apex.js` | Fetch Apex class/trigger source code from an org via Tooling API |
| `list-profiles.js` | Query profiles and permission sets for access control workflows |
| `search-objects.js` | Search for standard and custom objects by name pattern |

## Authentication

The plugin handles auth through the included `sf-auth.js` script. It supports:

- **Web login** — interactive browser-based auth
- **Sandbox orgs** — via `--instance-url https://test.salesforce.com`
- **JWT flow** — for CI/CD environments
- **Device code flow** — for headless environments
- **Multi-org** — target specific orgs with `--target-org <alias>`

## Safety

Object and field creation skills follow strict safety rules:

- Claude always confirms all settings before executing
- Duplicate checking prevents accidental collisions with existing objects and fields
- Sandbox use is recommended before running against production

## Author

Tapas Mukherjee
