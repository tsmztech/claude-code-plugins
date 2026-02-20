#!/usr/bin/env node
/**
 * count.js - Run SOQL COUNT queries against a Salesforce org
 *
 * Handles COUNT(), COUNT(field), and COUNT_DISTINCT(field) queries,
 * including grouped counts with GROUP BY and HAVING.
 *
 * Usage:
 *   node count.js "<SOQL>"                              # Run a count query
 *   node count.js "<SOQL>" --target-org <alias>         # Specific org
 *   node count.js "<SOQL>" --json                       # Raw JSON output
 *   node count.js --help                                # Show help
 *
 * Options:
 *   --target-org, -o   Target org alias or username
 *   --json             Output raw JSON from sf CLI
 *   --all-rows         Include deleted and archived records
 *   --help, -h         Show this help message
 */

const { execFileSync, execSync } = require("child_process");

const isWindows = process.platform === "win32";

function runSf(sfArgs, extraOpts = {}) {
  const execOpts = {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024,
    ...extraOpts,
  };
  if (isWindows) {
    const escaped = sfArgs.map((a) => {
      if (/[() &|<>^%!"]/.test(a)) {
        return '"' + a.replace(/"/g, '""') + '"';
      }
      return a;
    });
    return execSync("sf " + escaped.join(" "), execOpts);
  }
  return execFileSync("sf", sfArgs, execOpts);
}

// ── Parse arguments ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let soql = "";
let targetOrg = "";
let jsonOutput = false;
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
    case "--all-rows":
      allRows = true;
      break;
    case "--help":
    case "-h":
      console.log(
        [
          "Usage: node count.js \"<SOQL>\" [options]",
          "",
          "Run a SOQL COUNT query against a Salesforce org.",
          "",
          "Options:",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --json                     Output raw JSON from sf CLI",
          "  --all-rows                 Include deleted/archived records",
          "  --help, -h                 Show this help message",
          "",
          "Examples:",
          '  node count.js "SELECT COUNT() FROM Account"',
          '  node count.js "SELECT COUNT(Id) FROM Contact WHERE AccountId != null"',
          '  node count.js "SELECT Industry, COUNT(Id) FROM Account GROUP BY Industry"',
          '  node count.js "SELECT COUNT_DISTINCT(AccountId) FROM Contact"',
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
  die('SOQL query is required. Usage: node count.js "<SOQL>"');
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
  const output = runSf(sfArgs);
  result = JSON.parse(output);
} catch (err) {
  handleError(err, soql);
}

const data = result.result || result;

// ── Raw JSON output ─────────────────────────────────────────────────────────

if (jsonOutput) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

// ── Detect query type ───────────────────────────────────────────────────────

const records = data.records || [];
const totalSize = data.totalSize ?? 0;

// Simple COUNT() returns totalSize with no records
const isSimpleCount = /SELECT\s+COUNT\(\s*\)/i.test(soql) && records.length === 0;

if (isSimpleCount) {
  console.log(`=== Count Result ===`);
  console.log(`Count: ${totalSize}`);
  process.exit(0);
}

// Grouped count or COUNT(field) / COUNT_DISTINCT(field)
if (records.length === 0) {
  console.log("No results found.");
  console.log(`Total Size: ${totalSize}`);
  process.exit(0);
}

// ── Formatted output ────────────────────────────────────────────────────────

printCountTable(records);

console.log();
console.log(`Rows returned: ${records.length}`);
console.log(`Total size: ${totalSize}`);

// ── Helpers ─────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function pad(str, len) {
  str = String(str);
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function padLeft(str, len) {
  str = String(str);
  return str.length >= len ? str : " ".repeat(len - str.length) + str;
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
    `ERROR: Failed to execute count query. Ensure you are authenticated and the SOQL is valid.`
  );
  console.error(`Query was: ${query}`);
  process.exit(1);
}

function printCountTable(records) {
  // Extract column names from first record, excluding 'attributes'
  const columns = [];
  for (const key of Object.keys(records[0] || {})) {
    if (key === "attributes") continue;
    columns.push(key);
  }

  if (columns.length === 0) {
    console.log("No columns in result.");
    return;
  }

  // Identify numeric columns for right-alignment
  const numericCols = new Set();
  for (const col of columns) {
    const allNumeric = records.every((r) => {
      const v = r[col];
      return v === null || v === undefined || typeof v === "number";
    });
    if (allNumeric) numericCols.add(col);
  }

  // Calculate column widths
  const widths = {};
  for (const col of columns) {
    widths[col] = col.length;
  }
  for (const rec of records) {
    for (const col of columns) {
      const val = formatValue(rec[col]);
      if (val.length > widths[col]) widths[col] = val.length;
    }
  }

  // Cap widths
  const maxColWidth = 50;
  for (const col of columns) {
    if (widths[col] > maxColWidth) widths[col] = maxColWidth;
  }

  // Print header
  const header = columns
    .map((c) => (numericCols.has(c) ? padLeft(c, widths[c]) : pad(c, widths[c])))
    .join("  ");
  console.log(header);
  console.log(columns.map((c) => "-".repeat(widths[c])).join("  "));

  // Print rows
  for (const rec of records) {
    const row = columns
      .map((c) => {
        let val = formatValue(rec[c]);
        if (val.length > maxColWidth) val = val.slice(0, maxColWidth - 3) + "...";
        return numericCols.has(c) ? padLeft(val, widths[c]) : pad(val, widths[c]);
      })
      .join("  ");
    console.log(row);
  }
}

function formatValue(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  return String(val);
}
