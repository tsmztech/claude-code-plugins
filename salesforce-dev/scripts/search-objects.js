#!/usr/bin/env node
/**
 * search-objects.js - Search for Salesforce standard and custom objects by name pattern
 *
 * Shared utility for the salesforce-dev plugin. Queries the EntityDefinition
 * sObject via SOQL to find objects matching a search pattern by API name or label,
 * with server-side filtering.
 *
 * Usage:
 *   node search-objects.js <pattern>                              # e.g. "Account"
 *   node search-objects.js <pattern> --target-org <alias>         # Specific org
 *   node search-objects.js <pattern> --custom-only                # Only custom objects
 *   node search-objects.js <pattern> --standard-only              # Only standard objects
 *   node search-objects.js <pattern> --queryable                  # Only queryable objects
 *   node search-objects.js <pattern> --json                       # Raw JSON output
 *
 * Options:
 *   --target-org, -o   Target org alias or username
 *   --custom-only      Show only custom objects (__c)
 *   --standard-only    Show only standard objects
 *   --queryable        Show only queryable objects
 *   --json             Output raw JSON
 *   --limit, -l        Max results to display (default: 50)
 *   --help, -h         Show this help message
 *
 * Examples:
 *   node search-objects.js Account              # Finds Account, AccountHistory, etc.
 *   node search-objects.js "Order Work"         # Finds WorkOrder, WorkOrderLineItem, etc.
 *   node search-objects.js Order --custom-only  # Finds custom objects containing "Order"
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
let searchPattern = "";
let targetOrg = "";
let customOnly = false;
let standardOnly = false;
let queryableOnly = false;
let rawOutput = false;
let limit = 50;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--target-org":
    case "-o":
      targetOrg = args[++i] || "";
      break;
    case "--custom-only":
      customOnly = true;
      break;
    case "--standard-only":
      standardOnly = true;
      break;
    case "--queryable":
      queryableOnly = true;
      break;
    case "--json":
      rawOutput = true;
      break;
    case "--limit":
    case "-l":
      limit = parseInt(args[++i], 10) || 50;
      break;
    case "--help":
    case "-h":
      console.log(
        [
          "Usage: node search-objects.js <pattern> [options]",
          "",
          "Search for Salesforce objects by name pattern.",
          "",
          "Options:",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --custom-only              Show only custom objects",
          "  --standard-only            Show only standard objects",
          "  --queryable                Show only queryable objects",
          "  --json                     Output raw JSON",
          "  --limit, -l <n>            Max results to display (default: 50)",
          "  --help, -h                 Show this help message",
          "",
          "Examples:",
          "  node search-objects.js Account",
          '  node search-objects.js "Order Work"',
          "  node search-objects.js Order --custom-only",
          "  node search-objects.js Case --target-org myDevOrg",
        ].join("\n")
      );
      process.exit(0);
      break;
    default:
      if (args[i].startsWith("-")) {
        console.error(`ERROR: Unknown option: ${args[i]}`);
        process.exit(1);
      }
      if (!searchPattern) {
        searchPattern = args[i];
      } else {
        // Append additional words to search pattern
        searchPattern += " " + args[i];
      }
  }
}

if (!searchPattern) {
  console.error(
    "ERROR: Search pattern is required. Usage: node search-objects.js <pattern>\n" +
      "Example: node search-objects.js Account"
  );
  process.exit(1);
}

// ── Build SOQL query ────────────────────────────────────────────────────────

const searchTerms = searchPattern.split(/\s+/).filter((t) => t.length > 0);

// Escape single quotes in search terms for SOQL safety
const escapeTerm = (t) => t.replace(/'/g, "\\'");

// Each term must match QualifiedApiName
const whereClauses = searchTerms.map((term) => {
  const escaped = escapeTerm(term);
  return `QualifiedApiName LIKE '%${escaped}%'`;
});

const soql =
  "SELECT QualifiedApiName, Label, IsQueryable" +
  " FROM EntityDefinition" +
  " WHERE " +
  whereClauses.join(" AND ") +
  " ORDER BY QualifiedApiName";

// ── Execute query ───────────────────────────────────────────────────────────

console.log(`Searching for: "${searchPattern}"`);
if (targetOrg) console.log(`Target Org: ${targetOrg}`);
if (customOnly) console.log("Filter: custom objects only");
if (standardOnly) console.log("Filter: standard objects only");
if (queryableOnly) console.log("Filter: queryable objects only");
console.log();

const sfArgs = ["data", "query", "--query", soql, "--json"];
if (targetOrg) sfArgs.push("--target-org", targetOrg);

let matchingObjects;
try {
  const output = runSf(sfArgs);
  const parsed = JSON.parse(output);
  const result = parsed.result || parsed;
  matchingObjects = (result.records || []).map((rec) => ({
    name: rec.QualifiedApiName,
    label: rec.Label || "",
    custom: (rec.QualifiedApiName || "").endsWith("__c"),
    queryable: rec.IsQueryable,
  }));
} catch (err) {
  if (err.stderr) process.stderr.write(err.stderr);
  console.error(
    "ERROR: Failed to query objects. Ensure you are authenticated (run sf-auth.js) and have access."
  );
  process.exit(1);
}

// ── Post-filter locally ─────────────────────────────────────────────────────

if (customOnly) matchingObjects = matchingObjects.filter((o) => o.custom);
if (standardOnly) matchingObjects = matchingObjects.filter((o) => !o.custom);
if (queryableOnly)
  matchingObjects = matchingObjects.filter((o) => o.queryable);

// ── Output ──────────────────────────────────────────────────────────────────

if (matchingObjects.length === 0) {
  console.log(`No Salesforce objects found matching "${searchPattern}".`);
  process.exit(0);
}

if (rawOutput) {
  console.log(JSON.stringify(matchingObjects.slice(0, limit), null, 2));
  process.exit(0);
}

const total = matchingObjects.length;
const displayed = matchingObjects.slice(0, limit);

console.log(`Found ${total} matching object${total !== 1 ? "s" : ""}:\n`);

// Column header
console.log(
  `${pad("API Name", 45)} ${pad("Label", 35)} ${pad("Type", 10)} Queryable`
);
console.log("-".repeat(100));

displayed
  .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
  .forEach((obj) => {
    let apiName = obj.name || "";
    let label = obj.label || "";
    if (apiName.length > 43) apiName = apiName.slice(0, 40) + "...";
    if (label.length > 33) label = label.slice(0, 30) + "...";

    const type = obj.custom ? "Custom" : "Standard";
    const queryable =
      obj.queryable !== undefined ? (obj.queryable ? "Yes" : "No") : "N/A";

    console.log(
      `${pad(apiName, 45)} ${pad(label, 35)} ${pad(type, 10)} ${queryable}`
    );
  });

if (total > limit) {
  console.log(`\n... and ${total - limit} more. Use --limit to see more.`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pad(str, len) {
  str = String(str);
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}
