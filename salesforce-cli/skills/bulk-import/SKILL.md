---
name: bulk-import
description: >
  Bulk insert, upsert, or update records in a Salesforce org from a CSV file. Supports
  bulk insert (create new records), bulk upsert (insert-or-update using an external ID
  field), and bulk update (modify existing records by Id column). Uses the Salesforce
  Bulk API v2 via sf CLI for efficient large-scale data operations.
  Examples: 'bulk import accounts from CSV', 'bulk upsert contacts', 'import data from file',
  'batch insert leads', 'bulk update opportunities from spreadsheet'.
argument-hint: <ObjectName> --file <csv-path> [--operation insert|upsert|update] [--target-org <alias>]
allowed-tools: Bash, Read, Skill(salesforce-cli:describe-object)
---

# Bulk Import

Bulk insert, upsert, or update records from a CSV file using the Salesforce Bulk API v2.
Designed for loading large datasets efficiently.

## IMPORTANT — Safety Rules

Bulk operations modify many records at once. Follow these rules strictly:

1. **Always preview before executing.** The script displays the first 3 rows and total row count.
   Confirm with the user before proceeding.
2. **Warn on large datasets.** If the CSV has more than 1000 rows, explicitly warn the user about
   the scale of the operation.
3. **Recommend sandbox first.** Suggest running bulk operations against a sandbox or developer org
   before production.
4. **Verify CSV headers.** Ensure the CSV header row uses exact Salesforce API field names, not
   display labels. Use the `salesforce-cli:describe-object` skill to verify.

## Prerequisites

You must be authenticated to a Salesforce org before running bulk operations.
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

## Field Name Resolution

Before running a bulk import, verify that CSV column headers match Salesforce API field names:

1. **Use `salesforce-cli:describe-object`** to look up the correct API names for the target object.
2. **Check field types** — ensure CSV values match expected types (text, number, date, picklist).
3. **Check required fields** — for insert operations, ensure all required fields (nillable: false,
   createable: true) are present in the CSV.
4. **For custom objects**, verify the object exists using the `salesforce-cli:search-objects` skill.

Example:
```bash
# Look up field API names for Account
/describe-object Account

# Check a specific field's type and picklist values
/describe-object Account --field Industry
```

## Operations

| Operation | Description | SF CLI Command | Requires |
|---|---|---|---|
| `insert` | Create new records | `sf data import bulk` | CSV with field columns (no Id) |
| `upsert` | Insert or update by external ID | `sf data upsert bulk` | CSV + `--external-id` field |
| `update` | Update existing records by Id | `sf data upsert bulk --external-id Id` | CSV with `Id` column |

## Usage

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bulk-import/scripts/bulk-import.js <ObjectName> --file <csv-path> [options]
```

### Options

| Option | Short | Description | Default |
|---|---|---|---|
| `--file` | `-f` | Path to CSV file (required) | — |
| `--operation` | | `insert`, `upsert`, or `update` | `insert` |
| `--external-id` | `-e` | External ID field for upsert | `Id` for update |
| `--wait` | `-w` | Minutes to wait for job completion | `10` |
| `--target-org` | `-o` | Target org alias or username | default org |
| `--json` | | Output raw JSON from sf CLI | — |
| `--help` | `-h` | Show help | — |

## Examples

```bash
# Bulk insert Accounts from CSV
node ${CLAUDE_PLUGIN_ROOT}/skills/bulk-import/scripts/bulk-import.js Account --file accounts.csv

# Bulk upsert with external ID
node ${CLAUDE_PLUGIN_ROOT}/skills/bulk-import/scripts/bulk-import.js Account --file accounts.csv --operation upsert --external-id External_Id__c

# Bulk update (CSV must contain an Id column)
node ${CLAUDE_PLUGIN_ROOT}/skills/bulk-import/scripts/bulk-import.js Contact --file contacts.csv --operation update

# Bulk insert with longer wait time and specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/bulk-import/scripts/bulk-import.js Account --file accounts.csv --wait 20 --target-org myDevOrg

# Get raw JSON response
node ${CLAUDE_PLUGIN_ROOT}/skills/bulk-import/scripts/bulk-import.js Account --file accounts.csv --json
```

## CSV Format

The CSV file must:
- Have a header row with exact Salesforce API field names
- Use comma as the delimiter
- Use UTF-8 encoding

### Example: Insert CSV (no Id column)
```csv
Name,Industry,AnnualRevenue,BillingCity
Acme Corp,Technology,5000000,San Francisco
Beta Inc,Finance,2000000,New York
Gamma LLC,Healthcare,1000000,Chicago
```

### Example: Update CSV (must include Id column)
```csv
Id,Industry,AnnualRevenue
001XX000003ABCDE,Finance,6000000
001XX000003FGHIJ,Technology,3000000
```

### Example: Upsert CSV (must include external ID column)
```csv
External_Id__c,Name,Industry,AnnualRevenue
EXT-001,Acme Corp,Technology,5000000
EXT-002,Beta Inc,Finance,2000000
EXT-003,Gamma LLC,Healthcare,1000000
```

## Workflow

1. **Check authentication** — run `sf-auth.js --status` to see if an org is connected.
2. **Authenticate if needed** — run `sf-auth.js` with the appropriate method.
3. **Verify CSV format** — read the CSV file and check that headers are valid API field names
   using the `salesforce-cli:describe-object` skill.
4. **Determine the operation** — insert (new records), upsert (by external ID), or update (by Id).
5. **Confirm with the user** — show the file path, row count, first few rows, operation type, and
   target object. Wait for explicit confirmation.
6. **Run the import** — execute the bulk-import script.
7. **Present the results** — show job status, records processed, records failed, and any error details.

## Output

The script displays:
- **CSV Preview**: Header + first 3 data rows + total row count
- **Job Result**: Job ID, status, records processed/failed
- **Failed Records**: Error details for any records that failed

With `--json`: Raw Salesforce Bulk API response.

## Tips

- CSV headers must exactly match Salesforce API field names — use `salesforce-cli:describe-object` to verify.
- Custom objects end with `__c`, custom fields end with `__c`.
- For update operations, the CSV must include an `Id` column with valid 15 or 18-character record Ids.
- For upsert operations, the external ID field must be marked as `externalId: true` on the object.
  Use `/describe-object <Object>` to find external ID fields.
- The `--wait` flag controls how long to poll for job completion. Default is 10 minutes. Increase
  for very large datasets (10,000+ rows).
- If the job times out, the import is still running in Salesforce. Check the job status in
  Setup > Bulk Data Load Jobs, or query the job ID via the Bulk API.
- Maximum 150 million records per 24-hour rolling period (Salesforce Bulk API limit).
- For best performance, keep CSV files under 100MB and batch into multiple files if larger.
