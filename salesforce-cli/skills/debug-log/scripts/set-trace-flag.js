#!/usr/bin/env node
/**
 * set-trace-flag.js - Set a user trace flag in Salesforce
 *
 * Creates a DebugLevel and TraceFlag on the Tooling API to enable
 * debug log capture for a specified user. User is required — provide
 * either --username (exact) or --name (search by name).
 *
 * Usage:
 *   node set-trace-flag.js --username admin@myorg.com                  # By username
 *   node set-trace-flag.js --name "John Doe"                          # By full name
 *   node set-trace-flag.js --name Doe                                 # By partial name
 *   node set-trace-flag.js --username admin@myorg.com --level finest   # Finest logging
 *   node set-trace-flag.js --help                                      # Show help
 *
 * Options:
 *   --username, -u     Exact username (e.g. admin@myorg.com)
 *   --name, -n         Search by user name (exact or partial match)
 *   --level, -l        Debug level preset: finest, debug, apex (default: debug)
 *   --duration, -d     Duration in minutes (default: 30, max: 1440)
 *   --log-type, -t     DEVELOPER_LOG or USER_DEBUG (default: DEVELOPER_LOG)
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

// ── Debug level presets ────────────────────────────────────────────────────

const PRESETS = {
  finest: {
    ApexCode: "FINEST",
    ApexProfiling: "FINEST",
    Callout: "FINEST",
    Database: "FINEST",
    System: "DEBUG",
    Validation: "INFO",
    Visualforce: "FINER",
    Workflow: "FINER",
    Wave: "FINEST",
    Nba: "FINE",
  },
  debug: {
    ApexCode: "DEBUG",
    ApexProfiling: "INFO",
    Callout: "INFO",
    Database: "INFO",
    System: "DEBUG",
    Validation: "INFO",
    Visualforce: "NONE",
    Workflow: "INFO",
    Wave: "NONE",
    Nba: "NONE",
  },
  apex: {
    ApexCode: "FINEST",
    ApexProfiling: "FINE",
    Callout: "NONE",
    Database: "INFO",
    System: "DEBUG",
    Validation: "NONE",
    Visualforce: "NONE",
    Workflow: "NONE",
    Wave: "NONE",
    Nba: "NONE",
  },
};

const VALID_LOG_TYPES = ["DEVELOPER_LOG", "USER_DEBUG"];

// ── Parse arguments ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let username = "";
let name = "";
let level = "debug";
let duration = 30;
let logType = "DEVELOPER_LOG";
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
    case "--level":
    case "-l":
      level = (args[++i] || "").toLowerCase();
      break;
    case "--duration":
    case "-d":
      duration = parseInt(args[++i] || "30", 10);
      break;
    case "--log-type":
    case "-t":
      logType = (args[++i] || "").toUpperCase();
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
          "Usage: node set-trace-flag.js --username <user> | --name <name> [options]",
          "",
          "Set a user trace flag to enable debug logging.",
          "One of --username or --name is required.",
          "",
          "Options:",
          "  --username, -u <user>      Exact username (e.g. admin@myorg.com)",
          "  --name, -n <name>          Search by user name (exact or partial)",
          "  --level, -l <preset>       Debug level: finest, debug, apex (default: debug)",
          "  --duration, -d <minutes>   Duration in minutes (default: 30, max: 1440)",
          "  --log-type, -t <type>      DEVELOPER_LOG or USER_DEBUG (default: DEVELOPER_LOG)",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --json                     Output raw JSON",
          "  --help, -h                 Show this help message",
          "",
          "Debug Level Presets:",
          "  finest   All categories at maximum verbosity",
          "  debug    Balanced logging (default)",
          "  apex     Apex-focused, minimal noise from other categories",
          "",
          "Examples:",
          "  node set-trace-flag.js --username admin@myorg.com",
          "  node set-trace-flag.js --name \"John Doe\" --level finest --duration 60",
          "  node set-trace-flag.js --name Doe --level apex --target-org mySandbox",
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

if (!username && !name) {
  die("User is required. Provide --username <username> or --name <name>. Use --help for usage.");
}

if (username && name) {
  die("Provide either --username or --name, not both.");
}

if (!PRESETS[level]) {
  die(`Invalid level: ${level}. Must be one of: ${Object.keys(PRESETS).join(", ")}`);
}

if (isNaN(duration) || duration < 1 || duration > 1440) {
  die("Duration must be between 1 and 1440 minutes (24 hours).");
}

if (!VALID_LOG_TYPES.includes(logType)) {
  die(`Invalid log type: ${logType}. Must be one of: ${VALID_LOG_TYPES.join(", ")}`);
}

const preset = PRESETS[level];

// ── Resolve user ───────────────────────────────────────────────────────────

console.log("=== Set User Trace Flag ===");
console.log();

let userId = "";
let resolvedUsername = "";

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

  // Try exact match first, then LIKE
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
    // Multiple matches — list them and exit so Claude can ask the user to pick
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

// ── Create DebugLevel ──────────────────────────────────────────────────────

const debugLevelName = `Claude_${level}_${Date.now().toString(36)}`;

console.log(`Creating debug level: ${debugLevelName} (${level} preset)`);

const dlValues = [
  `DeveloperName=${debugLevelName}`,
  `MasterLabel=${debugLevelName}`,
  `ApexCode=${preset.ApexCode}`,
  `ApexProfiling=${preset.ApexProfiling}`,
  `Callout=${preset.Callout}`,
  `Database=${preset.Database}`,
  `System=${preset.System}`,
  `Validation=${preset.Validation}`,
  `Visualforce=${preset.Visualforce}`,
  `Workflow=${preset.Workflow}`,
  `Wave=${preset.Wave}`,
  `Nba=${preset.Nba}`,
].join(" ");

const dlArgs = [
  "data", "create", "record",
  "--sobject", "DebugLevel",
  "--values", dlValues,
  "--use-tooling-api",
  "--json",
];
if (targetOrg) dlArgs.push("--target-org", targetOrg);

let debugLevelId = "";
try {
  const dlOutput = runSf(dlArgs);
  const dlResult = JSON.parse(dlOutput);
  const dlData = dlResult.result || dlResult;
  debugLevelId = dlData.id || dlData.Id || "";
} catch (err) {
  handleError(err, "Failed to create debug level.");
}

if (!debugLevelId) {
  die("Failed to create debug level — no ID returned.");
}

console.log(`  Debug Level ID: ${debugLevelId}`);
console.log();

// ── Check for existing trace flags ─────────────────────────────────────────

console.log("Checking for existing trace flags...");

const existingQuery = [
  "data", "query",
  "--query", `SELECT Id, LogType, ExpirationDate FROM TraceFlag WHERE TracedEntityId = '${userId}'`,
  "--use-tooling-api",
  "--json",
];
if (targetOrg) existingQuery.push("--target-org", targetOrg);

let existingFlags = [];
try {
  const existingOutput = runSf(existingQuery);
  const existingResult = JSON.parse(existingOutput);
  existingFlags = (existingResult.result || existingResult).records || [];
} catch {
  // Not critical — continue to create new trace flag
}

if (existingFlags.length > 0) {
  console.log(`  Found ${existingFlags.length} existing trace flag(s) for this user.`);
  // Delete existing trace flags to avoid conflicts
  for (const flag of existingFlags) {
    try {
      const delArgs = [
        "data", "delete", "record",
        "--sobject", "TraceFlag",
        "--record-id", flag.Id,
        "--use-tooling-api",
        "--json",
      ];
      if (targetOrg) delArgs.push("--target-org", targetOrg);
      runSf(delArgs);
      console.log(`  Removed existing trace flag: ${flag.Id}`);
    } catch {
      // Continue even if deletion fails
    }
  }
  console.log();
}

// ── Create TraceFlag ───────────────────────────────────────────────────────

const now = new Date();
const expiration = new Date(now.getTime() + duration * 60 * 1000);
const startDateStr = now.toISOString().replace(/\.\d{3}Z$/, ".000+0000");
const expirationStr = expiration.toISOString().replace(/\.\d{3}Z$/, ".000+0000");

console.log(`Creating trace flag...`);
console.log(`  Log Type: ${logType}`);
console.log(`  Duration: ${duration} minutes`);
console.log(`  Start: ${now.toLocaleString()}`);
console.log(`  Expires: ${expiration.toLocaleString()}`);

const tfValues = [
  `TracedEntityId=${userId}`,
  `LogType=${logType}`,
  `DebugLevelId=${debugLevelId}`,
  `StartDate=${startDateStr}`,
  `ExpirationDate=${expirationStr}`,
].join(" ");

const tfArgs = [
  "data", "create", "record",
  "--sobject", "TraceFlag",
  "--values", tfValues,
  "--use-tooling-api",
  "--json",
];
if (targetOrg) tfArgs.push("--target-org", targetOrg);

let traceFlagId = "";
try {
  const tfOutput = runSf(tfArgs);
  const tfResult = JSON.parse(tfOutput);
  const tfData = tfResult.result || tfResult;
  traceFlagId = tfData.id || tfData.Id || "";
} catch (err) {
  handleError(err, "Failed to create trace flag.");
}

if (!traceFlagId) {
  die("Failed to create trace flag — no ID returned.");
}

console.log(`  Trace Flag ID: ${traceFlagId}`);
console.log();

// ── Output ─────────────────────────────────────────────────────────────────

const summary = {
  traceFlagId,
  debugLevelId,
  userId,
  username: resolvedUsername,
  logType,
  level,
  duration,
  startDate: startDateStr,
  expirationDate: expirationStr,
  preset,
};

if (jsonOutput) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

console.log("=== Trace Flag Set ===");
console.log(`  User:         ${resolvedUsername}`);
console.log(`  Trace Flag:   ${traceFlagId}`);
console.log(`  Debug Level:  ${level} (${debugLevelId})`);
console.log(`  Log Type:     ${logType}`);
console.log(`  Expires:      ${expiration.toLocaleString()} (${duration} min)`);
console.log();
console.log("The user should now perform the action to be debugged.");
console.log("Then retrieve logs with: get-log.js --list");

// ── Helpers ────────────────────────────────────────────────────────────────

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
