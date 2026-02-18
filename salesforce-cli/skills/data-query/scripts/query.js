#!/usr/bin/env node
/**
 * query.js - Run a standard SOQL query against a Salesforce org
 *
 * Handles normal SELECT queries including child-to-parent dot notation,
 * TYPEOF, FIELDS(), FORMAT(), toLabel(), DISTANCE(), GEOLOCATION(),
 * USING SCOPE, WITH, FOR VIEW/REFERENCE/UPDATE, and all WHERE operators.
 *
 * Usage:
 *   node query.js "<SOQL>"                              # Run a SOQL query
 *   node query.js "<SOQL>" --target-org <alias>         # Specific org
 *   node query.js "<SOQL>" --json                       # Raw JSON output
 *   node query.js "<SOQL>" --csv                        # CSV output
 *   node query.js "<SOQL>" --all-rows                   # Include deleted/archived
 *   node query.js --help                                # Show help
 *
 * Options:
 *   --target-org, -o   Target org alias or username
 *   --json             Output raw JSON from sf CLI
 *   --csv              Output as CSV
 *   --all-rows         Include deleted and archived records (queryAll)
 *   --help, -h         Show this help message
 */

const { execFileSync } = require("child_process");

// ── Parse arguments ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let soql = "";
let targetOrg = "";
let jsonOutput = false;
let csvOutput = false;
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
    case "--all-rows":
      allRows = true;
      break;
    case "--help":
    case "-h":
      console.log(
        [
          "Usage: node query.js \"<SOQL>\" [options]",
          "",
          "Run a standard SOQL query against a Salesforce org.",
          "",
          "Options:",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --json                     Output raw JSON from sf CLI",
          "  --csv                      Output as CSV",
          "  --all-rows                 Include deleted/archived records",
          "  --help, -h                 Show this help message",
          "",
          "Examples:",
          '  node query.js "SELECT Id, Name FROM Account LIMIT 10"',
          '  node query.js "SELECT Id, Account.Name FROM Contact" -o myOrg',
          '  node query.js "SELECT FIELDS(STANDARD) FROM Account LIMIT 5" --json',
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
  die('SOQL query is required. Usage: node query.js "<SOQL>"');
}

// ── Execute sf CLI ──────────────────────────────────────────────────────────

const sfArgs = ["data", "query", "--query", soql, "--json"];
if (targetOrg) sfArgs.push("--target-org", targetOrg);
if (allRows) sfArgs.push("--all-rows");

console.log(`Query: ${soql}`);
if (targetOrg) console.log(`Target Org: ${targetOrg}`);
if (allRows) console.log(`Mode: Including deleted/archived records`);
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

// ── CSV output ──────────────────────────────────────────────────────────────

if (csvOutput) {
  printCsv(records);
  process.exit(0);
}

// ── Table output ────────────────────────────────────────────────────────────

if (records.length === 0) {
  console.log("No records found.");
  console.log(`Total Size: ${totalSize}`);
  process.exit(0);
}

printTable(records);

console.log();
console.log(`Records returned: ${records.length}`);
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
    `ERROR: Failed to execute query. Ensure you are authenticated and the SOQL is valid.`
  );
  console.error(`Query was: ${query}`);
  process.exit(1);
}

function flattenRecord(record, prefix) {
  const flat = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "attributes") continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (value.records !== undefined) {
        // This is a subquery result — skip in standard query (handled by subquery.js)
        flat[fullKey] = `[${(value.records || []).length} records]`;
      } else if (value.attributes) {
        // This is a related object (dot notation traversal)
        const nested = flattenRecord(value, fullKey);
        Object.assign(flat, nested);
      } else {
        // Could be a compound field (Address, Location)
        flat[fullKey] = JSON.stringify(value);
      }
    } else {
      flat[fullKey] = value;
    }
  }
  return flat;
}

function printTable(records) {
  // Flatten all records to handle dot notation results
  const flatRecords = records.map((r) => flattenRecord(r, ""));

  // Collect all column names preserving order
  const colSet = new Set();
  for (const rec of flatRecords) {
    for (const key of Object.keys(rec)) {
      colSet.add(key);
    }
  }
  const columns = Array.from(colSet);

  // Calculate column widths
  const widths = {};
  for (const col of columns) {
    widths[col] = col.length;
  }
  for (const rec of flatRecords) {
    for (const col of columns) {
      const val = formatValue(rec[col]);
      if (val.length > widths[col]) widths[col] = val.length;
    }
  }

  // Cap column widths
  const maxColWidth = 50;
  for (const col of columns) {
    if (widths[col] > maxColWidth) widths[col] = maxColWidth;
  }

  // Print header
  const header = columns.map((c) => pad(c, widths[c])).join("  ");
  console.log(header);
  console.log(
    columns.map((c) => "-".repeat(widths[c])).join("  ")
  );

  // Print rows
  for (const rec of flatRecords) {
    const row = columns
      .map((c) => {
        let val = formatValue(rec[c]);
        if (val.length > maxColWidth) val = val.slice(0, maxColWidth - 3) + "...";
        return pad(val, widths[c]);
      })
      .join("  ");
    console.log(row);
  }
}

function printCsv(records) {
  const flatRecords = records.map((r) => flattenRecord(r, ""));

  const colSet = new Set();
  for (const rec of flatRecords) {
    for (const key of Object.keys(rec)) {
      colSet.add(key);
    }
  }
  const columns = Array.from(colSet);

  // Header
  console.log(columns.map(csvEscape).join(","));

  // Rows
  for (const rec of flatRecords) {
    const row = columns.map((c) => csvEscape(formatValue(rec[c])));
    console.log(row.join(","));
  }
}

function csvEscape(val) {
  val = String(val);
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function formatValue(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "true" : "false";
  return String(val);
}
