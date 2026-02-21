#!/usr/bin/env node
/**
 * remove-trace-flag.js - Remove user trace flags from Salesforce
 *
 * Deletes trace flags for a specified user or all trace flags in the org.
 * Uses the Tooling API to manage TraceFlag records.
 * User is required unless --all is specified.
 *
 * Usage:
 *   node remove-trace-flag.js --username admin@myorg.com           # By username
 *   node remove-trace-flag.js --name "John Doe"                    # By name
 *   node remove-trace-flag.js --all                                # Remove all
 *   node remove-trace-flag.js --help                               # Show help
 *
 * Options:
 *   --username, -u     Exact username (e.g. admin@myorg.com)
 *   --name, -n         Search by user name (exact or partial match)
 *   --all              Remove ALL trace flags in the org
 *   --target-org, -o   Target org alias or username
 *   --json             Output raw JSON
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

// ── Parse arguments ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let username = "";
let name = "";
let removeAll = false;
let targetOrg = "";
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--username":
    case "-u":
      username = args[++i] || "";
      break;
    case "--name":
    case "-n":
      name = args[++i] || "";
      break;
    case "--all":
      removeAll = true;
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
          "Usage: node remove-trace-flag.js --username <user> | --name <name> | --all [options]",
          "",
          "Remove user trace flags to stop debug logging.",
          "One of --username, --name, or --all is required.",
          "",
          "Options:",
          "  --username, -u <user>      Exact username (e.g. admin@myorg.com)",
          "  --name, -n <name>          Search by user name (exact or partial)",
          "  --all                      Remove ALL trace flags in the org",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --json                     Output raw JSON",
          "  --help, -h                 Show this help message",
          "",
          "Examples:",
          "  node remove-trace-flag.js --username admin@myorg.com",
          "  node remove-trace-flag.js --name \"John Doe\"",
          "  node remove-trace-flag.js --all",
          "  node remove-trace-flag.js --username admin@myorg.com --target-org mySandbox",
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

// ── Validate inputs ────────────────────────────────────────────────────────

if (!username && !name && !removeAll) {
  die("User is required. Provide --username <username>, --name <name>, or --all. Use --help for usage.");
}

if ((username || name) && removeAll) {
  die("Cannot combine --username or --name with --all.");
}

if (username && name) {
  die("Provide either --username or --name, not both.");
}

// ── Resolve user ───────────────────────────────────────────────────────────

console.log("=== Remove User Trace Flag ===");
console.log();

let userId = "";
let resolvedUsername = "";

if (!removeAll) {
  if (username) {
    // Look up by exact username
    console.log(`Looking up user by username: ${username}`);
    const queryArgs = [
      "data", "query",
      "--query", `SELECT Id, Name, Username FROM User WHERE Username = '${username}' AND IsActive = true`,
      "--json",
    ];
    if (targetOrg) queryArgs.push("--target-org", targetOrg);

    try {
      const queryOutput = runSf(queryArgs);
      const queryResult = JSON.parse(queryOutput);
      const records = (queryResult.result || queryResult).records || [];
      if (records.length === 0) {
        die(`User not found: ${username}`);
      }
      userId = records[0].Id;
      resolvedUsername = records[0].Username;
      console.log(`  Found: ${records[0].Name} (${records[0].Username})`);
    } catch (err) {
      handleError(err, `Failed to look up user: ${username}`);
    }
  } else {
    // Search by name (exact or partial)
    console.log(`Searching for user by name: ${name}`);

    let records = [];
    const exactQueryArgs = [
      "data", "query",
      "--query", `SELECT Id, Name, Username FROM User WHERE Name = '${name}' AND IsActive = true`,
      "--json",
    ];
    if (targetOrg) exactQueryArgs.push("--target-org", targetOrg);

    try {
      const queryOutput = runSf(exactQueryArgs);
      const queryResult = JSON.parse(queryOutput);
      records = (queryResult.result || queryResult).records || [];
    } catch (err) {
      handleError(err, `Failed to search for user: ${name}`);
    }

    // If no exact match, try partial match
    if (records.length === 0) {
      const likeQueryArgs = [
        "data", "query",
        "--query", `SELECT Id, Name, Username FROM User WHERE Name LIKE '%${name}%' AND IsActive = true`,
        "--json",
      ];
      if (targetOrg) likeQueryArgs.push("--target-org", targetOrg);

      try {
        const queryOutput = runSf(likeQueryArgs);
        const queryResult = JSON.parse(queryOutput);
        records = (queryResult.result || queryResult).records || [];
      } catch (err) {
        handleError(err, `Failed to search for user: ${name}`);
      }
    }

    if (records.length === 0) {
      die(`No active user found matching name: ${name}`);
    }

    if (records.length > 1) {
      console.log(`  Found ${records.length} matching users:`);
      console.log();
      for (const r of records) {
        console.log(`    ${r.Name}  (${r.Username})`);
      }
      console.log();
      die("Multiple users found. Please use --username with the exact username from the list above.");
    }

    userId = records[0].Id;
    resolvedUsername = records[0].Username;
    console.log(`  Found: ${records[0].Name} (${records[0].Username})`);
  }

  console.log(`  User ID: ${userId}`);
  console.log();
}

// ── Query existing trace flags ─────────────────────────────────────────────

let query = "SELECT Id, TracedEntityId, LogType, DebugLevelId, StartDate, ExpirationDate FROM TraceFlag";
if (!removeAll) {
  query += ` WHERE TracedEntityId = '${userId}'`;
}

console.log(removeAll ? "Querying all trace flags..." : `Querying trace flags for ${resolvedUsername}...`);

const queryArgs = [
  "data", "query",
  "--query", query,
  "--use-tooling-api",
  "--json",
];
if (targetOrg) queryArgs.push("--target-org", targetOrg);

let traceFlags = [];
try {
  const queryOutput = runSf(queryArgs);
  const queryResult = JSON.parse(queryOutput);
  traceFlags = (queryResult.result || queryResult).records || [];
} catch (err) {
  handleError(err, "Failed to query trace flags.");
}

if (traceFlags.length === 0) {
  console.log("  No trace flags found.");
  if (jsonOutput) {
    console.log(JSON.stringify({ removed: 0, traceFlags: [] }, null, 2));
  }
  process.exit(0);
}

console.log(`  Found ${traceFlags.length} trace flag(s).`);
console.log();

// ── Display existing trace flags ───────────────────────────────────────────

for (const flag of traceFlags) {
  const expDate = flag.ExpirationDate ? new Date(flag.ExpirationDate) : null;
  const isExpired = expDate && expDate < new Date();
  console.log(`  ${flag.Id}  ${flag.LogType || "N/A"}  expires: ${expDate ? expDate.toLocaleString() : "N/A"}${isExpired ? " (expired)" : ""}`);
}
console.log();

// ── Delete trace flags ─────────────────────────────────────────────────────

console.log("Removing trace flags...");

const removed = [];
const failed = [];

for (const flag of traceFlags) {
  const delArgs = [
    "data", "delete", "record",
    "--sobject", "TraceFlag",
    "--record-id", flag.Id,
    "--use-tooling-api",
    "--json",
  ];
  if (targetOrg) delArgs.push("--target-org", targetOrg);

  try {
    runSf(delArgs);
    removed.push(flag.Id);
    console.log(`  Removed: ${flag.Id}`);
  } catch (err) {
    failed.push({ id: flag.Id, error: getErrorMessage(err) });
    console.error(`  Failed to remove: ${flag.Id}`);
  }
}

// ── Clean up orphaned DebugLevel records created by this tool ──────────────

const debugLevelIds = [...new Set(traceFlags.map((f) => f.DebugLevelId).filter(Boolean))];

for (const dlId of debugLevelIds) {
  // Check if this debug level is still used by other trace flags
  const dlCheckArgs = [
    "data", "query",
    "--query", `SELECT Id FROM TraceFlag WHERE DebugLevelId = '${dlId}'`,
    "--use-tooling-api",
    "--json",
  ];
  if (targetOrg) dlCheckArgs.push("--target-org", targetOrg);

  try {
    const dlCheckOutput = runSf(dlCheckArgs);
    const dlCheckResult = JSON.parse(dlCheckOutput);
    const remaining = (dlCheckResult.result || dlCheckResult).records || [];

    if (remaining.length === 0) {
      // Check if it's one we created (starts with Claude_)
      const dlInfoArgs = [
        "data", "query",
        "--query", `SELECT Id, DeveloperName FROM DebugLevel WHERE Id = '${dlId}'`,
        "--use-tooling-api",
        "--json",
      ];
      if (targetOrg) dlInfoArgs.push("--target-org", targetOrg);

      const dlInfoOutput = runSf(dlInfoArgs);
      const dlInfoResult = JSON.parse(dlInfoOutput);
      const dlRecords = (dlInfoResult.result || dlInfoResult).records || [];

      if (dlRecords.length > 0 && dlRecords[0].DeveloperName && dlRecords[0].DeveloperName.startsWith("Claude_")) {
        const dlDelArgs = [
          "data", "delete", "record",
          "--sobject", "DebugLevel",
          "--record-id", dlId,
          "--use-tooling-api",
          "--json",
        ];
        if (targetOrg) dlDelArgs.push("--target-org", targetOrg);

        runSf(dlDelArgs);
        console.log(`  Cleaned up debug level: ${dlId} (${dlRecords[0].DeveloperName})`);
      }
    }
  } catch {
    // Non-critical — skip cleanup errors
  }
}

console.log();

// ── Output ─────────────────────────────────────────────────────────────────

const summary = {
  removed: removed.length,
  failed: failed.length,
  traceFlags: removed,
  errors: failed,
};

if (jsonOutput) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed.length > 0 ? 1 : 0);
}

console.log("=== Trace Flag Removed ===");
console.log(`  Removed: ${removed.length} trace flag(s)`);
if (failed.length > 0) {
  console.log(`  Failed:  ${failed.length} trace flag(s)`);
}
if (!removeAll) {
  console.log(`  User:    ${resolvedUsername}`);
}

if (failed.length > 0) {
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function getErrorMessage(err) {
  if (err.stdout) {
    try {
      const parsed = JSON.parse(err.stdout);
      return parsed.message || parsed.name || "";
    } catch {
      // ignore
    }
  }
  if (err.stderr) return err.stderr.toString().trim();
  return err.message || "Unknown error";
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
