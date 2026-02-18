#!/usr/bin/env node
/**
 * upsert.js - Upsert a single record in Salesforce using an external ID field
 *
 * Inserts a new record if no match is found on the external ID field, or updates
 * the existing record if a match exists. Uses the Salesforce REST API via sf CLI.
 *
 * Usage:
 *   node upsert.js <ObjectName> --external-id <field> --external-id-value <value> --values "Name='Acme'"
 *   node upsert.js Account -e External_Id__c --external-id-value EXT-001 -v "Name='Acme' Industry='Tech'"
 *   node upsert.js Account -e External_Id__c --external-id-value EXT-001 -v "Name='Acme'" --json
 *   node upsert.js --help
 *
 * Options:
 *   --external-id, -e         External ID field API name (required)
 *   --external-id-value       Value to match on the external ID field (required)
 *   --values, -v              Field=value pairs for the record body (required)
 *   --target-org, -o          Target org alias or username
 *   --api-version             Salesforce API version (default: v62.0)
 *   --json                    Output raw JSON from sf CLI
 *   --help, -h                Show this help message
 */

const { execFileSync } = require("child_process");

// ── Parse arguments ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let objectName = "";
let externalIdField = "";
let externalIdValue = "";
let values = "";
let targetOrg = "";
let apiVersion = "v62.0";
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--external-id":
    case "-e":
      externalIdField = args[++i] || "";
      break;
    case "--external-id-value":
      externalIdValue = args[++i] || "";
      break;
    case "--values":
    case "-v":
      values = args[++i] || "";
      break;
    case "--target-org":
    case "-o":
      targetOrg = args[++i] || "";
      break;
    case "--api-version":
      apiVersion = args[++i] || "v62.0";
      break;
    case "--json":
      jsonOutput = true;
      break;
    case "--help":
    case "-h":
      console.log(
        [
          "Usage: node upsert.js <ObjectName> --external-id <field> --external-id-value <value> --values \"<field=value pairs>\" [options]",
          "",
          "Upsert a single record using an external ID field.",
          "Inserts if no match found, updates if a match exists.",
          "",
          "Options:",
          "  --external-id, -e <field>      External ID field API name (required)",
          "  --external-id-value <value>    Value to match on (required)",
          "  --values, -v <pairs>           Field=value pairs for the record body (required)",
          "  --target-org, -o <alias>       Target org alias or username",
          "  --api-version <version>        Salesforce API version (default: v62.0)",
          "  --json                         Output raw JSON response",
          "  --help, -h                     Show this help message",
          "",
          "Examples:",
          "  node upsert.js Account -e External_Id__c --external-id-value EXT-001 -v \"Name='Acme Corp' Industry='Technology'\"",
          "  node upsert.js Contact -e Email --external-id-value smith@example.com -v \"LastName='Smith' Phone='555-1234'\" -o myOrg",
          "  node upsert.js Account -e External_Id__c --external-id-value EXT-001 -v \"Name='Acme'\" --json",
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
  die("Object name is required. Usage: node upsert.js <ObjectName> --external-id <field> --external-id-value <value> --values \"<pairs>\"");
}
if (!externalIdField) {
  die("--external-id is required. Provide the external ID field API name (e.g., External_Id__c).");
}
if (!externalIdValue) {
  die("--external-id-value is required. Provide the value to match on.");
}
if (!values) {
  die("--values is required. Example: --values \"Name='Acme Corp' Industry='Technology'\"");
}

// ── Parse values into JSON body ─────────────────────────────────────────────

const body = parseValues(values);

// ── Execute sf REST API ─────────────────────────────────────────────────────

const endpoint = `/services/data/${apiVersion}/sobjects/${objectName}/${externalIdField}/${encodeURIComponent(externalIdValue)}`;

const sfArgs = [
  "api", "request", "rest",
  "--method", "PATCH",
  "--url", endpoint,
  "--body", JSON.stringify(body),
];
if (targetOrg) sfArgs.push("--target-org", targetOrg);

console.log(`Upserting: ${objectName} via ${externalIdField} = '${externalIdValue}'`);
console.log(`Values: ${values}`);
console.log(`Endpoint: PATCH ${endpoint}`);
if (targetOrg) console.log(`Target Org: ${targetOrg}`);
console.log();

let result;
let rawOutput;
try {
  rawOutput = execFileSync("sf", sfArgs, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024,
  });
} catch (err) {
  handleError(err, "Failed to upsert record.");
}

// Parse the response — may be empty (204 No Content for update) or JSON (201 Created)
let action = "Updated";
let recordId = "N/A";

if (rawOutput && rawOutput.trim()) {
  try {
    result = JSON.parse(rawOutput);
    if (result.id) {
      recordId = result.id;
    }
    if (result.created === true) {
      action = "Created";
    } else if (result.created === false) {
      action = "Updated";
    }
  } catch {
    // Non-JSON response — likely a 204 update success
    action = "Updated";
  }
}

// ── Raw JSON output ─────────────────────────────────────────────────────────

if (jsonOutput) {
  console.log(JSON.stringify(result || { success: true, action }, null, 2));
  process.exit(0);
}

// ── Default output ──────────────────────────────────────────────────────────

console.log("=== Record Upserted ===");
console.log(`  Action:       ${action}`);
console.log(`  Id:           ${recordId}`);
console.log(`  Object:       ${objectName}`);
console.log(`  External ID:  ${externalIdField} = '${externalIdValue}'`);
console.log(`  Values:       ${values}`);

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
      if (Array.isArray(parsed)) {
        errMsg = parsed.map((e) => e.message || e.errorCode || "").join("; ");
      } else {
        errMsg =
          (parsed.message || "") +
          ((parsed.result || [])[0]?.message || "") +
          (parsed.name || "");
      }
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
  console.error(`Object: ${objectName}, External ID: ${externalIdField} = '${externalIdValue}'`);
  console.error(`Values: ${values}`);
  process.exit(1);
}

/**
 * Parse a field=value pairs string into a JSON object.
 *
 * Handles:
 *   - Single-quoted values:  Name='Acme Corp'
 *   - Unquoted numbers:      AnnualRevenue=5000000
 *   - Booleans:              IsActive=true
 *   - Null:                  Description=null
 *
 * @param {string} valuesStr - e.g. "Name='Acme Corp' Industry='Technology' AnnualRevenue=5000000"
 * @returns {object} - e.g. { Name: "Acme Corp", Industry: "Technology", AnnualRevenue: 5000000 }
 */
function parseValues(valuesStr) {
  const result = {};
  const regex = /(\w+)=(?:'([^']*)'|(\S+))/g;
  let match;

  while ((match = regex.exec(valuesStr)) !== null) {
    const field = match[1];
    const quotedVal = match[2];
    const unquotedVal = match[3];

    if (quotedVal !== undefined) {
      result[field] = quotedVal;
    } else if (unquotedVal === "null") {
      result[field] = null;
    } else if (unquotedVal === "true") {
      result[field] = true;
    } else if (unquotedVal === "false") {
      result[field] = false;
    } else if (!isNaN(unquotedVal) && unquotedVal !== "") {
      result[field] = Number(unquotedVal);
    } else {
      result[field] = unquotedVal;
    }
  }

  if (Object.keys(result).length === 0) {
    die(`Could not parse any field=value pairs from: "${valuesStr}". Expected format: "Field1='value1' Field2='value2'"`);
  }

  return result;
}
