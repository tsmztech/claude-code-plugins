---
name: data-query
description: >
  Run SOQL (Salesforce Object Query Language) queries against a Salesforce org. Supports standard
  SELECT queries, child-to-parent dot notation (Contact.Account.Name), parent-to-child
  subqueries (SELECT Id, (SELECT Id FROM Contacts) FROM Account), COUNT queries, and all SOQL
  clauses including WHERE, ORDER BY, LIMIT, OFFSET, USING SCOPE, WITH, TYPEOF, FIELDS(),
  FORMAT(), toLabel(), DISTANCE(), and GEOLOCATION(). Use when the user wants to query Salesforce
  data, count records, run SOQL, or explore data relationships. For aggregate queries (SUM, AVG,
  MIN, MAX, GROUP BY), use the `salesforce-cli:aggregate-query` skill instead.
  Examples: 'query all accounts', 'count contacts', 'run SOQL',
  'find accounts near a location', 'SELECT Id FROM Account WHERE Name LIKE "Acme%"'.
argument-hint: '<SOQL query or natural language> [--target-org <alias>]'
allowed-tools: Bash, Read
---

# SOQL Query

Run any SOQL query against a connected Salesforce org. This skill handles all query types
through dedicated scripts optimized for each pattern.

## Prerequisites

You must be authenticated to a Salesforce org before running queries.
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

## Query Types & Scripts

This skill provides **three scripts**, one for each query pattern. Choose the right one based on what the user needs.

> **Note**: For aggregate queries (SUM, AVG, MIN, MAX with GROUP BY / ROLLUP / CUBE / HAVING), use the `salesforce-cli:aggregate-query` skill instead.

---

### 1. Standard Query (includes child-to-parent dot notation)

Use for normal SELECT queries, including traversing parent relationships via dot notation.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "<SOQL>" [options]
```

#### Examples

```bash
# Simple query
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name FROM Account LIMIT 10"

# With WHERE clause
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name FROM Account WHERE Industry = 'Technology' AND AnnualRevenue > 1000000"

# Child-to-parent dot notation (up to 5 levels)
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name, Account.Name, Account.Owner.Name FROM Contact WHERE Account.Industry = 'Finance'"

# Custom relationship dot notation (__r instead of __c)
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Broker__r.Name, Broker__r.Email FROM Property__c"

# ORDER BY, LIMIT, OFFSET
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name, CreatedDate FROM Account ORDER BY CreatedDate DESC LIMIT 20 OFFSET 10"

# Date literals
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name FROM Opportunity WHERE CloseDate = LAST_N_DAYS:30"

# LIKE operator with wildcards
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name FROM Account WHERE Name LIKE 'Acme%'"

# IN operator
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name FROM Account WHERE Industry IN ('Technology', 'Finance', 'Healthcare')"

# INCLUDES/EXCLUDES for multi-select picklists
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name FROM Lead WHERE LeadSource INCLUDES ('Web', 'Phone')"

# USING SCOPE
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name FROM Account USING SCOPE Mine"

# WITH SECURITY_ENFORCED
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name FROM Account WITH SECURITY_ENFORCED"

# TYPEOF for polymorphic relationships
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT TYPEOF What WHEN Account THEN Name, Phone WHEN Opportunity THEN Name, Amount ELSE Name END FROM Event"

# FIELDS() function
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT FIELDS(ALL) FROM Account LIMIT 200"
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT FIELDS(STANDARD) FROM Contact"
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT FIELDS(CUSTOM) FROM Opportunity LIMIT 200"

# FORMAT() and toLabel()
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, FORMAT(Amount), toLabel(StageName) FROM Opportunity LIMIT 5"

# convertCurrency() for multi-currency orgs
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, convertCurrency(Amount) FROM Opportunity"

# DISTANCE() and GEOLOCATION() for location-based queries
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name, BillingLatitude, BillingLongitude FROM Account WHERE DISTANCE(BillingAddress, GEOLOCATION(37.7749, -122.4194), 'mi') < 50 ORDER BY DISTANCE(BillingAddress, GEOLOCATION(37.7749, -122.4194), 'mi')"

# FOR VIEW / FOR REFERENCE / FOR UPDATE
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name FROM Account FOR VIEW"

# Against a specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Id, Name FROM Account LIMIT 5" --target-org myDevOrg
```

---

### 2. Count Query

Use for COUNT() queries that return a single number or grouped counts.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/count.js "<SOQL>" [options]
```

#### Examples

```bash
# Simple count
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/count.js "SELECT COUNT() FROM Account"

# Count with WHERE
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/count.js "SELECT COUNT() FROM Contact WHERE AccountId != null"

# COUNT(fieldName) - counts non-null values
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/count.js "SELECT COUNT(Id) FROM Opportunity WHERE StageName = 'Closed Won'"

# COUNT_DISTINCT
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/count.js "SELECT COUNT_DISTINCT(AccountId) FROM Contact"

# Count grouped by field
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/count.js "SELECT Industry, COUNT(Id) FROM Account GROUP BY Industry"

# Count with HAVING
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/count.js "SELECT Industry, COUNT(Id) cnt FROM Account GROUP BY Industry HAVING COUNT(Id) > 5"

# Against a specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/count.js "SELECT COUNT() FROM Account" --target-org myDevOrg
```

---

### 3. Subquery (Parent-to-Child / Nested Query)

Use for queries that include inner SELECT statements to fetch related child records.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/subquery.js "<SOQL>" [options]
```

#### Examples

```bash
# Basic parent-to-child subquery
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/subquery.js "SELECT Id, Name, (SELECT Id, LastName, Email FROM Contacts) FROM Account LIMIT 5"

# Multiple subqueries on same parent
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/subquery.js "SELECT Id, Name, (SELECT Id, Subject FROM Cases), (SELECT Id, Name FROM Opportunities) FROM Account LIMIT 5"

# Subquery with WHERE on both parent and child
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/subquery.js "SELECT Id, Name, (SELECT Id, LastName FROM Contacts WHERE Email != null) FROM Account WHERE Industry = 'Technology'"

# Subquery with ORDER BY and LIMIT on child
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/subquery.js "SELECT Id, Name, (SELECT Id, Amount, CloseDate FROM Opportunities ORDER BY CloseDate DESC LIMIT 3) FROM Account LIMIT 10"

# Custom object relationships (use __r plural relationship name)
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/subquery.js "SELECT Id, Name, (SELECT Id, Name FROM Properties__r) FROM Broker__c"

# Deep: subquery combined with parent dot notation
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/subquery.js "SELECT Id, Name, Owner.Name, (SELECT Id, LastName, Account.Name FROM Contacts) FROM Account LIMIT 5"

# Against a specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/subquery.js "SELECT Id, Name, (SELECT Id FROM Contacts) FROM Account LIMIT 5" --target-org myDevOrg
```

## How to Choose the Right Script

| User wants... | Script | Key indicator |
|---|---|---|
| Fetch records / fields / data | `query.js` | Normal SELECT, dot notation, FIELDS(), TYPEOF |
| Count records | `count.js` | SELECT COUNT() or COUNT(field) |
| Summarize / aggregate data | Use `salesforce-cli:aggregate-query` skill | SUM, AVG, MIN, MAX with GROUP BY |
| Fetch parent + related child records | `subquery.js` | Inner SELECT inside parentheses |

> **Tip**: If a query has both aggregate functions AND subqueries, it's invalid SOQL — Salesforce doesn't support that combination. If a COUNT query also has GROUP BY with other aggregates, use the `salesforce-cli:aggregate-query` skill instead.

## Constructing SOQL from Natural Language

When the user describes what they want in plain English, build the SOQL query for them:

1. **Identify the object** — what are they querying? (Account, Contact, Opportunity, custom objects)
2. **Identify the fields** — what data do they want? Use `salesforce-cli:describe-object` skill if unsure about field names.
3. **Identify filters** — WHERE conditions, date ranges, picklist values
4. **Identify sorting** — ORDER BY fields and direction
5. **Identify limits** — how many records?
6. **Identify grouping** — any aggregation needed? If so, use `salesforce-cli:aggregate-query` skill.
7. **Identify relationships** — parent fields (dot notation) or child records (subquery)?

### SOQL Complete Syntax Reference

```
SELECT fieldList | function(field) | (subquery) | TYPEOF field ...
FROM objectType
  [USING SCOPE filterScope]
  [WHERE conditionExpression]
  [WITH [DATA CATEGORY] filterExpression]
  [GROUP BY fieldGroupByList | ROLLUP(...) | CUBE(...)]
  [HAVING havingConditionExpression]
  [ORDER BY fieldOrderByList [ASC|DESC] [NULLS FIRST|LAST]]
  [LIMIT numberOfRows]
  [OFFSET numberOfRows]
  [FOR VIEW | FOR REFERENCE | FOR UPDATE]
```

### WHERE Clause Operators

| Operator | Description | Example |
|---|---|---|
| `=` | Equals | `Name = 'Acme'` |
| `!=` | Not equals | `Status != 'Closed'` |
| `<`, `>`, `<=`, `>=` | Comparison | `Amount > 10000` |
| `LIKE` | Wildcard match (`%` = any chars, `_` = one char) | `Name LIKE 'Acme%'` |
| `IN` | In set | `Industry IN ('Tech', 'Finance')` |
| `NOT IN` | Not in set | `Status NOT IN ('Closed', 'Lost')` |
| `INCLUDES` | Multi-select picklist contains | `Tags INCLUDES ('VIP')` |
| `EXCLUDES` | Multi-select picklist excludes | `Tags EXCLUDES ('Spam')` |
| `AND`, `OR`, `NOT` | Logical operators | `A = 1 AND (B = 2 OR C = 3)` |

### Date Literals

| Literal | Description |
|---|---|
| `TODAY`, `YESTERDAY`, `TOMORROW` | Specific days |
| `THIS_WEEK`, `LAST_WEEK`, `NEXT_WEEK` | Week ranges |
| `THIS_MONTH`, `LAST_MONTH`, `NEXT_MONTH` | Month ranges |
| `THIS_QUARTER`, `LAST_QUARTER`, `NEXT_QUARTER` | Quarter ranges |
| `THIS_YEAR`, `LAST_YEAR`, `NEXT_YEAR` | Year ranges |
| `THIS_FISCAL_QUARTER`, `LAST_FISCAL_QUARTER`, `NEXT_FISCAL_QUARTER` | Fiscal quarter ranges |
| `THIS_FISCAL_YEAR`, `LAST_FISCAL_YEAR`, `NEXT_FISCAL_YEAR` | Fiscal year ranges |
| `LAST_90_DAYS`, `NEXT_90_DAYS` | 90-day windows |
| `LAST_N_DAYS:n`, `NEXT_N_DAYS:n` | Last/next N days |
| `LAST_N_WEEKS:n`, `NEXT_N_WEEKS:n` | Last/next N weeks |
| `LAST_N_MONTHS:n`, `NEXT_N_MONTHS:n` | Last/next N months |
| `LAST_N_QUARTERS:n`, `NEXT_N_QUARTERS:n` | Last/next N quarters |
| `LAST_N_YEARS:n`, `NEXT_N_YEARS:n` | Last/next N years |
| `LAST_N_FISCAL_QUARTERS:n`, `NEXT_N_FISCAL_QUARTERS:n` | Last/next N fiscal quarters |
| `LAST_N_FISCAL_YEARS:n`, `NEXT_N_FISCAL_YEARS:n` | Last/next N fiscal years |

### USING SCOPE Options

`Everything`, `Mine`, `Queue`, `Delegated`, `MyTerritory`, `MyTeamTerritory`, `Team`

### Special Functions

| Function | Purpose | Example |
|---|---|---|
| `FIELDS(ALL)` | All fields (requires LIMIT ≤ 200) | `SELECT FIELDS(ALL) FROM Account LIMIT 200` |
| `FIELDS(STANDARD)` | All standard fields | `SELECT FIELDS(STANDARD) FROM Account` |
| `FIELDS(CUSTOM)` | All custom fields (requires LIMIT ≤ 200) | `SELECT FIELDS(CUSTOM) FROM Account LIMIT 200` |
| `FORMAT(field)` | Locale-formatted value | `SELECT FORMAT(Amount) FROM Opportunity` |
| `toLabel(field)` | Translated picklist label | `SELECT toLabel(Status) FROM Case` |
| `convertCurrency(field)` | Convert to user's currency | `SELECT convertCurrency(Amount) FROM Opportunity` |
| `convertTimezone(field)` | Convert timezone (in GROUP BY) | `GROUP BY convertTimezone(CreatedDate)` |
| `DISTANCE(loc, GEOLOCATION(lat,lng), unit)` | Distance calculation | `WHERE DISTANCE(BillingAddress, GEOLOCATION(37.7,-122.4), 'mi') < 50` |
| `GEOLOCATION(lat, lng)` | Fixed location point | Used with DISTANCE() |

## Workflow

1. **Check authentication** — run `sf-auth.js --status` to see if an org is connected.
2. **Authenticate if needed** — run `sf-auth.js` with the appropriate method.
3. **Understand the request** — determine query type and pick the right script.
4. **Build the SOQL** — if user gives natural language, construct the SOQL. Use `salesforce-cli:describe-object` skill to look up field names if needed.
5. **Run the query** — execute the appropriate script with the SOQL string.
6. **Present the results** — format the output clearly for the user. Summarize large result sets.

## Output

All scripts return:
- **Table format** (default): Aligned columns for easy reading
- **JSON format** (`--json`): Raw Salesforce API response
- **CSV format** (`--csv`): Comma-separated values for export

Additional info displayed:
- Total records returned / total available
- Whether more records exist (hasMore indicator)
- Query execution metadata

## Tips

- Always wrap the SOQL string in double quotes when passing to scripts.
- Use the API name of objects and fields, not display labels.
- Custom objects end with `__c`, custom relationships use `__r` in dot notation.
- For parent-to-child subqueries, use the **plural relationship name** (e.g., `Contacts`, `Opportunities`, `Cases`). For custom objects, use the relationship name with `__r` (e.g., `Properties__r`).
- `FIELDS(ALL)` and `FIELDS(CUSTOM)` require `LIMIT` ≤ 200.
- `TYPEOF` cannot be used with aggregate functions or GROUP BY.
- You can combine dot notation with subqueries in the same query.
- Maximum 20 subqueries per query, 55 child-to-parent relationships, 5 levels of dot notation.
- If the query returns no results, suggest checking field names with the `salesforce-cli:describe-object` skill.
- `USING SCOPE` is useful for filtering to records the user owns (`Mine`) or their team's records.
- `FOR UPDATE` locks records — use with caution and only when the user explicitly needs it.
