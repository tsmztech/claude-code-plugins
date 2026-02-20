#!/usr/bin/env node
/**
 * apex-execute.js - Execute Anonymous Apex code against a Salesforce org
 *
 * Writes the provided Apex code to a temporary file, executes it via
 * `sf apex run -f <file> --json`, and parses the structured result.
 *
 * Usage:
 *   node apex-execute.js "<Apex code>"                        # Execute Apex code
 *   node apex-execute.js "<Apex code>" --target-org <alias>   # Specific org
 *   node apex-execute.js "<Apex code>" --json                 # Raw JSON output
 *   node apex-execute.js --help                               # Show help
 *
 * Options:
 *   --target-org, -o   Target org alias or username
 *   --json             Output raw JSON from sf CLI
 *   --help, -h         Show this help message
 */

const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
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
let apexCode = "";
let targetOrg = "";
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
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
          'Usage: node apex-execute.js "<Apex code>" [options]',
          "",
          "Execute Anonymous Apex code against a Salesforce org.",
          "",
          "Options:",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --json                     Output raw JSON from sf CLI",
          "  --help, -h                 Show this help message",
          "",
          "Examples:",
          "  node apex-execute.js \"System.debug('Hello World');\"",
          "  node apex-execute.js \"List<Account> accs = [SELECT Id, Name FROM Account LIMIT 5]; System.debug(accs);\"",
          '  node apex-execute.js "System.debug(Limits.getQueries());" --target-org myDevOrg',
        ].join("\n")
      );
      process.exit(0);
      break;
    default:
      if (args[i].startsWith("-")) {
        die(`Unknown option: ${args[i]}`);
      }
      if (!apexCode) {
        apexCode = args[i];
      } else {
        die(`Unexpected argument: ${args[i]}`);
      }
  }
}

if (!apexCode) {
  die('Apex code is required. Usage: node apex-execute.js "<Apex code>"');
}

// ── Write Apex to temp file ─────────────────────────────────────────────────

const tmpFile = path.join(
  os.tmpdir(),
  `apex-execute-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.apex`
);

try {
  fs.writeFileSync(tmpFile, apexCode, "utf8");
} catch (err) {
  die(`Failed to write temp file: ${err.message}`);
}

// ── Execute sf apex run ─────────────────────────────────────────────────────

const sfArgs = ["apex", "run", "-f", tmpFile, "--json"];
if (targetOrg) sfArgs.push("--target-org", targetOrg);

console.log("=== Anonymous Apex Execution ===");
console.log();
console.log("Code:");
console.log(
  apexCode
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
);
if (targetOrg) console.log(`\nTarget Org: ${targetOrg}`);
console.log();

let result;
try {
  const output = runSf(sfArgs);
  result = JSON.parse(output);
} catch (err) {
  // sf apex run exits non-zero on compile/runtime errors but still returns JSON
  if (err.stdout) {
    try {
      result = JSON.parse(err.stdout);
    } catch {
      // Not valid JSON — fall through to handleError
    }
  }
  if (!result) {
    handleError(err);
  }
} finally {
  // Clean up temp file
  try {
    fs.unlinkSync(tmpFile);
  } catch {
    // Ignore cleanup errors
  }
}

const data = result.result || result;

// ── Raw JSON output ─────────────────────────────────────────────────────────

if (jsonOutput) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(data.success === false ? 1 : 0);
}

// ── Format results ──────────────────────────────────────────────────────────

const compiled = data.compiled !== false;
const success = data.success !== false;
const logs = data.logs || "";
const exceptionMessage = data.exceptionMessage || "";
const exceptionStackTrace = data.exceptionStackTrace || "";

if (!compiled) {
  // Compilation failure
  console.log("RESULT: Compilation Failed");
  console.log();
  if (data.compileProblem) {
    console.log(`Error: ${data.compileProblem}`);
  }
  if (data.line != null) {
    console.log(`Line: ${data.line}, Column: ${data.column || 0}`);
  }
  process.exit(1);
}

if (!success) {
  // Runtime error
  console.log("RESULT: Runtime Error");
  console.log();
  if (exceptionMessage) {
    console.log(`Exception: ${exceptionMessage}`);
  }
  if (exceptionStackTrace) {
    console.log();
    console.log("Stack Trace:");
    console.log(
      exceptionStackTrace
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")
    );
  }

  // Still show debug logs if any were captured before the error
  if (logs) {
    const debugLines = extractDebugLines(logs);
    if (debugLines.length > 0) {
      console.log();
      console.log("Debug Output (before error):");
      for (const line of debugLines) {
        console.log(`  ${line}`);
      }
    }
  }

  process.exit(1);
}

// Success
console.log("RESULT: Execution Successful");

if (logs) {
  const debugLines = extractDebugLines(logs);
  if (debugLines.length > 0) {
    console.log();
    console.log("Debug Output:");
    for (const line of debugLines) {
      console.log(`  ${line}`);
    }
  }

  // Show execution summary from logs
  const heapMatch = logs.match(/HEAP_ALLOCATE.*?Bytes:(\d+)/);
  const dmlMatch = logs.match(/Number of DML statements: (\d+) out of (\d+)/);
  const soqlMatch = logs.match(
    /Number of SOQL queries: (\d+) out of (\d+)/
  );

  const stats = [];
  if (soqlMatch) stats.push(`SOQL Queries: ${soqlMatch[1]}/${soqlMatch[2]}`);
  if (dmlMatch) stats.push(`DML Statements: ${dmlMatch[1]}/${dmlMatch[2]}`);
  if (heapMatch) stats.push(`Heap: ${Number(heapMatch[1]).toLocaleString("en-US")} bytes`);

  if (stats.length > 0) {
    console.log();
    console.log("Execution Stats:");
    for (const stat of stats) {
      console.log(`  ${stat}`);
    }
  }
}

process.exit(0);

// ── Helpers ─────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function handleError(err) {
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
    console.error(`Apex Error: ${errMsg}`);
  }
  console.error(
    "ERROR: Failed to execute Anonymous Apex. Ensure you are authenticated and the Salesforce CLI is installed."
  );
  process.exit(1);
}

function extractDebugLines(logs) {
  const lines = logs.split("\n");
  const debugLines = [];
  for (const line of lines) {
    // Match USER_DEBUG lines: timestamp|USER_DEBUG|[line]|LEVEL|message
    const match = line.match(/\|USER_DEBUG\|\[(\d+)\]\|(\w+)\|(.*)/);
    if (match) {
      debugLines.push(`[Line ${match[1]}] ${match[2]}: ${match[3]}`);
    }
  }
  return debugLines;
}
