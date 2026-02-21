#!/usr/bin/env node
/**
 * list-profiles.js - List Salesforce profiles and optionally permission sets
 *
 * Shared utility for the salesforce-dev plugin. Queries profiles (and optionally
 * permission sets) from the connected org via SOQL for use in field-level security,
 * object permissions, and other access-control workflows.
 *
 * Usage:
 *   node list-profiles.js                              # List all profiles
 *   node list-profiles.js --target-org <alias>         # Specific org
 *   node list-profiles.js --include-permission-sets    # Also list permission sets
 *   node list-profiles.js --active-only                # Only active user license profiles
 *   node list-profiles.js --filter "Admin"             # Filter by name pattern
 *   node list-profiles.js --json                       # Raw JSON output
 *
 * Options:
 *   --target-org, -o            Target org alias or username
 *   --include-permission-sets   Also list permission sets
 *   --active-only               Only profiles with active user licenses
 *   --filter, -f                Filter results by name pattern (case-insensitive)
 *   --custom-only               Show only custom profiles (not standard)
 *   --json                      Output raw JSON
 *   --limit, -l                 Max results to display (default: 100)
 *   --help, -h                  Show this help message
 *
 * Examples:
 *   node list-profiles.js                              # All profiles
 *   node list-profiles.js --active-only                # Active profiles only
 *   node list-profiles.js --include-permission-sets    # Profiles + permission sets
 *   node list-profiles.js --filter "Sales"             # Profiles matching "Sales"
 *   node list-profiles.js --custom-only --active-only  # Active custom profiles
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
let targetOrg = "";
let includePermSets = false;
let activeOnly = false;
let customOnly = false;
let filterPattern = "";
let rawOutput = false;
let limit = 100;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--target-org":
    case "-o":
      targetOrg = args[++i] || "";
      break;
    case "--include-permission-sets":
      includePermSets = true;
      break;
    case "--active-only":
      activeOnly = true;
      break;
    case "--custom-only":
      customOnly = true;
      break;
    case "--filter":
    case "-f":
      filterPattern = args[++i] || "";
      break;
    case "--json":
      rawOutput = true;
      break;
    case "--limit":
    case "-l":
      limit = parseInt(args[++i], 10) || 100;
      break;
    case "--help":
    case "-h":
      console.log(
        [
          "Usage: node list-profiles.js [options]",
          "",
          "List Salesforce profiles and optionally permission sets.",
          "",
          "Options:",
          "  --target-org, -o <alias>     Target org alias or username",
          "  --include-permission-sets    Also list permission sets",
          "  --active-only                Only profiles with active user licenses",
          "  --custom-only                Show only custom profiles",
          "  --filter, -f <pattern>       Filter by name pattern (case-insensitive)",
          "  --json                       Output raw JSON",
          "  --limit, -l <n>              Max results (default: 100)",
          "  --help, -h                   Show this help message",
          "",
          "Examples:",
          "  node list-profiles.js",
          "  node list-profiles.js --active-only",
          "  node list-profiles.js --include-permission-sets",
          '  node list-profiles.js --filter "Sales"',
          "  node list-profiles.js --custom-only --active-only",
        ].join("\n")
      );
      process.exit(0);
      break;
    default:
      if (args[i].startsWith("-")) {
        console.error(`ERROR: Unknown option: ${args[i]}`);
        process.exit(1);
      }
      // Treat positional args as filter pattern
      if (!filterPattern) {
        filterPattern = args[i];
      } else {
        filterPattern += " " + args[i];
      }
  }
}

// ── Query profiles ──────────────────────────────────────────────────────────

console.log("Listing profiles...");
if (targetOrg) console.log(`Target Org: ${targetOrg}`);
if (activeOnly) console.log("Filter: active user licenses only");
if (customOnly) console.log("Filter: custom profiles only");
if (filterPattern) console.log(`Filter: name contains "${filterPattern}"`);
console.log();

const escapeSoql = (t) => t.replace(/'/g, "\\'");

// Profile query - use UserLicense join for active filtering
let profileSoql =
  "SELECT Id, Name, UserLicense.Name, UserType" +
  " FROM Profile" +
  " ORDER BY Name";

const profileArgs = ["data", "query", "--query", profileSoql, "--json"];
if (targetOrg) profileArgs.push("--target-org", targetOrg);

let profiles = [];
try {
  const output = runSf(profileArgs);
  const parsed = JSON.parse(output);
  const result = parsed.result || parsed;
  profiles = (result.records || []).map((rec) => ({
    id: rec.Id,
    name: rec.Name || "",
    userLicense: rec.UserLicense ? rec.UserLicense.Name : "",
    userType: rec.UserType || "",
    type: "Profile",
    custom: !isStandardProfile(rec.Name || ""),
  }));
} catch (err) {
  if (err.stderr) process.stderr.write(err.stderr);
  console.error(
    "ERROR: Failed to query profiles. Ensure you are authenticated (run sf-auth.js) and have access."
  );
  process.exit(1);
}

// ── Query permission sets (optional) ────────────────────────────────────────

let permSets = [];
if (includePermSets) {
  const permSetSoql =
    "SELECT Id, Name, Label, IsCustom, IsOwnedByProfile" +
    " FROM PermissionSet" +
    " WHERE IsOwnedByProfile = false" +
    " ORDER BY Label";

  const permSetArgs = ["data", "query", "--query", permSetSoql, "--json"];
  if (targetOrg) permSetArgs.push("--target-org", targetOrg);

  try {
    const output = runSf(permSetArgs);
    const parsed = JSON.parse(output);
    const result = parsed.result || parsed;
    permSets = (result.records || []).map((rec) => ({
      id: rec.Id,
      name: rec.Label || rec.Name || "",
      apiName: rec.Name || "",
      userLicense: "",
      type: "Permission Set",
      custom: rec.IsCustom !== false,
    }));
  } catch (err) {
    // Non-fatal — just skip permission sets
    console.log("Warning: Could not query permission sets.");
  }
}

// ── Apply local filters ─────────────────────────────────────────────────────

let results = [...profiles, ...permSets];

if (activeOnly) {
  // Filter profiles to only those with commonly active license types
  // Standard, Salesforce, Salesforce Platform are the most common active licenses
  results = results.filter((r) => {
    if (r.type === "Permission Set") return true; // Don't filter perm sets by license
    // Exclude profiles tied to inactive/internal license types
    const inactiveLicenses = [
      "Guest User License",
      "High Volume Customer Portal",
      "Authenticated Website",
      "Customer Community Login",
      "Customer Community Plus Login",
      "External Apps Login",
      "External Identity",
    ];
    return !inactiveLicenses.some(
      (lic) => r.userLicense.toLowerCase() === lic.toLowerCase()
    );
  });
}

if (customOnly) {
  results = results.filter((r) => r.custom);
}

if (filterPattern) {
  const pattern = filterPattern.toLowerCase();
  results = results.filter((r) => r.name.toLowerCase().includes(pattern));
}

// ── Output ──────────────────────────────────────────────────────────────────

if (results.length === 0) {
  console.log("No matching profiles found.");
  if (filterPattern)
    console.log(`Try a different filter or remove --filter "${filterPattern}".`);
  process.exit(0);
}

if (rawOutput) {
  console.log(JSON.stringify(results.slice(0, limit), null, 2));
  process.exit(0);
}

const total = results.length;
const displayed = results.slice(0, limit);

// Separate profiles and permission sets for display
const displayProfiles = displayed.filter((r) => r.type === "Profile");
const displayPermSets = displayed.filter((r) => r.type === "Permission Set");

if (displayProfiles.length > 0) {
  console.log(`=== Profiles (${profiles.length} total${activeOnly ? ", filtered" : ""}) ===`);
  console.log();
  console.log(`${pad("Profile Name", 45)} ${pad("User License", 35)} Custom`);
  console.log("-".repeat(90));

  displayProfiles
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((p) => {
      let name = p.name;
      let license = p.userLicense;
      if (name.length > 43) name = name.slice(0, 40) + "...";
      if (license.length > 33) license = license.slice(0, 30) + "...";

      console.log(
        `${pad(name, 45)} ${pad(license, 35)} ${p.custom ? "Yes" : "No"}`
      );
    });
}

if (displayPermSets.length > 0) {
  if (displayProfiles.length > 0) console.log();
  console.log(`=== Permission Sets (${permSets.length} total) ===`);
  console.log();
  console.log(`${pad("Label", 45)} ${pad("API Name", 35)} Custom`);
  console.log("-".repeat(90));

  displayPermSets
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((p) => {
      let name = p.name;
      let apiName = p.apiName || "";
      if (name.length > 43) name = name.slice(0, 40) + "...";
      if (apiName.length > 33) apiName = apiName.slice(0, 30) + "...";

      console.log(
        `${pad(name, 45)} ${pad(apiName, 35)} ${p.custom ? "Yes" : "No"}`
      );
    });
}

if (total > limit) {
  console.log(`\n... and ${total - limit} more. Use --limit to see more.`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pad(str, len) {
  str = String(str);
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function isStandardProfile(name) {
  const standardProfiles = [
    "System Administrator",
    "Standard User",
    "Standard Platform User",
    "Marketing User",
    "Contract Manager",
    "Solution Manager",
    "Read Only",
    "Minimum Access - Salesforce",
    "Analytics Cloud Integration User",
    "Analytics Cloud Security User",
    "Chatter External User",
    "Chatter Free User",
    "Chatter Moderator User",
    "Cross Org Data Proxy User",
    "External Identity User",
    "Force.com - App Subscription User",
    "Force.com - Free User",
    "Gold Partner User",
    "Guest License User",
    "High Volume Customer Portal User",
    "Identity User",
    "Partner App Subscription User",
    "Silver Partner User",
    "Work.com Only User",
  ];
  return standardProfiles.some(
    (sp) => sp.toLowerCase() === name.toLowerCase()
  );
}
