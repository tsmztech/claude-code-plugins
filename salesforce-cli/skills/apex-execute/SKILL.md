---
name: apex-execute
description: >
  Execute Anonymous Apex code against a Salesforce org. Use when the user wants to run
  Apex scripts, execute one-off operations, test Apex logic, manipulate data via Apex,
  or run admin scripts. Claude constructs the Apex code based on user intent.
  Examples: 'run anonymous apex', 'execute apex', 'run this apex code',
  'update all accounts', 'delete old tasks via apex', 'debug account data'.
argument-hint: '<description of what to execute> [--target-org <alias>]'
disable-model-invocation: true
allowed-tools: Bash, Read
---

# Execute Anonymous Apex

Execute Anonymous Apex code against a connected Salesforce org. This skill is user-invoked only — Claude constructs the Apex code based on what the user wants to accomplish, then executes it via the Salesforce CLI.

## Prerequisites

You must be authenticated to a Salesforce org before executing Apex.
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

## CRITICAL: Safety Rules for DML Operations

Before executing ANY generated Apex code, you MUST analyze it for data-modifying operations.

### DML Detection

Scan the generated code for these keywords (case-insensitive):

**DML Statements:** `insert`, `update`, `delete`, `upsert`, `undelete`, `merge`
**Database Methods:** `Database.insert`, `Database.update`, `Database.delete`, `Database.upsert`, `Database.undelete`, `Database.merge`, `Database.emptyRecycleBin`, `Database.convertLead`
**Other Mutating Operations:** `System.enqueueJob`, `System.schedule`, `System.scheduleBatch`, `EventBus.publish`, `Messaging.sendEmail`

### If DML is Detected

1. **WARN** the user that the code will modify data
2. **SHOW** the complete Apex code that will be executed
3. **DESCRIBE** exactly what will happen (e.g., "This will update the Rating field to 'Cold' on up to 10 Account records where Rating is currently null")
4. **ASK** for explicit confirmation before executing
5. Only proceed if the user confirms

### If Code is Read-Only

If the code only contains queries (`[SELECT ...]`), `System.debug()`, `Schema.describe*`, `Limits.*`, or other non-mutating operations — execute without extra confirmation.

## Usage

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/apex-execute/scripts/apex-execute.js "<Apex code>" [options]
```

### Options

- `--target-org, -o <alias>` — Target org alias or username
- `--json` — Output raw JSON from sf CLI
- `--help, -h` — Show help

## REQUIRED: Use System.debug() for All Output

Anonymous Apex has **no return channel** — it executes on the server and the only way to get data back is through `System.debug()` statements in the debug log. Without them, the code runs successfully but the user sees no output.

**You MUST include `System.debug()` calls for every value the user wants to see.** This is not optional.

### Rules

- If the user wants to see query results → wrap in `System.debug()` or loop and debug each record
- If the user wants a count → `System.debug('Count: ' + results.size());`
- If the code performs DML → `System.debug('Updated ' + records.size() + ' records');` to confirm what happened
- If the code computes a value → `System.debug('Result: ' + value);`
- **Never** generate code that only executes without any `System.debug()` — always include at least one debug statement so the user gets meaningful feedback

### Examples of Good vs Bad

```apex
// BAD — executes but user sees nothing
List<Account> accs = [SELECT Id, Name FROM Account LIMIT 5];

// GOOD — user sees the results
List<Account> accs = [SELECT Id, Name FROM Account LIMIT 5];
for (Account a : accs) {
    System.debug(a.Name);
}
System.debug('Total: ' + accs.size() + ' accounts');
```

```apex
// BAD — updates but user has no idea what happened
List<Contact> contacts = [SELECT Id, Email FROM Contact WHERE Email = null LIMIT 10];
for (Contact c : contacts) { c.Email = 'unknown@example.com'; }
update contacts;

// GOOD — user sees what happened
List<Contact> contacts = [SELECT Id, Email FROM Contact WHERE Email = null LIMIT 10];
System.debug('Found ' + contacts.size() + ' contacts with no email');
for (Contact c : contacts) { c.Email = 'unknown@example.com'; }
update contacts;
System.debug('Updated ' + contacts.size() + ' contacts');
```

## Workflow

1. **Check authentication** — run `sf-auth.js --status` to see if an org is connected
2. **Understand the user's intent** — what do they want to accomplish?
3. **Construct the Apex code** — write clean, bulkified Apex following best practices
4. **Analyze for DML** — check if the code modifies data (see Safety Rules above)
5. **If DML detected** — warn, show code, describe impact, ask for confirmation
6. **Execute** — run the script with the Apex code
7. **Present results** — show debug output, errors, or success message

## Common Patterns

### Query and Debug

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/apex-execute/scripts/apex-execute.js "List<Account> accs = [SELECT Id, Name, Industry FROM Account LIMIT 10]; for(Account a : accs) { System.debug(a.Name + ' - ' + a.Industry); }"
```

### Describe Object Fields

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/apex-execute/scripts/apex-execute.js "Schema.DescribeSObjectResult result = Account.SObjectType.getDescribe(); for(String fieldName : result.fields.getMap().keySet()) { System.debug(fieldName); }"
```

### Check Record Counts

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/apex-execute/scripts/apex-execute.js "System.debug('Accounts: ' + [SELECT COUNT() FROM Account]); System.debug('Contacts: ' + [SELECT COUNT() FROM Contact]); System.debug('Opportunities: ' + [SELECT COUNT() FROM Opportunity]);"
```

### Update Records (DML — requires confirmation)

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/apex-execute/scripts/apex-execute.js "List<Account> accs = [SELECT Id, Rating FROM Account WHERE Rating = null LIMIT 10]; for(Account a : accs) { a.Rating = 'Cold'; } update accs; System.debug('Updated ' + accs.size() + ' accounts');"
```

### Delete Records (DML — requires confirmation)

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/apex-execute/scripts/apex-execute.js "List<Task> oldTasks = [SELECT Id FROM Task WHERE Status = 'Completed' AND ActivityDate < :Date.today().addDays(-90) LIMIT 200]; delete oldTasks; System.debug('Deleted ' + oldTasks.size() + ' tasks');"
```

### Insert Records (DML — requires confirmation)

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/apex-execute/scripts/apex-execute.js "Account a = new Account(Name = 'Test Account', Industry = 'Technology'); insert a; System.debug('Created Account: ' + a.Id);"
```

### Check Governor Limits

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/apex-execute/scripts/apex-execute.js "System.debug('SOQL Queries: ' + Limits.getQueries() + '/' + Limits.getLimitQueries()); System.debug('DML Statements: ' + Limits.getDmlStatements() + '/' + Limits.getLimitDmlStatements()); System.debug('Heap Size: ' + Limits.getHeapSize() + '/' + Limits.getLimitHeapSize());"
```

### Run Against a Specific Org

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/apex-execute/scripts/apex-execute.js "System.debug('Hello from sandbox!');" --target-org mySandbox
```

## Constructing Apex from Natural Language

When the user describes what they want in plain English:

1. **Identify the operation** — read-only query, data update, record creation, deletion, admin task?
2. **Identify the objects** — which Salesforce objects are involved?
3. **Identify the fields** — use `salesforce-cli:describe-object` skill if unsure about field API names
4. **Build the Apex** — write clean, bulkified code with appropriate `System.debug()` output
5. **Add safety measures** — include LIMIT clauses on queries, use `System.debug()` to show what was affected
6. **Always include output** — add `System.debug()` statements so the user can see results

## Governor Limits Quick Reference

| Limit | Synchronous | Asynchronous |
|---|---|---|
| SOQL Queries | 100 | 200 |
| SOQL Rows Retrieved | 50,000 | 50,000 |
| DML Statements | 150 | 150 |
| DML Rows | 10,000 | 10,000 |
| Heap Size | 6 MB | 12 MB |
| CPU Time | 10,000 ms | 60,000 ms |
| Callouts | 100 | 100 |

Anonymous Apex runs in synchronous context — use the synchronous limits.

## Tips

- Always include `LIMIT` on queries to avoid hitting governor limits unexpectedly.
- Bulkify DML: collect records into a list and perform a single DML statement, never DML inside a loop.
- Use `Database.insert(records, false)` for partial success when processing multiple records.
- For large data operations, suggest using the `salesforce-cli:bulk-import` skill instead.
- If the user needs to check field names, use the `salesforce-cli:describe-object` skill first.
- When updating/deleting, always query and `System.debug()` the count first so the user knows the scope before confirming.
- Escape single quotes in strings with `\'` in Apex code.
