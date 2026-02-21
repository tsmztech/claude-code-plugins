#!/usr/bin/env node
/**
 * get-log.js - List and retrieve Salesforce debug logs
 *
 * Lists available debug logs or retrieves specific log content using
 * the sf apex log commands.
 *
 * Usage:
 *   node get-log.js --list                                        # List available logs
 *   node get-log.js                                               # Get most recent log
 *   node get-log.js --log-id 07L5w00000abcdef                    # Get specific log
 *   node get-log.js --number 5                                    # Get 5 most recent logs
 *   node get-log.js --list --username admin@myorg.com             # List logs for a user
 *   node get-log.js --help                                        # Show help
 *
 * Options:
 *   --list              List available debug logs
 *   --log-id, -i        Retrieve a specific log by ID
 *   --number, -n        Number of most recent logs to retrieve (default: 1)
 *   --username, -u      Filter logs by username (for --list)
 *   --target-org, -o    Target org alias or username
 *   --json              Output raw JSON
 *   --help, -h          Show this help message
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

// ── Parse arguments ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let listMode = false;
let logId = "";
let number = 0;
let username = "";
let targetOrg = "";
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--list":
      listMode = true;
      break;
    case "--log-id":
    case "-i":
      logId = args[++i] || "";
      break;
    case "--number":
    case "-n":
      number = parseInt(args[++i] || "1", 10);
      break;
    case "--username":
    case "-u":
      username = args[++i] || "";
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
          "Usage: node get-log.js [options]",
          "",
          "List and retrieve Salesforce debug logs.",
          "",
          "Options:",
          "  --list                     List available debug logs",
          "  --log-id, -i <id>          Retrieve a specific log by ID",
          "  --number, -n <count>       Number of most recent logs to retrieve (default: 1)",
          "  --username, -u <user>      Filter logs by username (for --list)",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --json                     Output raw JSON",
          "  --help, -h                 Show this help message",
          "",
          "Examples:",
          "  node get-log.js --list",
          "  node get-log.js",
          "  node get-log.js --log-id 07L5w00000abcdef",
          "  node get-log.js --number 5",
          "  node get-log.js --list --username admin@myorg.com",
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

// If no action specified, default to getting the most recent log
if (!listMode && !logId && !number) {
  number = 1;
}

// ── List mode ──────────────────────────────────────────────────────────────

if (listMode) {
  console.log("=== Debug Logs ===");
  console.log();

  const listArgs = ["apex", "list", "log", "--json"];
  if (targetOrg) listArgs.push("--target-org", targetOrg);

  let logs = [];
  try {
    const listOutput = runSf(listArgs);
    const listResult = JSON.parse(listOutput);
    logs = (listResult.result || listResult) || [];
    if (!Array.isArray(logs)) logs = [];
  } catch (err) {
    handleError(err, "Failed to list debug logs.");
  }

  if (logs.length === 0) {
    console.log("No debug logs found.");
    if (jsonOutput) {
      console.log(JSON.stringify([], null, 2));
    }
    process.exit(0);
  }

  // Filter by username if provided
  if (username) {
    // Resolve user ID first
    let userId = "";
    const queryArgs = [
      "data", "query",
      "--query", `SELECT Id FROM User WHERE Username = '${username}'`,
      "--json",
    ];
    if (targetOrg) queryArgs.push("--target-org", targetOrg);

    try {
      const queryOutput = runSf(queryArgs);
      const queryResult = JSON.parse(queryOutput);
      const records = (queryResult.result || queryResult).records || [];
      if (records.length > 0) {
        userId = records[0].Id;
      }
    } catch {
      // If lookup fails, try filtering by LogUser.Name
    }

    if (userId) {
      // Use 15-char ID prefix for comparison (logs may use 15 or 18 char IDs)
      const shortId = userId.substring(0, 15);
      logs = logs.filter((log) => {
        const logUserId = log.LogUserId || log.LogUser?.Id || "";
        return logUserId.startsWith(shortId);
      });
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(logs, null, 2));
    process.exit(0);
  }

  // Format as table
  console.log(`Found ${logs.length} log(s):`);
  console.log();

  // Header
  const idWidth = 18;
  const userWidth = 20;
  const sizeWidth = 10;
  const statusWidth = 10;
  const dateWidth = 22;

  const header =
    "ID".padEnd(idWidth) +
    "  " + "User".padEnd(userWidth) +
    "  " + "Size".padEnd(sizeWidth) +
    "  " + "Status".padEnd(statusWidth) +
    "  " + "Start Time".padEnd(dateWidth);
  console.log(header);
  console.log("-".repeat(header.length));

  for (const log of logs) {
    const id = (log.Id || "").padEnd(idWidth);
    const logUser = (log.LogUser?.Name || log.LogUserId || "N/A").substring(0, userWidth).padEnd(userWidth);
    const size = formatBytes(log.LogLength || 0).padEnd(sizeWidth);
    const status = (log.Status || "N/A").padEnd(statusWidth);
    const startTime = log.StartTime
      ? new Date(log.StartTime).toLocaleString().substring(0, dateWidth).padEnd(dateWidth)
      : "N/A".padEnd(dateWidth);
    console.log(`${id}  ${logUser}  ${size}  ${status}  ${startTime}`);
  }

  console.log();
  console.log(`Use --log-id <ID> to retrieve a specific log.`);
  process.exit(0);
}

// ── Get log by ID ──────────────────────────────────────────────────────────

if (logId) {
  console.log("=== Debug Log ===");
  console.log(`Log ID: ${logId}`);
  console.log();

  const getArgs = ["apex", "get", "log", "--log-id", logId];
  if (targetOrg) getArgs.push("--target-org", targetOrg);

  try {
    const logOutput = runSf(getArgs);

    if (jsonOutput) {
      console.log(JSON.stringify({ logId, content: logOutput }, null, 2));
    } else {
      console.log(logOutput);
    }
  } catch (err) {
    handleError(err, `Failed to retrieve log: ${logId}`);
  }
  process.exit(0);
}

// ── Get N most recent logs ─────────────────────────────────────────────────

if (number > 0) {
  console.log("=== Debug Log ===");
  console.log(`Retrieving ${number} most recent log(s)...`);
  console.log();

  const getArgs = ["apex", "get", "log", "--number", String(number)];
  if (targetOrg) getArgs.push("--target-org", targetOrg);

  try {
    const logOutput = runSf(getArgs);

    if (jsonOutput) {
      console.log(JSON.stringify({ number, content: logOutput }, null, 2));
    } else {
      console.log(logOutput);
    }
  } catch (err) {
    handleError(err, `Failed to retrieve recent log(s).`);
  }
  process.exit(0);
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
