#!/usr/bin/env node
/**
 * insert.js - Insert a single record into a Salesforce object
 *
 * Creates a new record using field=value pairs passed via --values.
 *
 * Usage:
 *   node insert.js <ObjectName> --values "Name='Acme' Industry='Technology'"
 *   node insert.js Account --values "Name='Acme Corp'" --target-org myOrg
 *   node insert.js Account --values "Name='Acme Corp'" --json
 *   node insert.js --help
 *
 * Options:
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
let values = "";
let targetOrg = "";
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
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
          "Usage: node insert.js <ObjectName> --values \"<field=value pairs>\" [options]",
          "",
          "Insert a single record into a Salesforce object.",
          "",
          "Options:",
          "  --values, -v <pairs>       Field=value pairs (required)",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --json                     Output raw JSON from sf CLI",
          "  --help, -h                 Show this help message",
          "",
          "Examples:",
          "  node insert.js Account --values \"Name='Acme Corp' Industry='Technology'\"",
          "  node insert.js Contact --values \"LastName='Smith' Email='smith@example.com'\" -o myOrg",
          "  node insert.js Account --values \"Name='Test'\" --json",
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
  die("Object name is required. Usage: node insert.js <ObjectName> --values \"<field=value pairs>\"");
}
if (!values) {
  die("--values is required. Example: --values \"Name='Acme Corp' Industry='Technology'\"");
}

// ── Execute sf CLI ──────────────────────────────────────────────────────────

const sfArgs = ["data", "create", "record", "--sobject", objectName, "--values", values, "--json"];
if (targetOrg) sfArgs.push("--target-org", targetOrg);

console.log(`Inserting: ${objectName}`);
console.log(`Values: ${values}`);
if (targetOrg) console.log(`Target Org: ${targetOrg}`);
console.log();

let result;
try {
  const output = runSf(sfArgs);
  result = JSON.parse(output);
} catch (err) {
  handleError(err, "Failed to insert record.");
}

const data = result.result || result;

// ── Raw JSON output ─────────────────────────────────────────────────────────

if (jsonOutput) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

// ── Default output ──────────────────────────────────────────────────────────

const recordId = data.id || data.Id || "Unknown";

console.log("=== Record Created ===");
console.log(`  Id:       ${recordId}`);
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
  console.error(`Object: ${objectName}`);
  console.error(`Values: ${values}`);
  process.exit(1);
}
