---
name: aggregate-query
description: >
  Run SOQL aggregate queries against a Salesforce org. Supports aggregate functions (SUM, AVG, MIN,
  MAX, COUNT) with GROUP BY, GROUP BY ROLLUP, GROUP BY CUBE, HAVING, and date/time grouping
  functions (CALENDAR_YEAR, CALENDAR_MONTH, etc). Use when the user wants to summarize, total,
  average, or group Salesforce data.
  Examples: 'get opportunities grouped by stage', 'total revenue by industry', 'average deal size',
  'sum amount by stage', 'monthly opportunity totals', 'rollup by lead source'.
argument-hint: '<SOQL aggregate query or natural language> [--target-org <alias>]'
allowed-tools: Bash, Read
---

# SOQL Aggregate Query

Run aggregate SOQL queries against a connected Salesforce org. This skill handles queries with
aggregate functions (SUM, AVG, MIN, MAX, COUNT) combined with GROUP BY, ROLLUP, CUBE, and HAVING.

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

## Usage

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "<SOQL>" [options]
```

## Examples

```bash
# SUM
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "SELECT StageName, SUM(Amount) FROM Opportunity GROUP BY StageName"

# AVG
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "SELECT Industry, AVG(AnnualRevenue) FROM Account GROUP BY Industry"

# MIN / MAX
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "SELECT StageName, MIN(Amount), MAX(Amount) FROM Opportunity GROUP BY StageName"

# Multiple aggregate functions
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "SELECT StageName, COUNT(Id), SUM(Amount), AVG(Amount), MIN(CloseDate), MAX(CloseDate) FROM Opportunity GROUP BY StageName"

# GROUP BY ROLLUP (hierarchical subtotals + grand total)
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "SELECT LeadSource, Rating, COUNT(Id) FROM Lead GROUP BY ROLLUP(LeadSource, Rating)"

# GROUP BY CUBE (all-combination subtotals)
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "SELECT Type, BillingState, COUNT(Id) FROM Account GROUP BY CUBE(Type, BillingState)"

# HAVING clause
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "SELECT StageName, SUM(Amount) total FROM Opportunity GROUP BY StageName HAVING SUM(Amount) > 100000"

# HAVING with aggregate comparison
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "SELECT AccountId, COUNT(Id) FROM Contact GROUP BY AccountId HAVING COUNT(Id) >= 3"

# GROUP BY with ORDER BY aggregate alias
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "SELECT StageName, SUM(Amount) total FROM Opportunity GROUP BY StageName ORDER BY SUM(Amount) DESC"

# Calendar functions in GROUP BY
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "SELECT CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate), SUM(Amount) FROM Opportunity GROUP BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate) ORDER BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)"

# Against a specific org
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "SELECT StageName, SUM(Amount) FROM Opportunity GROUP BY StageName" --target-org myDevOrg
```

## Aggregate Functions Reference

| Function | Description | Example |
|---|---|---|
| `COUNT()` | Count all rows | `SELECT COUNT() FROM Account` |
| `COUNT(field)` | Count non-null values | `SELECT COUNT(Id) FROM Contact` |
| `COUNT_DISTINCT(field)` | Count unique non-null values | `SELECT COUNT_DISTINCT(AccountId) FROM Contact` |
| `SUM(field)` | Sum of numeric field | `SELECT SUM(Amount) FROM Opportunity` |
| `AVG(field)` | Average of numeric field | `SELECT AVG(AnnualRevenue) FROM Account` |
| `MIN(field)` | Minimum value | `SELECT MIN(Amount) FROM Opportunity` |
| `MAX(field)` | Maximum value | `SELECT MAX(CloseDate) FROM Opportunity` |
| `GROUPING(field)` | Distinguishes subtotal rows in ROLLUP/CUBE | `SELECT GROUPING(Type), COUNT(Id) FROM Account GROUP BY ROLLUP(Type)` |

## GROUP BY Variants

| Variant | Description |
|---|---|
| `GROUP BY field1, field2` | Standard grouping |
| `GROUP BY ROLLUP(field1, field2)` | Hierarchical subtotals + grand total |
| `GROUP BY CUBE(field1, field2)` | All-combination subtotals |

## Date/Time Functions (for GROUP BY)

`CALENDAR_MONTH()`, `CALENDAR_QUARTER()`, `CALENDAR_YEAR()`, `DAY_IN_MONTH()`, `DAY_IN_WEEK()`, `DAY_IN_YEAR()`, `DAY_ONLY()`, `FISCAL_MONTH()`, `FISCAL_QUARTER()`, `FISCAL_YEAR()`, `HOUR_IN_DAY()`, `WEEK_IN_MONTH()`, `WEEK_IN_YEAR()`, `convertTimezone()`

## Constructing Aggregate SOQL from Natural Language

When the user describes what they want in plain English:

1. **Identify the object** — what are they summarizing? (Account, Opportunity, Contact, custom objects)
2. **Identify the aggregate** — SUM, AVG, MIN, MAX, COUNT? Multiple?
3. **Identify the grouping** — GROUP BY which field(s)? Need ROLLUP or CUBE?
4. **Identify filters** — WHERE conditions before aggregation, HAVING conditions after
5. **Identify sorting** — ORDER BY aggregate result or grouping field?
6. **Identify field names** — use `salesforce-cli:describe-object` skill if unsure about field API names

## Workflow

1. **Check authentication** — run `sf-auth.js --status` to see if an org is connected.
2. **Authenticate if needed** — run `sf-auth.js` with the appropriate method.
3. **Understand the request** — determine the aggregate functions and grouping needed.
4. **Build the SOQL** — if user gives natural language, construct the SOQL. Use `salesforce-cli:describe-object` skill to look up field names if needed.
5. **Run the query** — execute the aggregate script with the SOQL string.
6. **Present the results** — format the output clearly for the user. Summarize findings.

## Output

The script returns:
- **Table format** (default): Aligned columns with numeric right-alignment for easy reading
- **JSON format** (`--json`): Raw Salesforce API response
- **CSV format** (`--csv`): Comma-separated values for export

Additional info displayed:
- Rows returned / total size
- ROLLUP/CUBE notes when applicable (rows with empty grouping fields are subtotals)

## Tips

- Always wrap the SOQL string in double quotes when passing to the script.
- Use the API name of objects and fields, not display labels.
- Custom objects end with `__c`.
- `HAVING` filters on aggregate results (after grouping), `WHERE` filters on rows (before grouping).
- ROLLUP produces subtotals hierarchically; CUBE produces all-combination subtotals.
- You can use calendar/fiscal date functions in GROUP BY to aggregate by time periods.
- `GROUPING()` returns 1 for subtotal rows and 0 for detail rows in ROLLUP/CUBE results.
- If the query returns no results, suggest checking field names with the `salesforce-cli:describe-object` skill.
- For simple `COUNT()` without other aggregates, consider using the `salesforce-cli:data-query` skill's count script instead.
