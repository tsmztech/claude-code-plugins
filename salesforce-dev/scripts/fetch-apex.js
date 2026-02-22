#!/usr/bin/env node
/**
 * fetch-apex.js - Fetch Apex class/trigger source code from a Salesforce org
 *
 * Retrieves Apex source code via the Tooling API when files are not available
 * locally. Supports fetching single or multiple classes/triggers by name or pattern.
 *
 * Usage:
 *   node fetch-apex.js --name AccountService                          # Single class
 *   node fetch-apex.js --name AccountService,ContactService           # Multiple classes
 *   node fetch-apex.js --like Account%                                # Pattern match
 *   node fetch-apex.js --name AccountTrigger --type trigger           # Fetch a trigger
 *   node fetch-apex.js --name AccountService --target-org myOrg       # Specific org
 *   node fetch-apex.js --name AccountService --save                   # Save to local files
 *   node fetch-apex.js --name AccountService --json                   # Raw JSON output
 *   node fetch-apex.js --list                                         # List all classes
 *   node fetch-apex.js --list --type trigger                          # List all triggers
 *
 * Options:
 *   --name, -n          Comma-separated list of class/trigger names (without extension)
 *   --like, -l          SOQL LIKE pattern (e.g., Account%, %Service, %Test%)
 *   --type, -t          Type to fetch: class (default), trigger, or both
 *   --target-org, -o    Target org alias or username
 *   --save, -s          Save fetched source to local .cls/.trigger files
 *   --save-dir          Directory to save files (default: current directory)
 *   --list              List available classes/triggers (names only, no source)
 *   --json              Output raw JSON
 *   --help, -h          Show this help message
 */

const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const isWindows = process.platform === "win32";

// ── Helpers ─────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

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

const argv = process.argv.slice(2);
let names = [];
let likePattern = "";
let type = "class";
let targetOrg = "";
let save = false;
let saveDir = ".";
let listMode = false;
let rawOutput = false;

for (let i = 0; i < argv.length; i++) {
  switch (argv[i]) {
    case "--name":
    case "-n":
      names = (argv[++i] || "").split(",").map((n) => n.trim()).filter(Boolean);
      break;
    case "--like":
    case "-l":
      likePattern = argv[++i] || "";
      break;
    case "--type":
    case "-t":
      type = (argv[++i] || "class").toLowerCase();
      break;
    case "--target-org":
    case "-o":
      targetOrg = argv[++i] || "";
      break;
    case "--save":
    case "-s":
      save = true;
      break;
    case "--save-dir":
      saveDir = argv[++i] || ".";
      save = true;
      break;
    case "--list":
      listMode = true;
      break;
    case "--json":
      rawOutput = true;
      break;
    case "--help":
    case "-h":
      console.log(
        [
          "Usage: node fetch-apex.js [options]",
          "",
          "Fetch Apex class/trigger source code from a Salesforce org.",
          "",
          "Options:",
          "  --name, -n <names>       Comma-separated class/trigger names",
          "  --like, -l <pattern>     SOQL LIKE pattern (e.g., Account%, %Service)",
          "  --type, -t <type>        class (default), trigger, or both",
          "  --target-org, -o <alias> Target org alias or username",
          "  --save, -s               Save fetched source to local files",
          "  --save-dir <dir>         Directory to save files (default: .)",
          "  --list                   List available classes/triggers (no source)",
          "  --json                   Output raw JSON",
          "  --help, -h               Show this help message",
        ].join("\n")
      );
      process.exit(0);
      break;
    default:
      if (argv[i].startsWith("-")) {
        console.error(`ERROR: Unknown option: ${argv[i]}`);
        process.exit(1);
      }
      // Treat positional args as class names
      names.push(argv[i]);
  }
}

if (!listMode && names.length === 0 && !likePattern) {
  die(
    "Provide class/trigger names with --name, a pattern with --like, or use --list.\n" +
    "Run with --help for usage."
  );
}

if (!["class", "trigger", "both"].includes(type)) {
  die(`Invalid type: ${type}. Use: class, trigger, or both`);
}

// ── Build queries ───────────────────────────────────────────────────────────

function buildQuery(sObjectType, fetchBody) {
  const fields = fetchBody
    ? "Id, Name, Body, LengthWithoutComments, ApiVersion, Status, CreatedDate, LastModifiedDate"
    : "Id, Name, LengthWithoutComments, ApiVersion, Status, CreatedDate, LastModifiedDate";

  let where = "";

  if (names.length > 0) {
    const nameList = names.map((n) => `'${n.replace(/'/g, "\\'")}'`).join(",");
    where = `WHERE Name IN (${nameList})`;
  } else if (likePattern) {
    const safePat = likePattern.replace(/'/g, "\\'");
    where = `WHERE Name LIKE '${safePat}'`;
  }

  // For list mode on classes, only show Active status
  if (listMode && sObjectType === "ApexClass") {
    where = where ? `${where} AND Status = 'Active'` : "WHERE Status = 'Active'";
  }

  return `SELECT ${fields} FROM ${sObjectType} ${where} ORDER BY Name`;
}

function runQuery(query) {
  const sfArgs = ["data", "query", "--query", query, "--use-tooling-api", "--json"];
  if (targetOrg) sfArgs.push("--target-org", targetOrg);

  try {
    const output = runSf(sfArgs);
    const result = JSON.parse(output);

    if (result.status !== 0 && result.result === undefined) {
      const msg = result.message || result.name || "Query failed";
      die(msg);
    }

    return result.result || result;
  } catch (err) {
    if (err.stderr) process.stderr.write(err.stderr);
    die(
      "Failed to query Salesforce. Ensure you are authenticated (run sf-auth.js) " +
      "and the org is accessible."
    );
  }
}

// ── List mode ───────────────────────────────────────────────────────────────

if (listMode) {
  const types = type === "both" ? ["class", "trigger"] : [type];

  for (const t of types) {
    const sObj = t === "trigger" ? "ApexTrigger" : "ApexClass";
    const label = t === "trigger" ? "Triggers" : "Classes";
    const query = buildQuery(sObj, false);
    const data = runQuery(query);
    const records = data.records || [];

    if (rawOutput) {
      console.log(JSON.stringify(records, null, 2));
      continue;
    }

    console.log(`=== Apex ${label} (${records.length}) ===`);
    console.log();

    if (records.length === 0) {
      console.log(`  No ${t === "trigger" ? "triggers" : "classes"} found.`);
      console.log();
      continue;
    }

    const nameW = 45;
    const verW = 10;
    const linesW = 10;
    const statusW = 10;

    console.log(
      `${pad("Name", nameW)} ${pad("API Ver", verW)} ${pad("Lines", linesW)} ${pad("Status", statusW)} Last Modified`
    );
    console.log("-".repeat(nameW + verW + linesW + statusW + 25));

    for (const r of records) {
      const name = r.Name || "";
      const ver = r.ApiVersion != null ? `v${r.ApiVersion}` : "N/A";
      const lines = r.LengthWithoutComments != null ? String(r.LengthWithoutComments) : "N/A";
      const st = r.Status || "Active";
      const modified = r.LastModifiedDate ? r.LastModifiedDate.slice(0, 10) : "N/A";

      console.log(
        `${pad(name, nameW)} ${pad(ver, verW)} ${pad(lines, linesW)} ${pad(st, statusW)} ${modified}`
      );
    }
    console.log();
  }

  process.exit(0);
}

// ── Fetch mode ──────────────────────────────────────────────────────────────

const types = type === "both" ? ["class", "trigger"] : [type];
const allResults = [];

for (const t of types) {
  const sObj = t === "trigger" ? "ApexTrigger" : "ApexClass";
  const ext = t === "trigger" ? ".trigger" : ".cls";
  const label = t === "trigger" ? "Trigger" : "Class";
  const query = buildQuery(sObj, true);
  const data = runQuery(query);
  const records = data.records || [];

  for (const r of records) {
    allResults.push({
      name: r.Name,
      type: label,
      extension: ext,
      body: r.Body || "",
      apiVersion: r.ApiVersion,
      status: r.Status || "Active",
      linesWithoutComments: r.LengthWithoutComments,
      createdDate: r.CreatedDate,
      lastModifiedDate: r.LastModifiedDate,
    });
  }
}

// ── Check for missing names ─────────────────────────────────────────────────

if (names.length > 0) {
  const found = new Set(allResults.map((r) => r.name.toLowerCase()));
  const missing = names.filter((n) => !found.has(n.toLowerCase()));
  if (missing.length > 0) {
    console.error(`WARNING: Not found in org: ${missing.join(", ")}`);
    if (type !== "both") {
      console.error(
        `  (Searched ${type === "trigger" ? "ApexTrigger" : "ApexClass"} only. ` +
        `Try --type both if the name might be a ${type === "trigger" ? "class" : "trigger"}.)`
      );
    }
  }
}

if (allResults.length === 0) {
  die("No matching Apex classes or triggers found in the org.");
}

// ── Raw JSON output ─────────────────────────────────────────────────────────

if (rawOutput) {
  console.log(JSON.stringify(allResults, null, 2));
  process.exit(0);
}

// ── Save to files ───────────────────────────────────────────────────────────

if (save) {
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  for (const r of allResults) {
    const filePath = path.join(saveDir, r.name + r.extension);
    fs.writeFileSync(filePath, r.body, "utf8");
    console.log(`Saved: ${filePath} (${r.type}, v${r.apiVersion})`);
  }

  console.log(`\n${allResults.length} file(s) saved to ${path.resolve(saveDir)}`);
  process.exit(0);
}

// ── Print to stdout ─────────────────────────────────────────────────────────

for (const r of allResults) {
  console.log(`${"=".repeat(80)}`);
  console.log(`${r.type}: ${r.name}${r.extension}`);
  console.log(`API Version: v${r.apiVersion} | Status: ${r.status} | Lines (excl. comments): ${r.linesWithoutComments || "N/A"}`);
  console.log(`Last Modified: ${r.lastModifiedDate ? r.lastModifiedDate.slice(0, 10) : "N/A"}`);
  console.log(`${"=".repeat(80)}`);
  console.log(r.body);
  console.log();
}

console.log(`--- ${allResults.length} file(s) fetched ---`);

// ── Utilities ───────────────────────────────────────────────────────────────

function pad(str, len) {
  str = String(str);
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}
