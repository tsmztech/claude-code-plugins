#!/usr/bin/env node
/**
 * sf-auth.js - Authenticate to a Salesforce org using Salesforce CLI (sf v2)
 *
 * Usage:
 *   node sf-auth.js                              # Interactive browser login (default)
 *   node sf-auth.js --method web                  # Browser-based OAuth login
 *   node sf-auth.js --method jwt \
 *       --client-id <id> \
 *       --jwt-key-file <path> \
 *       --username <user>                         # JWT Bearer flow (CI/CD)
 *   node sf-auth.js --method sfdx-url \
 *       --sfdx-url-file <path>                    # SFDX Auth URL flow
 *   node sf-auth.js --method device               # Device code flow (headless)
 *   node sf-auth.js --status                      # Show currently authenticated orgs
 *   node sf-auth.js --set-default <alias>         # Set an org as default
 *
 * Options:
 *   --alias, -a          Alias for the org
 *   --instance-url, -r   Login URL (default: https://login.salesforce.com)
 *                        Use https://test.salesforce.com for sandboxes
 *   --set-default, -d    Set as default org / set existing alias as default
 *   --status             List all authenticated orgs
 *   --method, -m         Auth method: web, jwt, sfdx-url, device (default: web)
 *   --client-id          Connected App consumer key (for JWT)
 *   --jwt-key-file       Path to JWT private key file (for JWT)
 *   --username           Salesforce username (for JWT)
 *   --sfdx-url-file      Path to file containing SFDX auth URL
 *   --help, -h           Show this help message
 */

const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");

// ── Parse arguments ─────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
let method = "web";
let alias = "";
let instanceUrl = "";
let setDefault = "";
let status = false;
let clientId = "";
let jwtKeyFile = "";
let username = "";
let sfdxUrlFile = "";

for (let i = 0; i < argv.length; i++) {
  switch (argv[i]) {
    case "--method":
    case "-m":
      method = argv[++i] || "";
      break;
    case "--alias":
    case "-a":
      alias = argv[++i] || "";
      break;
    case "--instance-url":
    case "-r":
      instanceUrl = argv[++i] || "";
      break;
    case "--set-default":
    case "-d":
      setDefault = argv[++i] || "";
      break;
    case "--status":
      status = true;
      break;
    case "--client-id":
      clientId = argv[++i] || "";
      break;
    case "--jwt-key-file":
      jwtKeyFile = argv[++i] || "";
      break;
    case "--username":
      username = argv[++i] || "";
      break;
    case "--sfdx-url-file":
      sfdxUrlFile = argv[++i] || "";
      break;
    case "--help":
    case "-h":
      console.log(
        [
          "Usage: node sf-auth.js [options]",
          "",
          "Options:",
          "  --method, -m <method>          Auth method: web, jwt, sfdx-url, device (default: web)",
          "  --alias, -a <alias>            Alias for the org",
          "  --instance-url, -r <url>       Login URL (use https://test.salesforce.com for sandboxes)",
          "  --set-default, -d <alias>      Set an org as default target org",
          "  --status                       List all authenticated orgs",
          "  --client-id <key>              Connected App consumer key (JWT)",
          "  --jwt-key-file <path>          Path to JWT private key file (JWT)",
          "  --username <user>              Salesforce username (JWT)",
          "  --sfdx-url-file <path>         Path to SFDX auth URL file",
          "  --help, -h                     Show this help message",
        ].join("\n")
      );
      process.exit(0);
      break;
    default:
      console.error(`ERROR: Unknown option: ${argv[i]}`);
      process.exit(1);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: opts.inherit ? "inherit" : ["pipe", "pipe", "pipe"],
    ...opts,
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      die(`Salesforce CLI (sf) is not installed. Install it with: npm install -g @salesforce/cli`);
    }
    die(result.error.message);
  }
  return result;
}

function runJson(cmd, args) {
  const result = run(cmd, args);
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

// ── Status ──────────────────────────────────────────────────────────────────

if (status) {
  console.log("=== Authenticated Salesforce Orgs ===");

  const data = runJson("sf", ["org", "list", "--json"]);
  if (!data) {
    // Fallback to plain text output
    run("sf", ["org", "list"], { inherit: true });
    process.exit(0);
  }

  const result = data.result || {};
  let found = false;

  for (const category of ["nonScratchOrgs", "scratchOrgs"]) {
    const orgs = result[category] || [];
    if (orgs.length) {
      found = true;
      console.log(`\n--- ${category} ---`);
      for (const org of orgs) {
        const def = org.isDefaultUsername ? " (DEFAULT)" : "";
        console.log(`  Alias: ${org.alias || "N/A"}${def}`);
        console.log(`  Username: ${org.username || "N/A"}`);
        console.log(`  Instance: ${org.instanceUrl || "N/A"}`);
        console.log(`  Status: ${org.connectedStatus || "Unknown"}`);
        console.log();
      }
    }
  }

  if (!found) console.log("  No authenticated orgs found.");
  process.exit(0);
}

// ── Set default org ─────────────────────────────────────────────────────────

if (setDefault) {
  console.log(`Setting default org to: ${setDefault}`);
  const result = run("sf", ["config", "set", "target-org", setDefault], { inherit: true });
  if (result.status !== 0) die("Failed to set default org.");
  console.log("Default org set successfully.");
  process.exit(0);
}

// ── Build common flags ──────────────────────────────────────────────────────

const commonFlags = [];
if (alias) commonFlags.push("--alias", alias);
if (instanceUrl) commonFlags.push("--instance-url", instanceUrl);

// ── Authenticate ────────────────────────────────────────────────────────────

let sfArgs;

switch (method) {
  case "web":
    console.log("Opening browser for Salesforce login...");
    if (instanceUrl) console.log(`Login URL: ${instanceUrl}`);
    if (alias) console.log(`Org alias: ${alias}`);
    sfArgs = ["org", "login", "web", ...commonFlags];
    break;

  case "jwt":
    if (!clientId) die("--client-id is required for JWT auth");
    if (!jwtKeyFile) die("--jwt-key-file is required for JWT auth");
    if (!username) die("--username is required for JWT auth");

    console.log("Authenticating via JWT Bearer flow...");
    console.log(`Username: ${username}`);
    sfArgs = [
      "org", "login", "jwt",
      "--client-id", clientId,
      "--jwt-key-file", jwtKeyFile,
      "--username", username,
      ...commonFlags,
    ];
    break;

  case "sfdx-url":
    if (!sfdxUrlFile) die("--sfdx-url-file is required for sfdx-url auth");
    if (!fs.existsSync(sfdxUrlFile)) die(`File not found: ${sfdxUrlFile}`);

    console.log("Authenticating via SFDX Auth URL...");
    sfArgs = ["org", "login", "sfdx-url", "--sfdx-url-file", sfdxUrlFile, ...commonFlags];
    break;

  case "device":
    console.log("Authenticating via device code flow...");
    if (alias) console.log(`Org alias: ${alias}`);
    sfArgs = ["org", "login", "device", ...commonFlags];
    break;

  default:
    die(`Unknown auth method: ${method}. Use: web, jwt, sfdx-url, device`);
}

const authResult = run("sf", sfArgs, { inherit: true });
if (authResult.status !== 0) {
  die("Authentication failed.");
}

// ── Verify ──────────────────────────────────────────────────────────────────

console.log();
console.log("=== Authentication Successful ===");
const displayArgs = ["org", "display"];
if (alias) displayArgs.push("--target-org", alias);
run("sf", displayArgs, { inherit: true });
