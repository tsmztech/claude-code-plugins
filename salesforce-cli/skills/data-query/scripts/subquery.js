#!/usr/bin/env node
/**
 * subquery.js - Run SOQL queries with parent-to-child subqueries
 *
 * Handles queries that include nested SELECT statements to fetch related
 * child records, e.g.:
 *   SELECT Id, Name, (SELECT Id, LastName FROM Contacts) FROM Account
 *
 * Supports multiple subqueries per query, subqueries with their own
 * WHERE/ORDER BY/LIMIT, and combination with parent dot notation.
 *
 * Usage:
 *   node subquery.js "<SOQL>"                              # Run subquery
 *   node subquery.js "<SOQL>" --target-org <alias>         # Specific org
 *   node subquery.js "<SOQL>" --json                       # Raw JSON output
 *   node subquery.js "<SOQL>" --flat                       # Flatten child records inline
 *   node subquery.js --help                                # Show help
 *
 * Options:
 *   --target-org, -o   Target org alias or username
 *   --json             Output raw JSON from sf CLI
 *   --csv              Output as CSV (parent fields only, child counts)
 *   --flat             Flatten child records inline instead of nested display
 *   --all-rows         Include deleted and archived records
 *   --help, -h         Show this help message
 */

const { execFileSync } = require("child_process");

// ── Parse arguments ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let soql = "";
let targetOrg = "";
let jsonOutput = false;
let csvOutput = false;
let flatOutput = false;
let allRows = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--target-org":
    case "-o":
      targetOrg = args[++i] || "";
      break;
    case "--json":
      jsonOutput = true;
      break;
    case "--csv":
      csvOutput = true;
      break;
    case "--flat":
      flatOutput = true;
      break;
    case "--all-rows":
      allRows = true;
      break;
    case "--help":
    case "-h":
      console.log(
        [
          "Usage: node subquery.js \"<SOQL>\" [options]",
          "",
          "Run a SOQL query with parent-to-child subqueries.",
          "",
          "Options:",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --json                     Output raw JSON from sf CLI",
          "  --csv                      Output as CSV (parent fields + child counts)",
          "  --flat                     Flatten child records inline",
          "  --all-rows                 Include deleted/archived records",
          "  --help, -h                 Show this help message",
          "",
          "Examples:",
          '  node subquery.js "SELECT Id, Name, (SELECT Id, LastName FROM Contacts) FROM Account LIMIT 5"',
          '  node subquery.js "SELECT Id, Name, (SELECT Id FROM Cases), (SELECT Id FROM Opportunities) FROM Account LIMIT 5"',
          '  node subquery.js "SELECT Id, Name, (SELECT Id FROM Contacts WHERE Email != null) FROM Account" --flat',
        ].join("\n")
      );
      process.exit(0);
      break;
    default:
      if (args[i].startsWith("-")) {
        die(`Unknown option: ${args[i]}`);
      }
      if (!soql) {
        soql = args[i];
      } else {
        die(`Unexpected argument: ${args[i]}`);
      }
  }
}

if (!soql) {
  die('SOQL query is required. Usage: node subquery.js "<SOQL>"');
}

// ── Execute sf CLI ──────────────────────────────────────────────────────────

const sfArgs = ["data", "query", "--query", soql, "--json"];
if (targetOrg) sfArgs.push("--target-org", targetOrg);
if (allRows) sfArgs.push("--all-rows");

console.log(`Query: ${soql}`);
if (targetOrg) console.log(`Target Org: ${targetOrg}`);
console.log();

let result;
try {
  const output = execFileSync("sf", sfArgs, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024,
  });
  result = JSON.parse(output);
} catch (err) {
  handleError(err, soql);
}

const data = result.result || result;
const records = data.records || [];
const totalSize = data.totalSize ?? records.length;
const done = data.done !== false;

// ── Raw JSON output ─────────────────────────────────────────────────────────

if (jsonOutput) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

// ── No results ──────────────────────────────────────────────────────────────

if (records.length === 0) {
  console.log("No records found.");
  console.log(`Total Size: ${totalSize}`);
  process.exit(0);
}

// ── Classify fields ─────────────────────────────────────────────────────────

// Separate scalar fields from child relationship fields.
// Must scan ALL records because a field can be null on one record but a
// subquery result object on another (e.g. Account with no Contacts vs one with).
const scalarFields = [];
const childRelFields = [];

const fieldKeys = new Set();
for (const rec of records) {
  for (const key of Object.keys(rec)) {
    if (key !== "attributes") fieldKeys.add(key);
  }
}

for (const key of fieldKeys) {
  let isChildRel = false;
  for (const rec of records) {
    const val = rec[key];
    if (val && typeof val === "object" && val.records !== undefined) {
      isChildRel = true;
      break;
    }
  }
  if (isChildRel) {
    childRelFields.push(key);
  } else {
    scalarFields.push(key);
  }
}

// ── CSV output ──────────────────────────────────────────────────────────────

if (csvOutput) {
  printCsv(records, scalarFields, childRelFields);
  process.exit(0);
}

// ── Flat output ─────────────────────────────────────────────────────────────

if (flatOutput) {
  printFlat(records, scalarFields, childRelFields);
} else {
  printNested(records, scalarFields, childRelFields);
}

console.log();
console.log(`Parent records returned: ${records.length}`);
console.log(`Total size: ${totalSize}`);
if (!done) console.log(`Note: More records available (result set not complete).`);

// ── Helpers ─────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function pad(str, len) {
  str = String(str);
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function handleError(err, query) {
  let errMsg = "";
  if (err.stdout) {
    try {
      const parsed = JSON.parse(err.stdout);
      errMsg =
        (parsed.message || "") +
        ((parsed.result || [])[0]?.message || "") +
        (parsed.name || "");
    } catch {
      // ignore parse failures
    }
  }
  if (err.stderr) {
    errMsg = errMsg || err.stderr.toString().trim();
  }
  if (errMsg) {
    console.error(`SOQL Error: ${errMsg}`);
  }
  console.error(
    `ERROR: Failed to execute subquery. Ensure you are authenticated and the SOQL is valid.`
  );
  console.error(`Query was: ${query}`);
  process.exit(1);
}

function getScalarValue(record, field) {
  const val = record[field];
  if (val && typeof val === "object" && val.attributes) {
    // Parent relationship — flatten to show key fields
    return flattenParent(val);
  }
  return formatValue(val);
}

function flattenParent(obj) {
  const parts = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key === "attributes") continue;
    if (val && typeof val === "object" && val.attributes) {
      parts.push(`${key}: {${flattenParent(val)}}`);
    } else if (val !== null && val !== undefined) {
      parts.push(`${key}: ${val}`);
    }
  }
  return parts.join(", ");
}

function formatValue(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "true" : "false";
  return String(val);
}

function csvEscape(val) {
  val = String(val);
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

// ── Nested display (default) ────────────────────────────────────────────────

function printNested(records, scalarFields, childRelFields) {
  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx];

    console.log(`=== Record ${idx + 1} ===`);

    // Print scalar/parent fields
    for (const field of scalarFields) {
      const val = getScalarValue(rec, field);
      console.log(`  ${field}: ${val}`);
    }

    // Print each child relationship
    for (const relName of childRelFields) {
      const relData = rec[relName];
      const childRecords = (relData && relData.records) || [];
      const childTotal = relData ? (relData.totalSize ?? childRecords.length) : 0;

      console.log();
      console.log(`  --- ${relName} (${childTotal} record${childTotal !== 1 ? "s" : ""}) ---`);

      if (childRecords.length === 0) {
        console.log(`    (none)`);
        continue;
      }

      // Get child columns
      const childCols = [];
      for (const key of Object.keys(childRecords[0] || {})) {
        if (key === "attributes") continue;
        childCols.push(key);
      }

      // Calculate widths
      const widths = {};
      for (const col of childCols) {
        widths[col] = col.length;
      }
      for (const cr of childRecords) {
        for (const col of childCols) {
          const val = formatValue(cr[col]);
          if (val.length > widths[col]) widths[col] = val.length;
        }
      }
      const maxColWidth = 40;
      for (const col of childCols) {
        if (widths[col] > maxColWidth) widths[col] = maxColWidth;
      }

      // Print child table
      const header = "    " + childCols.map((c) => pad(c, widths[c])).join("  ");
      console.log(header);
      console.log("    " + childCols.map((c) => "-".repeat(widths[c])).join("  "));

      for (const cr of childRecords) {
        const row =
          "    " +
          childCols
            .map((c) => {
              let val = formatValue(cr[c]);
              if (val.length > maxColWidth) val = val.slice(0, maxColWidth - 3) + "...";
              return pad(val, widths[c]);
            })
            .join("  ");
        console.log(row);
      }

      if (relData && relData.done === false) {
        console.log(`    ... more ${relName} records exist (not all fetched)`);
      }
    }

    console.log();
  }
}

// ── Flat display ────────────────────────────────────────────────────────────

function printFlat(records, scalarFields, childRelFields) {
  // For each parent record, repeat parent fields for each child combination
  // If multiple child relationships, show one relationship at a time

  for (const relName of childRelFields) {
    console.log(`=== ${relName} (flattened) ===`);
    console.log();

    // Collect all child columns
    const childColSet = new Set();
    for (const rec of records) {
      const relData = rec[relName];
      const childRecords = (relData && relData.records) || [];
      for (const cr of childRecords) {
        for (const key of Object.keys(cr)) {
          if (key !== "attributes") childColSet.add(key);
        }
      }
    }
    const childCols = Array.from(childColSet);

    // Build flat rows: parent scalar fields + child fields
    const allCols = [...scalarFields, ...childCols.map((c) => `${relName}.${c}`)];
    const flatRows = [];

    for (const rec of records) {
      const relData = rec[relName];
      const childRecords = (relData && relData.records) || [];

      if (childRecords.length === 0) {
        // Parent with no children
        const row = {};
        for (const sf of scalarFields) {
          row[sf] = getScalarValue(rec, sf);
        }
        for (const cc of childCols) {
          row[`${relName}.${cc}`] = "";
        }
        flatRows.push(row);
      } else {
        for (const cr of childRecords) {
          const row = {};
          for (const sf of scalarFields) {
            row[sf] = getScalarValue(rec, sf);
          }
          for (const cc of childCols) {
            row[`${relName}.${cc}`] = formatValue(cr[cc]);
          }
          flatRows.push(row);
        }
      }
    }

    // Print table
    const widths = {};
    for (const col of allCols) {
      widths[col] = col.length;
    }
    for (const row of flatRows) {
      for (const col of allCols) {
        const val = String(row[col] || "");
        if (val.length > widths[col]) widths[col] = val.length;
      }
    }
    const maxColWidth = 40;
    for (const col of allCols) {
      if (widths[col] > maxColWidth) widths[col] = maxColWidth;
    }

    const header = allCols.map((c) => pad(c, widths[c])).join("  ");
    console.log(header);
    console.log(allCols.map((c) => "-".repeat(widths[c])).join("  "));

    for (const row of flatRows) {
      const line = allCols
        .map((c) => {
          let val = String(row[c] || "");
          if (val.length > maxColWidth) val = val.slice(0, maxColWidth - 3) + "...";
          return pad(val, widths[c]);
        })
        .join("  ");
      console.log(line);
    }

    console.log();
  }
}

// ── CSV output ──────────────────────────────────────────────────────────────

function printCsv(records, scalarFields, childRelFields) {
  // CSV outputs parent fields + count of each child relationship
  const cols = [...scalarFields, ...childRelFields.map((r) => `${r}_count`)];

  console.log(cols.map(csvEscape).join(","));

  for (const rec of records) {
    const row = [];
    for (const sf of scalarFields) {
      row.push(csvEscape(getScalarValue(rec, sf)));
    }
    for (const relName of childRelFields) {
      const relData = rec[relName];
      const count = relData ? (relData.totalSize ?? (relData.records || []).length) : 0;
      row.push(String(count));
    }
    console.log(row.join(","));
  }
}
