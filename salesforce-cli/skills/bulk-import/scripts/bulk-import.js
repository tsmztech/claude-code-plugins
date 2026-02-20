#!/usr/bin/env node
/**
 * bulk-import.js - Bulk insert, upsert, or update records from a CSV file
 *
 * Supports three operations:
 *   - insert:  Create new records from CSV (sf data import bulk)
 *   - upsert:  Insert or update using an external ID field (sf data upsert bulk)
 *   - update:  Update existing records by Id column in CSV (upsert on Id)
 *
 * Usage:
 *   node bulk-import.js <ObjectName> --file <csv-path>
 *   node bulk-import.js Account --file accounts.csv --operation insert
 *   node bulk-import.js Account --file accounts.csv --operation upsert --external-id External_Id__c
 *   node bulk-import.js Account --file accounts.csv --operation update
 *   node bulk-import.js --help
 *
 * Options:
 *   --file, -f            Path to CSV file (required)
 *   --operation           insert | upsert | update (default: insert)
 *   --external-id, -e     External ID field for upsert (default: Id for update)
 *   --wait, -w            Minutes to wait for job completion (default: 10)
 *   --target-org, -o      Target org alias or username
 *   --json                Output raw JSON from sf CLI
 *   --help, -h            Show this help message
 */

const { execFileSync, execSync } = require("child_process");
const fs = require("fs");

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
let objectName = "";
let filePath = "";
let operation = "insert";
let externalId = "";
let waitMinutes = "10";
let targetOrg = "";
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--file":
    case "-f":
      filePath = args[++i] || "";
      break;
    case "--operation":
      operation = args[++i] || "insert";
      break;
    case "--external-id":
    case "-e":
      externalId = args[++i] || "";
      break;
    case "--wait":
    case "-w":
      waitMinutes = args[++i] || "10";
      break;
    case "--target-org":
    case "-o":
      targetOrg = args[++i] || "";
      break;
    case "--json":
      jsonOutput = true;
      break;
    case "--help":
    case "-h":
      console.log(
        [
          "Usage: node bulk-import.js <ObjectName> --file <csv-path> [options]",
          "",
          "Bulk insert, upsert, or update records from a CSV file.",
          "",
          "Options:",
          "  --file, -f <path>            Path to CSV file (required)",
          "  --operation <op>             insert | upsert | update (default: insert)",
          "  --external-id, -e <field>    External ID field for upsert (default: Id for update)",
          "  --wait, -w <minutes>         Minutes to wait for completion (default: 10)",
          "  --target-org, -o <alias>     Target org alias or username",
          "  --json                       Output raw JSON from sf CLI",
          "  --help, -h                   Show this help message",
          "",
          "Examples:",
          "  node bulk-import.js Account --file accounts.csv",
          "  node bulk-import.js Account --file accounts.csv --operation upsert -e External_Id__c",
          "  node bulk-import.js Contact --file contacts.csv --operation update",
          "  node bulk-import.js Account --file accounts.csv --wait 20 -o myOrg",
        ].join("\n")
      );
      process.exit(0);
      break;
    default:
      if (args[i].startsWith("-")) {
        die(`Unknown option: ${args[i]}`);
      }
      if (!objectName) {
        objectName = args[i];
      } else {
        die(`Unexpected argument: ${args[i]}`);
      }
  }
}

if (!objectName) {
  die("Object name is required. Usage: node bulk-import.js <ObjectName> --file <csv-path>");
}
if (!filePath) {
  die("--file is required. Provide the path to a CSV file.");
}
if (!fs.existsSync(filePath)) {
  die(`File not found: ${filePath}`);
}
if (!["insert", "upsert", "update"].includes(operation)) {
  die(`Invalid operation: "${operation}". Must be one of: insert, upsert, update`);
}

// For update, default external-id to Id
if (operation === "update" && !externalId) {
  externalId = "Id";
}
// For upsert, external-id is required
if (operation === "upsert" && !externalId) {
  die("--external-id is required for upsert operations. Provide the external ID field API name.");
}

// ── Preview CSV ─────────────────────────────────────────────────────────────

const content = fs.readFileSync(filePath, "utf8");
const lines = content.split("\n").filter((l) => l.trim());
const rowCount = Math.max(0, lines.length - 1); // minus header

console.log(`Bulk ${operation}: ${objectName}`);
console.log(`File: ${filePath}`);
console.log(`Rows: ${rowCount} (showing first 3)`);
if (operation !== "insert") console.log(`External ID: ${externalId}`);
if (targetOrg) console.log(`Target Org: ${targetOrg}`);
console.log();

const previewCount = Math.min(4, lines.length); // header + up to 3 data rows
for (let i = 0; i < previewCount; i++) {
  console.log(`  ${lines[i]}`);
}
if (lines.length > 4) {
  console.log(`  ... (${rowCount - 3} more rows)`);
}
console.log();

// ── Build sf CLI command ────────────────────────────────────────────────────

let sfArgs;

if (operation === "insert") {
  sfArgs = [
    "data", "import", "bulk",
    "--sobject", objectName,
    "--file", filePath,
    "--wait", waitMinutes,
    "--json",
  ];
} else {
  // upsert and update both use sf data upsert bulk
  sfArgs = [
    "data", "upsert", "bulk",
    "--sobject", objectName,
    "--file", filePath,
    "--external-id", externalId,
    "--wait", waitMinutes,
    "--json",
  ];
}

if (targetOrg) sfArgs.push("--target-org", targetOrg);

// ── Execute sf CLI ──────────────────────────────────────────────────────────

console.log("Submitting bulk job...");
console.log();

let result;
try {
  const output = runSf(sfArgs, {
    timeout: (parseInt(waitMinutes, 10) + 2) * 60 * 1000, // wait + 2 min buffer
  });
  result = JSON.parse(output);
} catch (err) {
  handleError(err, "Bulk job failed.");
}

const data = result.result || result;

// ── Raw JSON output ─────────────────────────────────────────────────────────

if (jsonOutput) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

// ── Default output ──────────────────────────────────────────────────────────

const jobId = data.jobId || data.id || "Unknown";
const jobState = data.state || data.status || "Unknown";
const processed = data.numberRecordsProcessed ?? data.totalProcessingTime ?? "N/A";
const failed = data.numberRecordsFailed ?? "N/A";

console.log("=== Bulk Job Result ===");
console.log(`  Job ID:             ${jobId}`);
console.log(`  Operation:          ${operation}`);
console.log(`  Object:             ${objectName}`);
console.log(`  Status:             ${jobState}`);
console.log(`  Records Processed:  ${processed}`);
console.log(`  Records Failed:     ${failed}`);

// Show failed records if available
const failedResults = data.failedResults || data.unprocessedRecords || [];
if (Array.isArray(failedResults) && failedResults.length > 0) {
  console.log();
  console.log("  Failed Records:");
  for (const rec of failedResults) {
    const msg = rec.message || rec.error || JSON.stringify(rec);
    console.log(`    ${msg}`);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function handleError(err, context) {
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
    console.error(`Error: ${errMsg}`);
  }
  console.error(`ERROR: ${context}`);
  console.error(`Object: ${objectName}, File: ${filePath}, Operation: ${operation}`);
  process.exit(1);
}
