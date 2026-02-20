#!/usr/bin/env node
/**
 * aggregate.js - Run SOQL aggregate queries against a Salesforce org
 *
 * Handles queries with aggregate functions (SUM, AVG, MIN, MAX, COUNT)
 * combined with GROUP BY, GROUP BY ROLLUP, GROUP BY CUBE, HAVING,
 * and date/time grouping functions (CALENDAR_YEAR, CALENDAR_MONTH, etc).
 *
 * Usage:
 *   node aggregate.js "<SOQL>"                              # Run aggregate query
 *   node aggregate.js "<SOQL>" --target-org <alias>         # Specific org
 *   node aggregate.js "<SOQL>" --json                       # Raw JSON output
 *   node aggregate.js "<SOQL>" --csv                        # CSV output
 *   node aggregate.js --help                                # Show help
 *
 * Options:
 *   --target-org, -o   Target org alias or username
 *   --json             Output raw JSON from sf CLI
 *   --csv              Output as CSV
 *   --all-rows         Include deleted and archived records
 *   --help, -h         Show this help message
 */

const { execFileSync, execSync } = require("child_process");

const isWindows = process.platform === "win32";

/**
 * Run sf CLI cross-platform. On Windows, sf is installed as sf.cmd which
 * requires shell execution. Using execSync with explicit double-quoting
 * protects SOQL special characters (parentheses, etc.) from cmd.exe parsing.
 */
function runSf(sfArgs) {
  const execOpts = {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024,
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
          "Usage: node aggregate.js \"<SOQL>\" [options]",
          "",
          "Run a SOQL aggregate query against a Salesforce org.",
          "",
          "Options:",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --json                     Output raw JSON from sf CLI",
          "  --csv                      Output as CSV",
          "  --all-rows                 Include deleted/archived records",
          "  --help, -h                 Show this help message",
          "",
          "Examples:",
          '  node aggregate.js "SELECT StageName, SUM(Amount) FROM Opportunity GROUP BY StageName"',
          '  node aggregate.js "SELECT Industry, AVG(AnnualRevenue) FROM Account GROUP BY Industry"',
          '  node aggregate.js "SELECT LeadSource, COUNT(Id) FROM Lead GROUP BY ROLLUP(LeadSource)"',
          '  node aggregate.js "SELECT Type, BillingState, COUNT(Id) FROM Account GROUP BY CUBE(Type, BillingState)"',
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
  die('SOQL query is required. Usage: node aggregate.js "<SOQL>"');
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
const records = data.records || [];
const totalSize = data.totalSize ?? records.length;

// ── Raw JSON output ─────────────────────────────────────────────────────────

if (jsonOutput) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

// ── No results ──────────────────────────────────────────────────────────────

if (records.length === 0) {
  console.log("No aggregate results found.");
  console.log(`Total Size: ${totalSize}`);
  process.exit(0);
}

// ── CSV output ──────────────────────────────────────────────────────────────

if (csvOutput) {
  printCsv(records);
  process.exit(0);
}

// ── Table output ────────────────────────────────────────────────────────────

printAggregateTable(records);

console.log();
console.log(`Rows returned: ${records.length}`);
console.log(`Total size: ${totalSize}`);

// ── Detect ROLLUP/CUBE for summary rows ─────────────────────────────────────

const isRollup = /GROUP\s+BY\s+ROLLUP/i.test(soql);
const isCube = /GROUP\s+BY\s+CUBE/i.test(soql);
if (isRollup) {
  console.log(`Note: ROLLUP query — rows with empty grouping fields are subtotals/grand totals.`);
}
if (isCube) {
  console.log(`Note: CUBE query — rows with empty grouping fields represent all-combination subtotals.`);
}

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
    `ERROR: Failed to execute aggregate query. Ensure you are authenticated and the SOQL is valid.`
  );
  console.error(`Query was: ${query}`);
  process.exit(1);
}

function extractColumns(records) {
  const columns = [];
  const seen = new Set();
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (key === "attributes" || seen.has(key)) continue;
      seen.add(key);
      columns.push(key);
    }
  }
  return columns;
}

function printAggregateTable(records) {
  const columns = extractColumns(records);

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
  console.log("=== Aggregate Results ===");
  console.log();
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

function printCsv(records) {
  const columns = extractColumns(records);

  // Header
  console.log(columns.map(csvEscape).join(","));

  // Rows
  for (const rec of records) {
    const row = columns.map((c) => csvEscape(formatRawValue(rec[c])));
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

function formatRawValue(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "true" : "false";
  return String(val);
}

function formatValue(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") {
    // Don't format small integers (years, months, day numbers) with commas
    if (Number.isInteger(val) && Math.abs(val) < 10000) return String(val);
    // Format large numbers with commas for readability
    if (Number.isInteger(val)) return val.toLocaleString("en-US");
    // Float — show up to 2 decimal places
    return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(val);
}
