---
name: search-objects
description: >
  Search for Salesforce standard and custom objects by name pattern. Use when the user
  wants to find objects in their org, discover available objects, look up custom objects,
  or check if an object exists. Examples: 'search for Account', 'find objects related to
  Order', 'list custom objects matching Invoice', 'what objects are in my org for cases'.
argument-hint: <searchPattern> [--target-org <alias>]
allowed-tools: Bash, Read
---

# Search Salesforce Objects

Search for Salesforce standard and custom objects by name or label pattern. Returns
matching objects with their API name, label, type (standard/custom), and queryability.

## Prerequisites

You must be authenticated to a Salesforce org before searching objects.
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

See `${CLAUDE_PLUGIN_ROOT}/scripts/sf-auth.js --help` for all authentication options.

## Searching Objects

### Basic usage

Search for objects matching a pattern:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/search-objects/scripts/search.js $ARGUMENTS
```

### Examples

```bash
# Search for objects containing "Account"
node ${CLAUDE_PLUGIN_ROOT}/skills/search-objects/scripts/search.js Account

# Multi-term search (finds WorkOrder, WorkOrderLineItem, etc.)
node ${CLAUDE_PLUGIN_ROOT}/skills/search-objects/scripts/search.js "Order Work"

# Search against a specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/search-objects/scripts/search.js Case --target-org myDevOrg

# Only custom objects
node ${CLAUDE_PLUGIN_ROOT}/skills/search-objects/scripts/search.js Invoice --custom-only

# Only standard objects
node ${CLAUDE_PLUGIN_ROOT}/skills/search-objects/scripts/search.js Account --standard-only

# Only queryable objects
node ${CLAUDE_PLUGIN_ROOT}/skills/search-objects/scripts/search.js Order --queryable

# Show more results
node ${CLAUDE_PLUGIN_ROOT}/skills/search-objects/scripts/search.js "" --limit 100

# Get raw JSON output
node ${CLAUDE_PLUGIN_ROOT}/skills/search-objects/scripts/search.js Account --raw
```

## Workflow

1. **Check authentication** — run `sf-auth.js --status` to see if an org is connected.
2. **Authenticate if needed** — run `sf-auth.js` with the appropriate method.
3. **Search for objects** — run `search.js` with the search pattern.
4. **Present the results** — summarize the matching objects for the user.
5. **Follow up** — if the user wants details about a specific object, use the `salesforce-cli:describe-object` skill.

## Output

The search script returns:
- **API Name**: The object's Salesforce API name (e.g., `Account`, `Custom_Object__c`)
- **Label**: The human-readable label
- **Type**: Standard or Custom
- **Queryable**: Whether the object can be queried via SOQL

## Tips

- Search terms are case-insensitive and match against both API name and label.
- Multiple words act as an AND filter — all terms must match.
- Use `--custom-only` to focus on custom objects (ending in `__c`).
- After finding objects, use the `salesforce-cli:describe-object` skill to inspect their fields and relationships.
