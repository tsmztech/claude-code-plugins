#!/usr/bin/env node
/**
 * export.js - Export Salesforce data to a CSV or JSON file
 *
 * Runs a SOQL query against a Salesforce org and writes the results to a local file.
 * Supports automatic pagination (REST API) and bulk mode (Bulk API 2.0) for large exports.
 *
 * Usage:
 *   node export.js "<SOQL>" --output <file-path>
 *   node export.js "<SOQL>" --output <file-path> --format csv
 *   node export.js "<SOQL>" --output <file-path> --bulk --wait 15
 *   node export.js "<SOQL>" --output <file-path> --target-org <alias>
 *   node export.js --help
 *
 * Options:
 *   --output, -f       Output file path (required)
 *   --format           Output format: csv or json (auto-detected from extension)
 *   --target-org, -o   Target org alias or username
 *   --all-rows         Include deleted/archived records
 *   --bulk             Use Bulk API 2.0 for large exports
 *   --wait, -w         Minutes to wait for bulk job completion (default: 10)
 *   --json             Print export metadata as JSON to stdout
 *   --help, -h         Show this help message
 */

const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

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
let outputPath = "";
let format = "";
let targetOrg = "";
let allRows = false;
let bulk = false;
let waitMinutes = 10;
let jsonMeta = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--output":
    case "-f":
      outputPath = args[++i] || "";
      break;
    case "--format":
      format = (args[++i] || "").toLowerCase();
      break;
    case "--target-org":
    case "-o":
      targetOrg = args[++i] || "";
      break;
    case "--all-rows":
      allRows = true;
      break;
    case "--bulk":
      bulk = true;
      break;
    case "--wait":
    case "-w":
      waitMinutes = parseInt(args[++i], 10) || 10;
      break;
    case "--json":
      jsonMeta = true;
      break;
    case "--help":
    case "-h":
      console.log(
        [
          'Usage: node export.js "<SOQL>" --output <file-path> [options]',
          "",
          "Export Salesforce query results to a local CSV or JSON file.",
          "",
          "Options:",
          "  --output, -f <path>        Output file path (required)",
          "  --format <csv|json>        Output format (auto-detected from extension)",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --all-rows                 Include deleted/archived records",
          "  --bulk                     Use Bulk API 2.0 for large exports (100k+ records)",
          "  --wait, -w <minutes>       Wait time for bulk job completion (default: 10)",
          "  --json                     Print export metadata as JSON to stdout",
          "  --help, -h                 Show this help message",
          "",
          "Examples:",
          '  node export.js "SELECT Id, Name FROM Account" --output accounts.csv',
          '  node export.js "SELECT Id, Name FROM Account" -f accounts.json',
          '  node export.js "SELECT Id, Name, Email FROM Contact" -f contacts.csv -o myOrg',
          '  node export.js "SELECT Id, Name FROM Lead" -f leads.csv --bulk --wait 15',
          '  node export.js "SELECT Id, Name FROM Account" -f accounts.csv --all-rows',
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

// ── Validate inputs ─────────────────────────────────────────────────────────

if (!soql) {
  die('SOQL query is required. Usage: node export.js "<SOQL>" --output <file-path>');
}
if (!outputPath) {
  die("Output file path is required. Use --output <file-path> or -f <file-path>");
}

// Auto-detect format from file extension if not specified
if (!format) {
  const ext = path.extname(outputPath).toLowerCase();
  format = ext === ".json" ? "json" : "csv";
}
if (format !== "csv" && format !== "json") {
  die(`Unsupported format: "${format}". Use "csv" or "json".`);
}

// Resolve output path to absolute
const resolvedOutput = path.resolve(outputPath);

// Ensure parent directory exists
const parentDir = path.dirname(resolvedOutput);
if (!fs.existsSync(parentDir)) {
  die(`Output directory does not exist: ${parentDir}`);
}

// ── Execute query ───────────────────────────────────────────────────────────

console.log(`Query: ${soql}`);
console.log(`Output: ${resolvedOutput}`);
console.log(`Format: ${format.toUpperCase()}`);
if (targetOrg) console.log(`Target Org: ${targetOrg}`);
if (bulk) console.log(`Mode: Bulk API 2.0 (wait: ${waitMinutes}m)`);
if (allRows) console.log(`Mode: Including deleted/archived records`);
console.log();

let records = [];
let totalSize = 0;

if (bulk) {
  // ── Bulk API mode ───────────────────────────────────────────────────────
  const sfArgs = ["data", "query", "--query", soql, "--bulk", "--wait", String(waitMinutes), "--json"];
  if (targetOrg) sfArgs.push("--target-org", targetOrg);

  console.log("Running bulk query...");
  let result;
  try {
    const output = runSf(sfArgs, {
      maxBuffer: 200 * 1024 * 1024,
      timeout: (waitMinutes + 1) * 60 * 1000,
    });
    result = JSON.parse(output);
  } catch (err) {
    handleError(err, soql);
  }

  const data = result.result || result;
  records = data.records || [];
  totalSize = data.totalSize ?? records.length;
} else {
  // ── REST API mode with automatic pagination ─────────────────────────────
  const sfArgs = ["data", "query", "--query", soql, "--json"];
  if (targetOrg) sfArgs.push("--target-org", targetOrg);
  if (allRows) sfArgs.push("--all-rows");

  console.log("Running query...");
  let result;
  try {
    const output = runSf(sfArgs, {
      maxBuffer: 200 * 1024 * 1024,
    });
    result = JSON.parse(output);
  } catch (err) {
    handleError(err, soql);
  }

  let data = result.result || result;
  records = data.records || [];
  totalSize = data.totalSize ?? records.length;
  let done = data.done !== false;

  // Paginate through remaining batches
  let batchCount = 1;
  while (!done && data.nextRecordsUrl) {
    batchCount++;
    console.log(`Fetching batch ${batchCount} (${records.length} records so far)...`);
    const resumeArgs = ["data", "query", "--query-url", data.nextRecordsUrl, "--json"];
    if (targetOrg) resumeArgs.push("--target-org", targetOrg);

    try {
      const output = runSf(resumeArgs, {
        maxBuffer: 200 * 1024 * 1024,
      });
      const nextResult = JSON.parse(output);
      data = nextResult.result || nextResult;
      const nextRecords = data.records || [];
      records = records.concat(nextRecords);
      done = data.done !== false;
    } catch (err) {
      console.error(`Warning: Failed to fetch batch ${batchCount}. Exporting ${records.length} records collected so far.`);
      break;
    }
  }

  if (batchCount > 1) {
    console.log(`Fetched ${batchCount} batches.`);
  }
}

// ── Write file ──────────────────────────────────────────────────────────────

if (records.length === 0) {
  console.log("\nNo records found. No file written.");
  process.exit(0);
}

console.log(`\nExporting ${records.length} records...`);

let fileContent;
if (format === "json") {
  // Strip Salesforce metadata (attributes) from each record
  const cleanRecords = records.map((r) => stripAttributes(r));
  fileContent = JSON.stringify(cleanRecords, null, 2);
} else {
  // CSV
  const flatRecords = records.map((r) => flattenRecord(r, ""));
  const colSet = new Set();
  for (const rec of flatRecords) {
    for (const key of Object.keys(rec)) {
      colSet.add(key);
    }
  }
  const columns = Array.from(colSet);

  const lines = [];
  // Header
  lines.push(columns.map(csvEscape).join(","));
  // Rows
  for (const rec of flatRecords) {
    const row = columns.map((c) => csvEscape(formatValue(rec[c])));
    lines.push(row.join(","));
  }
  fileContent = lines.join("\n") + "\n";
}

try {
  fs.writeFileSync(resolvedOutput, fileContent, "utf8");
} catch (err) {
  die(`Failed to write file: ${err.message}`);
}

const fileSizeBytes = fs.statSync(resolvedOutput).size;
const fileSize = formatFileSize(fileSizeBytes);

// ── Summary ─────────────────────────────────────────────────────────────────

if (jsonMeta) {
  console.log(
    JSON.stringify(
      {
        file: resolvedOutput,
        format,
        records: records.length,
        totalSize,
        fileSize,
        fileSizeBytes,
      },
      null,
      2
    )
  );
} else {
  console.log(`\nExport complete.`);
  console.log(`  File:    ${resolvedOutput}`);
  console.log(`  Format:  ${format.toUpperCase()}`);
  console.log(`  Records: ${records.length}`);
  if (totalSize > records.length) {
    console.log(`  Total available: ${totalSize}`);
  }
  console.log(`  Size:    ${fileSize}`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
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
    console.error(`Query Error: ${errMsg}`);
  }
  console.error(`ERROR: Failed to execute query. Ensure you are authenticated and the SOQL is valid.`);
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
        // Subquery result — flatten child records count
        flat[fullKey] = `[${(value.records || []).length} records]`;
      } else if (value.attributes) {
        // Related object (dot notation traversal)
        const nested = flattenRecord(value, fullKey);
        Object.assign(flat, nested);
      } else {
        // Compound field (Address, Location)
        flat[fullKey] = JSON.stringify(value);
      }
    } else {
      flat[fullKey] = value;
    }
  }
  return flat;
}

function stripAttributes(record) {
  const clean = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "attributes") continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (value.records !== undefined) {
        // Subquery result — recurse into child records
        clean[key] = (value.records || []).map((r) => stripAttributes(r));
      } else if (value.attributes) {
        // Related object — recurse
        clean[key] = stripAttributes(value);
      } else {
        clean[key] = value;
      }
    } else {
      clean[key] = value;
    }
  }
  return clean;
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

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
