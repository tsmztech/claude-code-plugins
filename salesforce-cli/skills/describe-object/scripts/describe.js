#!/usr/bin/env node
/**
 * describe.js - Describe a Salesforce object's schema metadata
 *
 * Retrieves detailed field-level metadata for any Salesforce object including
 * standard and custom fields, relationships, picklist values, and field properties.
 *
 * Usage:
 *   node describe.js <ObjectName>                              # e.g. Account
 *   node describe.js <ObjectName> --target-org <alias>         # Specific org
 *   node describe.js <ObjectName> --fields-only                # Just field list
 *   node describe.js <ObjectName> --field <FieldName>          # Single field detail
 *   node describe.js <ObjectName> --relationships              # Only relationships
 *   node describe.js <ObjectName> --raw                        # Raw JSON output
 *
 * Options:
 *   --target-org, -o   Target org alias or username
 *   --fields-only      Show only the field summary table
 *   --field, -f        Show detailed info for a specific field
 *   --relationships    Show only relationship fields
 *   --raw              Output raw JSON from sf CLI
 *   --help, -h         Show this help message
 */

const { execFileSync } = require("child_process");

// ── Parse arguments ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let objectName = "";
let targetOrg = "";
let fieldsOnly = false;
let singleField = "";
let relsOnly = false;
let rawOutput = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--target-org":
    case "-o":
      targetOrg = args[++i] || "";
      break;
    case "--fields-only":
      fieldsOnly = true;
      break;
    case "--field":
    case "-f":
      singleField = args[++i] || "";
      break;
    case "--relationships":
      relsOnly = true;
      break;
    case "--raw":
      rawOutput = true;
      break;
    case "--help":
    case "-h":
      console.log(
        [
          "Usage: node describe.js <ObjectName> [options]",
          "",
          "Options:",
          "  --target-org, -o <alias>   Target org alias or username",
          "  --fields-only              Show only the field summary table",
          "  --field, -f <name>         Show detailed info for a specific field",
          "  --relationships            Show only relationship fields",
          "  --raw                      Output raw JSON from sf CLI",
          "  --help, -h                 Show this help message",
        ].join("\n")
      );
      process.exit(0);
      break;
    default:
      if (args[i].startsWith("-")) {
        console.error(`ERROR: Unknown option: ${args[i]}`);
        process.exit(1);
      }
      if (!objectName) {
        objectName = args[i];
      } else {
        console.error(`ERROR: Unexpected argument: ${args[i]}`);
        process.exit(1);
      }
  }
}

if (!objectName) {
  console.error("ERROR: Object name is required. Usage: node describe.js <ObjectName>");
  process.exit(1);
}

// ── Execute sf CLI ──────────────────────────────────────────────────────────

const sfArgs = ["sobject", "describe", "--sobject", objectName, "--json"];
if (targetOrg) sfArgs.push("--target-org", targetOrg);

console.log(`Describing: ${objectName}`);
if (targetOrg) console.log(`Target Org: ${targetOrg}`);
console.log();

let result;
try {
  const output = execFileSync("sf", sfArgs, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  result = JSON.parse(output);
} catch (err) {
  if (err.stderr) process.stderr.write(err.stderr);
  console.error(
    `ERROR: Failed to describe object '${objectName}'. Ensure you are authenticated (run sf-auth.js) and the object API name is correct.`
  );
  process.exit(1);
}

const data = result.result || result;

// ── Raw output ──────────────────────────────────────────────────────────────

if (rawOutput) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

// ── Formatted output ────────────────────────────────────────────────────────

const fields = data.fields || [];
const name = data.name || "Unknown";

if (singleField) {
  printSingleField(fields, singleField, name);
} else if (relsOnly) {
  printRelationships(data, fields);
} else {
  if (!fieldsOnly) printObjectSummary(data, fields);
  printFieldsTable(fields);
}

// ── Formatters ──────────────────────────────────────────────────────────────

function pad(str, len) {
  str = String(str);
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function printSingleField(fields, fieldName, objectName) {
  const found = fields.filter(
    (f) => (f.name || "").toLowerCase() === fieldName.toLowerCase()
  );

  if (!found.length) {
    console.log(`Field "${fieldName}" not found on ${objectName}.`);
    console.log(`Available fields (${fields.length}):`);
    fields
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .forEach((f) => console.log(`  - ${f.name}`));
    process.exit(1);
  }

  const f = found[0];
  console.log(`=== Field: ${f.name} ===`);
  console.log(`  Label:            ${f.label || ""}`);
  console.log(`  Type:             ${f.type || ""}`);
  console.log(`  Length:           ${f.length ?? "N/A"}`);
  console.log(`  Precision:        ${f.precision ?? "N/A"}`);
  console.log(`  Scale:            ${f.scale ?? "N/A"}`);
  console.log(`  Nillable:         ${f.nillable ?? false}`);
  console.log(`  Createable:       ${f.createable ?? false}`);
  console.log(`  Updateable:       ${f.updateable ?? false}`);
  console.log(`  Unique:           ${f.unique ?? false}`);
  console.log(`  External ID:      ${f.externalId ?? false}`);
  console.log(`  Default Value:    ${f.defaultValue ?? "None"}`);
  console.log(`  Formula:          ${f.calculatedFormula ?? "None"}`);
  console.log(`  Help Text:        ${f.inlineHelpText ?? "None"}`);

  const refs = f.referenceTo || [];
  if (refs.length) {
    console.log(`  References:       ${refs.join(", ")}`);
    console.log(`  Relationship:     ${f.relationshipName || "N/A"}`);
  }

  const picklist = f.picklistValues || [];
  if (picklist.length) {
    console.log("  Picklist Values:");
    for (const p of picklist) {
      const active = p.active === false ? " (inactive)" : "";
      const def = p.defaultValue ? " (default)" : "";
      console.log(`    - ${p.label || p.value || ""}${def}${active}`);
    }
  }
}

function printObjectSummary(result, fields) {
  console.log(`=== ${result.name || "Unknown"} (${result.label || ""}) ===`);
  console.log(`  Label (Plural):   ${result.labelPlural || ""}`);
  console.log(`  Key Prefix:       ${result.keyPrefix || "N/A"}`);
  console.log(`  Custom:           ${result.custom ?? false}`);
  console.log(`  Createable:       ${result.createable ?? false}`);
  console.log(`  Updateable:       ${result.updateable ?? false}`);
  console.log(`  Deletable:        ${result.deletable ?? false}`);
  console.log(`  Queryable:        ${result.queryable ?? false}`);
  console.log(`  Searchable:       ${result.searchable ?? false}`);

  const rtInfos = result.recordTypeInfos || [];
  if (rtInfos.length) {
    console.log(`  Record Types:     ${rtInfos.length}`);
    for (const rt of rtInfos) {
      const def = rt.defaultRecordTypeMapping ? " (default)" : "";
      const inactive = rt.active === false ? " (inactive)" : "";
      console.log(`    - ${rt.name || "N/A"}${def}${inactive}`);
    }
  }

  console.log(`  Total Fields:     ${fields.length}`);
  console.log();
}

function printRelationships(result, fields) {
  const relFields = fields.filter((f) => (f.referenceTo || []).length > 0);

  console.log(`=== Relationships on ${result.name || "Unknown"} (${relFields.length} fields) ===`);
  console.log();
  console.log(`${pad("Field", 35)} ${pad("Relationship", 30)} ${pad("References", 30)} Type`);
  console.log("-".repeat(110));

  relFields
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .forEach((f) => {
      console.log(
        `${pad(f.name || "", 35)} ${pad(f.relationshipName || "N/A", 30)} ${pad((f.referenceTo || []).join(", "), 30)} ${f.type || ""}`
      );
    });

  const childRels = result.childRelationships || [];
  if (childRels.length) {
    console.log();
    console.log(`=== Child Relationships (${childRels.length}) ===`);
    console.log();
    console.log(`${pad("Child Object", 35)} ${pad("Relationship Name", 35)} Field`);
    console.log("-".repeat(105));

    childRels
      .slice()
      .sort((a, b) => (a.childSObject || "").localeCompare(b.childSObject || ""))
      .forEach((cr) => {
        console.log(
          `${pad(cr.childSObject || "N/A", 35)} ${pad(cr.relationshipName || "N/A", 35)} ${cr.field || "N/A"}`
        );
      });
  }
}

function printFieldsTable(fields) {
  console.log(`=== Fields (${fields.length}) ===`);
  console.log();
  console.log(`${pad("Name", 40)} ${pad("Label", 30)} ${pad("Type", 15)} ${pad("Length", 8)} ${pad("Nillable", 10)} Ref`);
  console.log("-".repeat(120));

  fields
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .forEach((f) => {
      let fname = f.name || "";
      let flabel = f.label || "";
      if (fname.length > 38) fname = fname.slice(0, 35) + "...";
      if (flabel.length > 28) flabel = flabel.slice(0, 25) + "...";

      const nillable = f.nillable ? "Yes" : "No";
      const refs = (f.referenceTo || []).join(", ");

      console.log(
        `${pad(fname, 40)} ${pad(flabel, 30)} ${pad(f.type || "", 15)} ${pad(String(f.length ?? ""), 8)} ${pad(nillable, 10)} ${refs}`
      );
    });
}
