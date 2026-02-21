#!/usr/bin/env node
/**
 * analyze-log.js - Analyze a Salesforce debug log for issues and insights
 *
 * Parses a debug log and extracts governor limit usage, SOQL/DML details,
 * performance data, errors, and System.debug() output.
 *
 * Usage:
 *   node analyze-log.js --log-id 07L5w00000abcdef                # Fetch and analyze by ID
 *   node analyze-log.js --file /path/to/debug.log                # Analyze from file
 *   node analyze-log.js --log-id 07L5w00000abcdef --json         # JSON output
 *   node analyze-log.js --help                                    # Show help
 *
 * Options:
 *   --log-id, -i       Fetch and analyze a specific log by ID
 *   --file, -f         Analyze a log from a local file
 *   --target-org, -o   Target org alias or username (with --log-id)
 *   --json             Output analysis as JSON
 *   --help, -h         Show this help message
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

// ── Parse arguments ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let logId = "";
let filePath = "";
let targetOrg = "";
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--log-id":
    case "-i":
      logId = args[++i] || "";
      break;
    case "--file":
    case "-f":
      filePath = args[++i] || "";
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
          "Usage: node analyze-log.js [options]",
          "",
          "Analyze a Salesforce debug log for governor limits, SOQL/DML, errors, and performance.",
          "",
          "Options:",
          "  --log-id, -i <id>          Fetch and analyze a log by ID",
          "  --file, -f <path>          Analyze a log from a local file",
          "  --target-org, -o <alias>   Target org alias or username (with --log-id)",
          "  --json                     Output analysis as JSON",
          "  --help, -h                 Show this help message",
          "",
          "One of --log-id or --file is required.",
          "",
          "Examples:",
          "  node analyze-log.js --log-id 07L5w00000abcdef",
          "  node analyze-log.js --file ./debug.log",
          "  node analyze-log.js --log-id 07L5w00000abcdef --json",
        ].join("\n")
      );
      process.exit(0);
      break;
    default:
      if (args[i].startsWith("-")) {
        die(`Unknown option: ${args[i]}`);
      }
      die(`Unexpected argument: ${args[i]}`);
  }
}

if (!logId && !filePath) {
  die("One of --log-id or --file is required. Use --help for usage.");
}

// ── Get log content ────────────────────────────────────────────────────────

let logContent = "";

if (filePath) {
  try {
    logContent = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    die(`Failed to read file: ${filePath} — ${err.message}`);
  }
  console.log("=== Debug Log Analysis ===");
  console.log(`Source: ${filePath}`);
} else {
  console.log("=== Debug Log Analysis ===");
  console.log(`Fetching log: ${logId}`);

  const getArgs = ["apex", "get", "log", "--log-id", logId];
  if (targetOrg) getArgs.push("--target-org", targetOrg);

  try {
    logContent = runSf(getArgs);
  } catch (err) {
    handleError(err, `Failed to retrieve log: ${logId}`);
  }
}

if (!logContent || logContent.trim().length === 0) {
  die("Log content is empty.");
}

console.log(`Log size: ${formatBytes(logContent.length)}`);
console.log();

// ── Parse the log ──────────────────────────────────────────────────────────

const lines = logContent.split("\n");
const analysis = {
  governorLimits: {},
  soqlQueries: [],
  dmlOperations: [],
  debugOutput: [],
  errors: [],
  codeUnits: [],
  executionTime: null,
  isTruncated: false,
};

// Track if log was truncated
if (logContent.includes("* MAXIMUM DEBUG LOG SIZE REACHED *") ||
    logContent.includes("MAXIMUM DEBUG LOG SIZE REACHED")) {
  analysis.isTruncated = true;
}

// Track SOQL-in-loop and DML-in-loop
let loopDepth = 0;
let soqlInLoopCount = 0;
let dmlInLoopCount = 0;

for (let idx = 0; idx < lines.length; idx++) {
  const line = lines[idx];

  // ── USER_DEBUG lines ───────────────────────────────────────────────
  const debugMatch = line.match(/\|USER_DEBUG\|\[(\d+)\]\|(\w+)\|(.*)/);
  if (debugMatch) {
    analysis.debugOutput.push({
      line: parseInt(debugMatch[1], 10),
      level: debugMatch[2],
      message: debugMatch[3],
    });
    continue;
  }

  // ── SOQL queries ───────────────────────────────────────────────────
  const soqlBegin = line.match(/\|SOQL_EXECUTE_BEGIN\|\[(\d+)\]\|.*?Aggregations:(\d+)\|(.*)/);
  if (soqlBegin) {
    const query = {
      line: parseInt(soqlBegin[1], 10),
      aggregations: parseInt(soqlBegin[2], 10),
      query: soqlBegin[3],
      rows: 0,
      inLoop: loopDepth > 0,
    };
    // Look ahead for SOQL_EXECUTE_END to get row count
    for (let j = idx + 1; j < Math.min(idx + 20, lines.length); j++) {
      const endMatch = lines[j].match(/\|SOQL_EXECUTE_END\|\[(\d+)\]\|Rows:(\d+)/);
      if (endMatch) {
        query.rows = parseInt(endMatch[2], 10);
        break;
      }
    }
    analysis.soqlQueries.push(query);
    if (query.inLoop) soqlInLoopCount++;
    continue;
  }

  // ── DML operations ─────────────────────────────────────────────────
  const dmlBegin = line.match(/\|DML_BEGIN\|\[(\d+)\]\|Op:(\w+)\|Type:(\w+)\|Rows:(\d+)/);
  if (dmlBegin) {
    const dml = {
      line: parseInt(dmlBegin[1], 10),
      operation: dmlBegin[2],
      type: dmlBegin[3],
      rows: parseInt(dmlBegin[4], 10),
      inLoop: loopDepth > 0,
    };
    analysis.dmlOperations.push(dml);
    if (dml.inLoop) dmlInLoopCount++;
    continue;
  }

  // ── Code units ─────────────────────────────────────────────────────
  const codeUnitStart = line.match(/\|CODE_UNIT_STARTED\|\[.*?\]\|(.+)/);
  if (codeUnitStart) {
    analysis.codeUnits.push(codeUnitStart[1]);
    continue;
  }

  // ── Loop detection (for SOQL/DML in loop analysis) ─────────────────
  if (line.includes("|STATEMENT_EXECUTE|") && /\bfor\b|\bwhile\b|\bdo\b/i.test(line)) {
    loopDepth++;
  }
  // Heuristic: track iteration events
  if (line.includes("|ITERATION_BEGIN|")) {
    loopDepth = Math.max(1, loopDepth);
  }
  if (line.includes("|ITERATION_END|")) {
    loopDepth = Math.max(0, loopDepth - 1);
  }

  // ── Errors and exceptions ──────────────────────────────────────────
  const fatalMatch = line.match(/\|FATAL_ERROR\|(.*)/);
  if (fatalMatch) {
    analysis.errors.push({ type: "FATAL_ERROR", message: fatalMatch[1] });
    continue;
  }

  const exceptionMatch = line.match(/\|EXCEPTION_THROWN\|\[(\d+)\]\|(.*)/);
  if (exceptionMatch) {
    analysis.errors.push({
      type: "EXCEPTION",
      line: parseInt(exceptionMatch[1], 10),
      message: exceptionMatch[2],
    });
    continue;
  }

  // ── Governor limits section ────────────────────────────────────────
  const limitMatch = line.match(/Number of ([\w\s]+):\s*(\d+)\s+out of\s+(\d+)/);
  if (limitMatch) {
    const name = limitMatch[1].trim();
    const used = parseInt(limitMatch[2], 10);
    const max = parseInt(limitMatch[3], 10);
    const pct = max > 0 ? Math.round((used / max) * 100) : 0;
    analysis.governorLimits[name] = { used, max, pct };
    continue;
  }

  // ── CPU time ───────────────────────────────────────────────────────
  const cpuMatch = line.match(/Maximum CPU time:\s*(\d+)\s+out of\s+(\d+)/);
  if (cpuMatch) {
    const used = parseInt(cpuMatch[1], 10);
    const max = parseInt(cpuMatch[2], 10);
    const pct = max > 0 ? Math.round((used / max) * 100) : 0;
    analysis.governorLimits["CPU time (ms)"] = { used, max, pct };
    continue;
  }

  // ── Heap size ──────────────────────────────────────────────────────
  const heapMatch = line.match(/Maximum heap size:\s*(\d+)\s+out of\s+(\d+)/);
  if (heapMatch) {
    const used = parseInt(heapMatch[1], 10);
    const max = parseInt(heapMatch[2], 10);
    const pct = max > 0 ? Math.round((used / max) * 100) : 0;
    analysis.governorLimits["Heap size (bytes)"] = { used, max, pct };
    continue;
  }

  // ── Execution time (from EXECUTION_STARTED/FINISHED timestamps) ───
  const execStartMatch = line.match(/^([\d:.]+)\s*\((\d+)\)\|EXECUTION_STARTED/);
  if (execStartMatch) {
    analysis._execStartNanos = parseInt(execStartMatch[2], 10);
    continue;
  }
  const execEndMatch = line.match(/^([\d:.]+)\s*\((\d+)\)\|EXECUTION_FINISHED/);
  if (execEndMatch && analysis._execStartNanos != null) {
    const nanos = parseInt(execEndMatch[2], 10) - analysis._execStartNanos;
    analysis.executionTime = Math.round(nanos / 1000000); // Convert to ms
    continue;
  }
}

// Clean up internal fields
delete analysis._execStartNanos;

// ── Output ─────────────────────────────────────────────────────────────────

if (jsonOutput) {
  console.log(JSON.stringify(analysis, null, 2));
  process.exit(0);
}

// ── Formatted output ───────────────────────────────────────────────────────

// Truncation warning
if (analysis.isTruncated) {
  console.log("WARNING: This log was truncated (exceeded 2 MB limit). Some data may be missing.");
  console.log("  Consider using a more targeted debug level preset (e.g., 'apex' instead of 'finest').");
  console.log();
}

// Execution time
if (analysis.executionTime != null) {
  console.log(`Execution Time: ${analysis.executionTime} ms`);
  console.log();
}

// Governor Limits
const limitKeys = Object.keys(analysis.governorLimits);
if (limitKeys.length > 0) {
  console.log("=== Governor Limits ===");
  console.log();

  const nameWidth = Math.max(30, ...limitKeys.map((k) => k.length)) + 2;

  for (const name of limitKeys) {
    const lim = analysis.governorLimits[name];
    const bar = makeBar(lim.pct);
    const warning = lim.pct >= 90 ? " CRITICAL" : lim.pct >= 70 ? " WARNING" : "";
    console.log(
      `  ${name.padEnd(nameWidth)} ${String(lim.used).padStart(7)} / ${String(lim.max).padStart(7)}  ${bar} ${lim.pct}%${warning}`
    );
  }
  console.log();
}

// SOQL Queries
if (analysis.soqlQueries.length > 0) {
  console.log(`=== SOQL Queries (${analysis.soqlQueries.length}) ===`);
  console.log();

  for (let i = 0; i < analysis.soqlQueries.length; i++) {
    const q = analysis.soqlQueries[i];
    const loopTag = q.inLoop ? " [IN LOOP!]" : "";
    console.log(`  ${i + 1}. [Line ${q.line}] ${q.rows} rows${loopTag}`);
    console.log(`     ${truncate(q.query, 120)}`);
  }

  if (soqlInLoopCount > 0) {
    console.log();
    console.log(`  WARNING: ${soqlInLoopCount} SOQL query(s) detected inside loops. This can cause governor limit exceptions.`);
  }
  console.log();
}

// DML Operations
if (analysis.dmlOperations.length > 0) {
  console.log(`=== DML Operations (${analysis.dmlOperations.length}) ===`);
  console.log();

  for (let i = 0; i < analysis.dmlOperations.length; i++) {
    const d = analysis.dmlOperations[i];
    const loopTag = d.inLoop ? " [IN LOOP!]" : "";
    console.log(`  ${i + 1}. [Line ${d.line}] ${d.operation} on ${d.type} (${d.rows} rows)${loopTag}`);
  }

  if (dmlInLoopCount > 0) {
    console.log();
    console.log(`  WARNING: ${dmlInLoopCount} DML operation(s) detected inside loops. This can cause governor limit exceptions.`);
  }
  console.log();
}

// Debug Output
if (analysis.debugOutput.length > 0) {
  console.log(`=== System.debug() Output (${analysis.debugOutput.length}) ===`);
  console.log();

  for (const d of analysis.debugOutput) {
    console.log(`  [Line ${d.line}] ${d.level}: ${d.message}`);
  }
  console.log();
}

// Errors
if (analysis.errors.length > 0) {
  console.log(`=== Errors (${analysis.errors.length}) ===`);
  console.log();

  for (const e of analysis.errors) {
    if (e.line != null) {
      console.log(`  ${e.type} [Line ${e.line}]: ${e.message}`);
    } else {
      console.log(`  ${e.type}: ${e.message}`);
    }
  }
  console.log();
}

// Code Units
if (analysis.codeUnits.length > 0) {
  // Deduplicate
  const unique = [...new Set(analysis.codeUnits)];
  console.log(`=== Code Units Executed (${unique.length}) ===`);
  console.log();

  for (const unit of unique) {
    console.log(`  ${unit}`);
  }
  console.log();
}

// Summary
console.log("=== Summary ===");
console.log();
console.log(`  SOQL Queries:     ${analysis.soqlQueries.length}${soqlInLoopCount > 0 ? ` (${soqlInLoopCount} in loops!)` : ""}`);
console.log(`  DML Operations:   ${analysis.dmlOperations.length}${dmlInLoopCount > 0 ? ` (${dmlInLoopCount} in loops!)` : ""}`);
console.log(`  Debug Statements: ${analysis.debugOutput.length}`);
console.log(`  Errors:           ${analysis.errors.length}`);
console.log(`  Code Units:       ${[...new Set(analysis.codeUnits)].length}`);
if (analysis.executionTime != null) {
  console.log(`  Execution Time:   ${analysis.executionTime} ms`);
}
if (analysis.isTruncated) {
  console.log(`  Log Truncated:    Yes (exceeded 2 MB)`);
}

// Warnings
const warnings = [];
if (soqlInLoopCount > 0) warnings.push("SOQL queries inside loops detected");
if (dmlInLoopCount > 0) warnings.push("DML operations inside loops detected");
if (analysis.isTruncated) warnings.push("Log was truncated — results may be incomplete");

for (const name of limitKeys) {
  const lim = analysis.governorLimits[name];
  if (lim.pct >= 90) warnings.push(`${name} at ${lim.pct}% (CRITICAL)`);
  else if (lim.pct >= 70) warnings.push(`${name} at ${lim.pct}% (WARNING)`);
}

if (analysis.errors.length > 0) warnings.push(`${analysis.errors.length} error(s) found`);

if (warnings.length > 0) {
  console.log();
  console.log("=== Warnings ===");
  console.log();
  for (const w of warnings) {
    console.log(`  ! ${w}`);
  }
}

process.exit(analysis.errors.length > 0 ? 1 : 0);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeBar(pct) {
  const width = 20;
  const filled = Math.round((pct / 100) * width);
  return "[" + "#".repeat(filled) + ".".repeat(width - filled) + "]";
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + "...";
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

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
  process.exit(1);
}
