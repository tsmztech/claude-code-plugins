---
name: dml-operations
description: >
  Insert, update, and upsert single records in a Salesforce org using field=value pairs.
  Handles insert (create new records), update (modify existing records by Id), and upsert
  (insert-or-update using an external ID field). Does NOT support delete operations.
  For bulk operations from CSV files, use the salesforce-cli:bulk-import skill instead.
  Examples: 'insert an Account', 'update opportunity stage', 'upsert a contact by external ID',
  'create a new Case record', 'change account industry'.
argument-hint: '<operation> <Object> [field=value pairs] [--target-org <alias>]'
allowed-tools: Bash, Read, Skill(salesforce-cli:describe-object)
---

# DML Operations

Insert, update, and upsert single records in a connected Salesforce org. This skill provides
three scripts for different DML patterns: insert, update by Id, and upsert by external ID.

> **This skill does NOT support delete operations.**
> **For bulk operations from CSV files**, use the `salesforce-cli:bulk-import` skill.

## IMPORTANT — Safety Rules

DML operations modify live data in Salesforce. Follow these rules strictly:

1. **Always confirm before executing.** Before running ANY DML script, repeat back to the user:
   the operation type, the target object, and the exact field values. Wait for explicit confirmation.
2. **Never run DML speculatively.** Every execution must be intentional and confirmed by the user.
3. **Recommend sandbox first.** When possible, suggest the user run DML operations against a
   sandbox or developer org before production.

## Prerequisites

You must be authenticated to a Salesforce org before running DML operations.
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

Before executing any DML operation, always verify field API names using the `salesforce-cli:describe-object` skill:

1. **When the user provides natural language field names** (e.g., "phone number", "annual revenue"),
   use `salesforce-cli:describe-object` to resolve them to the correct API names (e.g., `Phone`, `AnnualRevenue`).
2. **Check required fields** — use `salesforce-cli:describe-object` to see which fields are `nillable: false` and
   `createable: true` (for insert) or `updateable: true` (for update). The insert will fail if
   required fields are missing.
3. **Verify picklist values** — if the user wants to set a picklist field, use `salesforce-cli:describe-object`
   with `--field <fieldName>` to see valid picklist values.
4. **Check field types** — ensure the user's value matches the field type (e.g., don't pass a string
   to a number field).
5. **For custom objects**, verify the object exists using `salesforce-cli:search-objects` skill before attempting DML.

Example:
```bash
# Look up field API names for Account
/describe-object Account

# Check picklist values for a specific field
/describe-object Account --field Industry
```

## Operations & Scripts

| User wants... | Script | Key indicator |
|---|---|---|
| Create a new record | `insert.js` | "insert", "create", "add", "new" |
| Update an existing record by Id | `update.js` | "update", "change", "modify" + record Id |
| Upsert a single record by external ID | `upsert.js` | "upsert" + external ID field |

---

### 1. Insert (Single Record)

Create a new record in a Salesforce object.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/insert.js <ObjectName> --values "<field=value pairs>" [options]
```

#### Examples

```bash
# Insert an Account
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/insert.js Account --values "Name='Acme Corp' Industry='Technology'"

# Insert a Contact
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/insert.js Contact --values "LastName='Smith' Email='smith@example.com' AccountId='001XX000003ABCDE'"

# Insert with specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/insert.js Account --values "Name='Test Account'" --target-org myDevOrg

# Insert and get raw JSON response
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/insert.js Account --values "Name='Test'" --json
```

---

### 2. Update (Single Record by Id)

Update an existing record using its 15 or 18-character Salesforce record Id.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/update.js <ObjectName> --record-id <Id> --values "<field=value pairs>" [options]
```

#### Examples

```bash
# Update an Account's industry
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/update.js Account --record-id 001XX000003ABCDE --values "Industry='Finance'"

# Update multiple fields on a Contact
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/update.js Contact -i 003XX000004FGHIJ -v "Email='new@example.com' Phone='555-9876'"

# Update an Opportunity stage and amount
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/update.js Opportunity -i 006XX000005KLMNO -v "StageName='Closed Won' Amount=50000"

# Update with specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/update.js Account -i 001XX000003ABCDE -v "Name='New Name'" --target-org myDevOrg
```

---

### 3. Upsert (Single Record by External ID)

Insert a new record if no match exists on the external ID field, or update the existing record
if a match is found. Uses the Salesforce REST API.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/upsert.js <ObjectName> --external-id <field> --external-id-value <value> --values "<field=value pairs>" [options]
```

#### Examples

```bash
# Upsert an Account by custom external ID
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/upsert.js Account --external-id External_Id__c --external-id-value EXT-001 --values "Name='Acme Corp' Industry='Technology'"

# Upsert a Contact by Email (if Email is an external ID field)
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/upsert.js Contact -e Email --external-id-value smith@example.com -v "LastName='Smith' Phone='555-1234'"

# Upsert with specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/upsert.js Account -e External_Id__c --external-id-value EXT-001 -v "Name='Acme'" --target-org myDevOrg

# Upsert and get raw JSON response
node ${CLAUDE_PLUGIN_ROOT}/skills/dml-operations/scripts/upsert.js Account -e External_Id__c --external-id-value EXT-001 -v "Name='Acme'" --json
```

> **Tip**: To find which fields are marked as external ID on an object, use:
> `/describe-object <ObjectName>` and look for fields with `externalId: true`.

## Constructing DML from Natural Language

When the user describes what they want in plain English, follow this process:

1. **Identify the operation** — are they creating, updating, or upserting?
2. **Identify the object** — which Salesforce object? Use `salesforce-cli:search-objects` skill if unsure.
3. **Resolve field names** — use `salesforce-cli:describe-object` skill to find the correct API names for the
   fields the user mentions. NEVER guess field names.
4. **Validate values** — check field types and picklist values via `salesforce-cli:describe-object`.
5. **Confirm with the user** — show the exact operation, object, and field=value pairs before executing.

## Workflow

1. **Check authentication** — run `sf-auth.js --status` to see if an org is connected.
2. **Authenticate if needed** — run `sf-auth.js` with the appropriate method.
3. **Resolve field names** — use `salesforce-cli:describe-object` to look up API names for fields the user mentions.
4. **Understand the request** — determine operation type and pick the right script.
5. **Confirm with the user** — show the exact command that will be executed. Wait for confirmation.
6. **Run the operation** — execute the appropriate script.
7. **Present the results** — show the record Id, success/failure status, and any errors.

## Output

All scripts return:
- **Default format**: Summary with record Id, object name, operation details
- **JSON format** (`--json`): Raw Salesforce API response

## Tips

- Always use Salesforce API field names, not display labels. Use `salesforce-cli:describe-object` to find them.
- Custom objects end with `__c` (e.g., `Property__c`).
- Custom fields end with `__c` (e.g., `External_Id__c`).
- For `--values`, wrap the entire string in double quotes and individual values in single quotes:
  `--values "Name='Acme Corp' Industry='Technology'"`.
- Unquoted numeric values are passed as numbers: `Amount=50000`.
- Boolean values: `IsActive=true` or `IsActive=false`.
- Null values: `Description=null`.
- The upsert script uses the Salesforce REST API (default v62.0). Use `--api-version` to override.
- If an insert fails with "required field missing", use `salesforce-cli:describe-object` to check which fields
  are required (nillable: false, createable: true).
- Record Ids are 15 or 18 alphanumeric characters. Both formats are accepted.
- For bulk operations from CSV files, use the `salesforce-cli:bulk-import` skill instead.
