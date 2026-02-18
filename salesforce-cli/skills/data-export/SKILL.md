---
name: data-export
description: >
  Export Salesforce data to a local CSV or JSON file. Runs a SOQL query and saves the results
  to disk. Supports automatic pagination for complete exports and Bulk API 2.0 for very large
  datasets (100k+ records). CSV files open directly in Excel and Google Sheets.
  Examples: 'export accounts to CSV', 'save contacts to a file', 'download opportunities as JSON',
  'export all leads to spreadsheet', 'bulk export cases to CSV'.
argument-hint: '<SOQL or natural language> --output <file-path> [--target-org <alias>]'
allowed-tools: Bash, Read, Skill(salesforce-cli:data-query, salesforce-cli:describe-object)
---

# Data Export

Export Salesforce query results to a local CSV or JSON file. Handles automatic pagination to
fetch all records and supports Bulk API 2.0 for very large datasets.

## Prerequisites

You must be authenticated to a Salesforce org before exporting data.
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

See `scripts/sf-auth.js --help` for all authentication options.

## Usage

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/data-export/scripts/export.js "<SOQL>" --output <file-path> [options]
```

### Options

| Option | Short | Description | Default |
|---|---|---|---|
| `--output` | `-f` | Output file path (required) | — |
| `--format` | | `csv` or `json` | auto-detected from file extension |
| `--target-org` | `-o` | Target org alias or username | default org |
| `--all-rows` | | Include deleted/archived records | false |
| `--bulk` | | Use Bulk API 2.0 for large exports | false |
| `--wait` | `-w` | Minutes to wait for bulk job (default: 10) | `10` |
| `--json` | | Print export metadata as JSON to stdout | — |
| `--help` | `-h` | Show help | — |

## Examples

```bash
# Export accounts to CSV
node ${CLAUDE_PLUGIN_ROOT}/skills/data-export/scripts/export.js "SELECT Id, Name, Industry FROM Account" --output accounts.csv

# Export to JSON (auto-detected from extension)
node ${CLAUDE_PLUGIN_ROOT}/skills/data-export/scripts/export.js "SELECT Id, Name, Email FROM Contact" --output contacts.json

# Export with specific format override
node ${CLAUDE_PLUGIN_ROOT}/skills/data-export/scripts/export.js "SELECT Id, Name FROM Account" --output data.txt --format csv

# Export from a specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/data-export/scripts/export.js "SELECT Id, Name FROM Account" -f accounts.csv -o myDevOrg

# Include deleted/archived records
node ${CLAUDE_PLUGIN_ROOT}/skills/data-export/scripts/export.js "SELECT Id, Name FROM Account" -f accounts.csv --all-rows

# Bulk export for large datasets (100k+ records)
node ${CLAUDE_PLUGIN_ROOT}/skills/data-export/scripts/export.js "SELECT Id, Name, Email FROM Lead" -f leads.csv --bulk

# Bulk export with longer wait time
node ${CLAUDE_PLUGIN_ROOT}/skills/data-export/scripts/export.js "SELECT Id, Name FROM Contact" -f contacts.csv --bulk --wait 20

# Export with dot notation (parent fields)
node ${CLAUDE_PLUGIN_ROOT}/skills/data-export/scripts/export.js "SELECT Id, Name, Account.Name, Account.Industry FROM Contact" -f contacts-with-accounts.csv

# Export with metadata output as JSON
node ${CLAUDE_PLUGIN_ROOT}/skills/data-export/scripts/export.js "SELECT Id, Name FROM Account" -f accounts.csv --json
```

## Constructing the Export Query

When the user describes what they want to export in natural language:

1. **Identify the object** — what are they exporting? (Account, Contact, Opportunity, custom objects)
2. **Identify the fields** — what columns should the file have? Use `salesforce-cli:describe-object` skill if unsure about field API names.
3. **Identify filters** — do they want all records or a subset? Add WHERE clauses as needed.
4. **Choose the format** — CSV for spreadsheets/Excel, JSON for programmatic use.
5. **Estimate the size** — if the object may have 100k+ records, suggest `--bulk` mode.

Use the `salesforce-cli:data-query` skill to preview a small sample (`LIMIT 10`) before running a full export, especially for large datasets. This helps verify the query returns the expected fields and data.

## Output Formats

### CSV
- Comma-separated values with a header row
- Nested relationships are flattened with dot notation (e.g., `Account.Name`)
- Opens directly in Excel, Google Sheets, and other spreadsheet applications
- UTF-8 encoded

### JSON
- Array of record objects with Salesforce metadata (`attributes`) stripped
- Nested relationships preserved as objects
- Pretty-printed with 2-space indentation
- Suitable for programmatic processing or re-import

> **Note on Excel (.xlsx):** Native Excel files require external packages that are not available in this
> environment. CSV files open seamlessly in Excel and support all the same data. If the user asks for
> Excel export, use CSV format and let them know it opens directly in Excel.

## Workflow

1. **Check authentication** — run `sf-auth.js --status` to see if an org is connected.
2. **Authenticate if needed** — run `sf-auth.js` with the appropriate method.
3. **Understand the request** — determine what data to export and in what format.
4. **Look up field names** — use `salesforce-cli:describe-object` skill if unsure about API names for objects or fields.
5. **Preview the data** — optionally use `salesforce-cli:data-query` skill with a `LIMIT 10` to verify the query looks right.
6. **Determine the output path** — ask the user where to save the file, or suggest a sensible default.
7. **Choose the mode** — use `--bulk` for large datasets (100k+ records), default REST API otherwise.
8. **Run the export** — execute the export script.
9. **Present the results** — show file path, record count, and file size.

## Tips

- The format is auto-detected from the file extension: `.json` → JSON, everything else → CSV.
- Use `--format` to override auto-detection (e.g., `--output data.txt --format csv`).
- Use the API name of objects and fields, not display labels. If unsure, use the `salesforce-cli:describe-object` skill.
- Custom objects end with `__c`, custom relationships use `__r` in dot notation.
- The script automatically paginates through all results in REST API mode. No need to add LIMIT for full exports.
- For very large exports (100k+ records), use `--bulk` to avoid REST API timeout issues.
- The `--wait` flag only applies to bulk mode. Increase it for very large datasets.
- If the export returns no results, verify field names with the `salesforce-cli:describe-object` skill.
- CSV files are UTF-8 encoded. If Excel shows garbled characters, use "Import from CSV" with UTF-8 encoding.
- The `--all-rows` flag includes soft-deleted and archived records (not available in bulk mode).
