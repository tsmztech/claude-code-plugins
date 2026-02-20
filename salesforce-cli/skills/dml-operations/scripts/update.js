#!/usr/bin/env node
/**
 * update.js - Update a single record in a Salesforce object by record Id
 *
 * Modifies an existing record using its 15 or 18-character Salesforce Id
 * and field=value pairs passed via --values.
 *
 * Usage:
 *   node update.js <ObjectName> --record-id <Id> --values "Industry='Finance'"
 *   node update.js Account -i 001XX000003ABCDE -v "Name='New Name'" --target-org myOrg
 *   node update.js Account -i 001XX000003ABCDE -v "Name='New Name'" --json
 *   node update.js --help
 *
 * Options:
 *   --record-id, -i       Salesforce record Id (15 or 18 chars, required)
 *   --values, -v          Field=value pairs (required)
 *   --target-org, -o      Target org alias or username
 *   --json                Output raw JSON from sf CLI
 *   --help, -h            Show this help message
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
let objectName = "";
let recordId = "";
let values = "";
let targetOrg = "";
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--record-id":
    case "-i":
      recordId = args[++i] || "";
      break;
    case "--values":
    case "-v":
      values = args[++i] || "";
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
          "Usage: node update.js <ObjectName> --record-id <Id> --values \"<field=value pairs>\" [options]",
          "",
          "Update a single record in a Salesforce object by its record Id.",
          "",
          "Options:",
          "  --record-id, -i <Id>       Salesforce record Id, 15 or 18 chars (required)",
          "  --values, -v <pairs>       Field=value pairs (required)",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --json                     Output raw JSON from sf CLI",
          "  --help, -h                 Show this help message",
          "",
          "Examples:",
          "  node update.js Account -i 001XX000003ABCDE -v \"Industry='Finance'\"",
          "  node update.js Contact -i 003XX000004FGHIJ -v \"Email='new@example.com'\" -o myOrg",
          "  node update.js Opportunity -i 006XX000005KLMNO -v \"StageName='Closed Won' Amount=50000\" --json",
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
  die("Object name is required. Usage: node update.js <ObjectName> --record-id <Id> --values \"<field=value pairs>\"");
}
if (!recordId) {
  die("--record-id is required. Provide a 15 or 18-character Salesforce record Id.");
}
if (!values) {
  die("--values is required. Example: --values \"Industry='Finance' AnnualRevenue=5000000\"");
}

// Validate record Id format
if (!/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(recordId)) {
  die(`Invalid record Id: "${recordId}". Must be 15 or 18 alphanumeric characters.`);
}

// ── Execute sf CLI ──────────────────────────────────────────────────────────

const sfArgs = [
  "data", "update", "record",
  "--sobject", objectName,
  "--record-id", recordId,
  "--values", values,
  "--json",
];
if (targetOrg) sfArgs.push("--target-org", targetOrg);

console.log(`Updating: ${objectName} (${recordId})`);
console.log(`Values: ${values}`);
if (targetOrg) console.log(`Target Org: ${targetOrg}`);
console.log();

let result;
try {
  const output = runSf(sfArgs);
  result = JSON.parse(output);
} catch (err) {
  handleError(err, "Failed to update record.");
}

const data = result.result || result;

// ── Raw JSON output ─────────────────────────────────────────────────────────

if (jsonOutput) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

// ── Default output ──────────────────────────────────────────────────────────

const updatedId = data.id || data.Id || recordId;

console.log("=== Record Updated ===");
console.log(`  Id:       ${updatedId}`);
console.log(`  Object:   ${objectName}`);
console.log(`  Values:   ${values}`);

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
  console.error(`Object: ${objectName}, Record Id: ${recordId}`);
  console.error(`Values: ${values}`);
  process.exit(1);
}
