---
name: describe-object
description: >
  Describe a Salesforce object's schema metadata including all fields, relationships,
  picklist values, and field properties. Use when the user wants to inspect an object's
  structure, list fields, check field types, or understand relationships between objects.
  Examples: 'describe Account', 'show me the Case fields', 'what fields does Opportunity have'.
argument-hint: <ObjectName> [--target-org <alias>]
allowed-tools: Bash, Read
---

# Describe Salesforce Object

Get detailed schema metadata for any Salesforce object — standard or custom — including
all fields, relationships, field properties, and picklist values.

## Prerequisites

You must be authenticated to a Salesforce org before describing objects.
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

For CI/CD (JWT flow):
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sf-auth.js --method jwt --client-id <id> --jwt-key-file <path> --username <user>
```

To set a default org:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sf-auth.js --set-default <alias>
```

See `scripts/sf-auth.js --help` for all authentication options.

## Describing an Object

### Basic usage

Describe a standard or custom object:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/describe-object/scripts/describe.js $ARGUMENTS
```

### Examples

```bash
# Describe Account object
node ${CLAUDE_PLUGIN_ROOT}/skills/describe-object/scripts/describe.js Account

# Describe against a specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/describe-object/scripts/describe.js Contact --target-org myDevOrg

# Show only fields table
node ${CLAUDE_PLUGIN_ROOT}/skills/describe-object/scripts/describe.js Opportunity --fields-only

# Inspect a single field in detail
node ${CLAUDE_PLUGIN_ROOT}/skills/describe-object/scripts/describe.js Account --field Industry

# Show only relationships
node ${CLAUDE_PLUGIN_ROOT}/skills/describe-object/scripts/describe.js Case --relationships

# Get raw JSON output
node ${CLAUDE_PLUGIN_ROOT}/skills/describe-object/scripts/describe.js Custom_Object__c --raw
```

## Workflow

1. **Check authentication** — run `sf-auth.js --status` to see if an org is connected.
2. **Authenticate if needed** — run `sf-auth.js` with the appropriate method.
3. **Describe the object** — run `describe.js` with the object's API name.
4. **Present the results** — summarize the key fields, types, and relationships clearly for the user.

## Output

The describe script returns:
- **Object summary**: label, key prefix, permissions (createable, updateable, deletable, queryable), record types
- **Fields table**: name, label, type, length, nillable, references
- **Relationships**: lookup/master-detail fields and child relationships
- **Single field detail**: full metadata for a specific field including picklist values, formula, help text

## Tips

- Use the API name of the object, not the label (e.g., `Custom_Object__c` not `Custom Object`).
- Custom objects end with `__c`, custom fields end with `__c`.
- If the user asks about a field, use the `--field` flag for detailed info.
- If the user asks about relationships, use the `--relationships` flag.
