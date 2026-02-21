#!/usr/bin/env node
/**
 * create-field.js - Create a Salesforce custom field via Metadata API
 *
 * Generates a .field-meta.xml file (and optionally permission set + layout updates)
 * then deploys to the target org.
 *
 * Usage:
 *   node create-field.js --object "MyObject__c" --label "My Field" --type Text [options]
 *
 * Required:
 *   --object               Target object API name (e.g. Account, MyObject__c)
 *   --label                Field display label
 *   --type                 Field type (see --help for full list)
 *
 * Run with --help for complete option list.
 */

const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

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

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Valid field types ───────────────────────────────────────────────────────

const VALID_TYPES = [
  "AutoNumber",
  "Checkbox",
  "Currency",
  "Date",
  "DateTime",
  "Email",
  "EncryptedText",
  "Html",
  "Location",
  "LongTextArea",
  "Lookup",
  "MasterDetail",
  "MultiselectPicklist",
  "Number",
  "Percent",
  "Phone",
  "Picklist",
  "Summary",
  "Text",
  "TextArea",
  "Time",
  "Url",
];

const FORMULA_RETURN_TYPES = [
  "Checkbox",
  "Currency",
  "Date",
  "DateTime",
  "Number",
  "Percent",
  "Text",
  "Time",
];

// ── Parse arguments ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const opts = {
  object: "",
  label: "",
  apiName: "",
  type: "",
  description: "",
  helpText: "",
  required: false,
  unique: false,
  caseSensitive: false,
  externalId: false,
  defaultValue: "",
  length: 0,
  precision: 0,
  scale: -1, // -1 means not set
  visibleLines: 0,
  // Picklist
  picklistValues: "",
  sorted: false,
  restricted: true,
  firstValueDefault: false,
  // Relationship
  referenceTo: "",
  relationshipName: "",
  relationshipLabel: "",
  deleteConstraint: "SetNull",
  reparentable: false,
  writeRequiresMasterRead: false,
  // Formula
  formula: "",
  formulaReturnType: "",
  formulaBlanks: "BlankAsZero",
  // Roll-Up Summary
  summaryObject: "",
  summaryOperation: "",
  summaryField: "",
  summaryFilterField: "",
  summaryFilterOperation: "",
  summaryFilterValue: "",
  // Auto Number
  displayFormat: "",
  startingNumber: 1,
  // Geolocation
  displayLocationDecimal: true,
  // Encrypted Text
  maskChar: "asterisk",
  maskType: "all",
  // Tracking
  trackHistory: false,
  trackFeedHistory: false,
  // FLS
  fls: "none",
  flsProfiles: "",
  // Layout
  addToLayouts: false,
  // Deploy
  targetOrg: "",
  projectDir: "",
  jsonOutput: false,
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--object":
      opts.object = args[++i] || "";
      break;
    case "--label":
      opts.label = args[++i] || "";
      break;
    case "--api-name":
      opts.apiName = args[++i] || "";
      break;
    case "--type":
      opts.type = args[++i] || "";
      break;
    case "--description":
      opts.description = args[++i] || "";
      break;
    case "--help-text":
      opts.helpText = args[++i] || "";
      break;
    case "--required":
      opts.required = true;
      break;
    case "--unique":
      opts.unique = true;
      break;
    case "--case-sensitive":
      opts.caseSensitive = true;
      break;
    case "--external-id":
      opts.externalId = true;
      break;
    case "--default-value":
      opts.defaultValue = args[++i] || "";
      break;
    case "--length":
      opts.length = parseInt(args[++i], 10) || 0;
      break;
    case "--precision":
      opts.precision = parseInt(args[++i], 10) || 0;
      break;
    case "--scale":
      opts.scale = parseInt(args[++i], 10);
      if (isNaN(opts.scale)) opts.scale = -1;
      break;
    case "--visible-lines":
      opts.visibleLines = parseInt(args[++i], 10) || 0;
      break;
    case "--picklist-values":
      opts.picklistValues = args[++i] || "";
      break;
    case "--sorted":
      opts.sorted = true;
      break;
    case "--restricted":
      opts.restricted = true;
      break;
    case "--no-restricted":
      opts.restricted = false;
      break;
    case "--first-value-default":
      opts.firstValueDefault = true;
      break;
    case "--reference-to":
      opts.referenceTo = args[++i] || "";
      break;
    case "--relationship-name":
      opts.relationshipName = args[++i] || "";
      break;
    case "--relationship-label":
      opts.relationshipLabel = args[++i] || "";
      break;
    case "--delete-constraint":
      opts.deleteConstraint = args[++i] || "SetNull";
      break;
    case "--reparentable":
      opts.reparentable = true;
      break;
    case "--write-requires-master-read":
      opts.writeRequiresMasterRead = true;
      break;
    case "--formula":
      opts.formula = args[++i] || "";
      break;
    case "--formula-return-type":
      opts.formulaReturnType = args[++i] || "";
      break;
    case "--formula-blanks":
      opts.formulaBlanks = args[++i] || "BlankAsZero";
      break;
    case "--summary-object":
      opts.summaryObject = args[++i] || "";
      break;
    case "--summary-operation":
      opts.summaryOperation = args[++i] || "";
      break;
    case "--summary-field":
      opts.summaryField = args[++i] || "";
      break;
    case "--summary-filter-field":
      opts.summaryFilterField = args[++i] || "";
      break;
    case "--summary-filter-operation":
      opts.summaryFilterOperation = args[++i] || "";
      break;
    case "--summary-filter-value":
      opts.summaryFilterValue = args[++i] || "";
      break;
    case "--display-format":
      opts.displayFormat = args[++i] || "";
      break;
    case "--starting-number":
      opts.startingNumber = parseInt(args[++i], 10) || 1;
      break;
    case "--display-location-decimal":
      opts.displayLocationDecimal = true;
      break;
    case "--display-location-dms":
      opts.displayLocationDecimal = false;
      break;
    case "--mask-char":
      opts.maskChar = args[++i] || "asterisk";
      break;
    case "--mask-type":
      opts.maskType = args[++i] || "all";
      break;
    case "--track-history":
      opts.trackHistory = true;
      break;
    case "--track-feed-history":
      opts.trackFeedHistory = true;
      break;
    case "--fls":
      opts.fls = args[++i] || "none";
      break;
    case "--fls-profiles":
      opts.flsProfiles = args[++i] || "";
      break;
    case "--add-to-layouts":
      opts.addToLayouts = true;
      break;
    case "--target-org":
    case "-o":
      opts.targetOrg = args[++i] || "";
      break;
    case "--project-dir":
      opts.projectDir = args[++i] || "";
      break;
    case "--json":
      opts.jsonOutput = true;
      break;
    case "--help":
    case "-h":
      printHelp();
      process.exit(0);
      break;
    default:
      if (args[i].startsWith("-")) {
        die(`Unknown option: ${args[i]}`);
      }
      die(`Unexpected argument: ${args[i]}`);
  }
}

function printHelp() {
  console.log(
    [
      'Usage: node create-field.js --object "Account" --label "My Field" --type Text [options]',
      "",
      "Create a Salesforce custom field and deploy it to the target org.",
      "",
      "Required:",
      "  --object               Target object API name",
      "  --label                Field display label",
      "  --type                 Field type: " + VALID_TYPES.join(", "),
      "",
      "Common Options:",
      "  --api-name             API name without __c suffix",
      "  --description          Field description",
      "  --help-text            Inline help text",
      "  --required             Make field required",
      "  --unique               Require unique values",
      "  --case-sensitive       Case-sensitive uniqueness (with --unique)",
      "  --external-id          Mark as external ID",
      '  --default-value        Default value (e.g. "false", "TODAY()")',
      "",
      "Type-Specific Options:",
      "  --length <n>           Character length (Text, LongTextArea, Html, EncryptedText)",
      "  --precision <n>        Total digits (Number, Currency, Percent)",
      "  --scale <n>            Decimal places (Number, Currency, Percent, Location)",
      "  --visible-lines <n>    Visible lines (LongTextArea, Html, MultiselectPicklist)",
      "",
      "Picklist Options:",
      '  --picklist-values      Comma-separated values (e.g. "New,In Progress,Closed")',
      "  --sorted               Sort values alphabetically",
      "  --restricted           Restrict to defined values (default: true)",
      "  --no-restricted        Allow non-defined values",
      "  --first-value-default  Use first value as default",
      "",
      "Relationship Options:",
      "  --reference-to         Related object API name",
      "  --relationship-name    Relationship API name",
      "  --relationship-label   Related list label",
      "  --delete-constraint    SetNull, Restrict, or Cascade (Lookup only)",
      "  --reparentable         Allow reparenting (MasterDetail only)",
      "  --write-requires-master-read  Sharing setting (MasterDetail only)",
      "",
      "Formula Options:",
      '  --formula              Formula expression (e.g. "Quantity__c * Price__c")',
      "  --formula-return-type  " + FORMULA_RETURN_TYPES.join(", "),
      "  --formula-blanks       BlankAsZero (default) or BlankAsBlank",
      "",
      "Roll-Up Summary Options:",
      "  --summary-object       Summarized child object",
      "  --summary-operation    count, sum, min, or max",
      "  --summary-field        Field to aggregate",
      "  --summary-filter-field Filter field (optional)",
      "  --summary-filter-operation  Filter operation (optional)",
      "  --summary-filter-value Filter value (optional)",
      "",
      "Auto Number Options:",
      '  --display-format       Format string (e.g. "REC-{00000}")',
      "  --starting-number      Starting number (default: 1)",
      "",
      "Geolocation Options:",
      "  --display-location-decimal  Display as decimal (default)",
      "  --display-location-dms      Display as degrees/minutes/seconds",
      "",
      "Encrypted Text Options:",
      "  --mask-char            asterisk (default) or X",
      "  --mask-type            all, creditCard, ssn, lastFour, sin, nino",
      "",
      "Tracking Options:",
      "  --track-history        Enable field history tracking",
      "  --track-feed-history   Track in Chatter feed",
      "",
      "Field-Level Security:",
      "  --fls <level>          visible, read-only, or none (default: none)",
      '  --fls-profiles         Comma-separated profile names (for custom FLS)',
      "",
      "Page Layout:",
      "  --add-to-layouts       Add field to all page layouts",
      "",
      "Deploy Options:",
      "  --target-org, -o       Target org alias or username",
      "  --project-dir          SFDX project dir (default: temp dir)",
      "  --json                 Output as JSON",
    ].join("\n")
  );
}

// ── Validate ────────────────────────────────────────────────────────────────

if (!opts.object) die("--object is required.");
if (!opts.label) die("--label is required.");

// Handle formula: the XML type is the return type, not "Formula"
let isFormula = false;
if (opts.type.toLowerCase() === "formula" || opts.formula) {
  isFormula = true;
  if (!opts.formula) die("--formula is required for formula fields.");
  if (!opts.formulaReturnType)
    die("--formula-return-type is required for formula fields.");
  if (!FORMULA_RETURN_TYPES.includes(opts.formulaReturnType)) {
    die(
      `Invalid --formula-return-type: "${opts.formulaReturnType}". ` +
        `Must be one of: ${FORMULA_RETURN_TYPES.join(", ")}`
    );
  }
  // For formula fields, the XML type is the return type
  opts.type = opts.formulaReturnType;
} else {
  if (!opts.type) die("--type is required.");
  if (!VALID_TYPES.includes(opts.type)) {
    die(
      `Invalid --type: "${opts.type}". Must be one of: ${VALID_TYPES.join(", ")}`
    );
  }
}

// Type-specific validation
switch (opts.type) {
  case "Text":
    if (!isFormula) {
      if (!opts.length) opts.length = 255;
      if (opts.length < 1 || opts.length > 255)
        die("Text --length must be 1-255.");
    }
    break;
  case "LongTextArea":
    if (!opts.length) opts.length = 32768;
    if (opts.length < 1 || opts.length > 131072)
      die("LongTextArea --length must be 1-131072.");
    if (!opts.visibleLines) opts.visibleLines = 6;
    if (opts.visibleLines < 2 || opts.visibleLines > 50)
      die("LongTextArea --visible-lines must be 2-50.");
    break;
  case "Html":
    if (!opts.length) opts.length = 32768;
    if (opts.length < 1 || opts.length > 131072)
      die("Html --length must be 1-131072.");
    if (!opts.visibleLines) opts.visibleLines = 25;
    if (opts.visibleLines < 10 || opts.visibleLines > 50)
      die("Html --visible-lines must be 10-50.");
    break;
  case "Number":
    if (!opts.precision) opts.precision = 18;
    if (opts.scale < 0) opts.scale = 0;
    if (opts.precision < 1 || opts.precision > 18)
      die("Number --precision must be 1-18.");
    if (opts.scale > opts.precision - 1)
      die("Number --scale must be less than --precision.");
    break;
  case "Currency":
    if (!isFormula) {
      if (!opts.precision) opts.precision = 18;
      if (opts.scale < 0) opts.scale = 2;
      if (opts.precision < 1 || opts.precision > 18)
        die("Currency --precision must be 1-18.");
      if (opts.scale > opts.precision - 1)
        die("Currency --scale must be less than --precision.");
    }
    break;
  case "Percent":
    if (!isFormula) {
      if (!opts.precision) opts.precision = 18;
      if (opts.scale < 0) opts.scale = 2;
      if (opts.precision < 1 || opts.precision > 18)
        die("Percent --precision must be 1-18.");
      if (opts.scale > opts.precision - 1)
        die("Percent --scale must be less than --precision.");
    }
    break;
  case "Checkbox":
    if (!opts.defaultValue) opts.defaultValue = "false";
    break;
  case "Picklist":
    if (!opts.picklistValues)
      die("--picklist-values is required for Picklist fields.");
    break;
  case "MultiselectPicklist":
    if (!opts.picklistValues)
      die("--picklist-values is required for MultiselectPicklist fields.");
    if (!opts.visibleLines) opts.visibleLines = 4;
    if (opts.visibleLines < 3 || opts.visibleLines > 10)
      die("MultiselectPicklist --visible-lines must be 3-10.");
    break;
  case "Lookup":
    if (!opts.referenceTo) die("--reference-to is required for Lookup fields.");
    if (!["SetNull", "Restrict", "Cascade"].includes(opts.deleteConstraint)) {
      die(
        `Invalid --delete-constraint: "${opts.deleteConstraint}". ` +
          `Must be SetNull, Restrict, or Cascade.`
      );
    }
    break;
  case "MasterDetail":
    if (!opts.referenceTo)
      die("--reference-to is required for MasterDetail fields.");
    break;
  case "Summary":
    if (!opts.summaryOperation)
      die("--summary-operation is required for Summary fields.");
    if (!["count", "sum", "min", "max"].includes(opts.summaryOperation))
      die("--summary-operation must be count, sum, min, or max.");
    if (opts.summaryOperation !== "count" && !opts.summaryField)
      die("--summary-field is required for sum, min, and max operations.");
    if (!opts.summaryObject)
      die("--summary-object is required for Summary fields.");
    break;
  case "AutoNumber":
    if (!opts.displayFormat)
      die('--display-format is required for AutoNumber fields.');
    break;
  case "Location":
    if (opts.scale < 0) opts.scale = 6;
    if (opts.scale < 0 || opts.scale > 15)
      die("Location --scale must be 0-15.");
    break;
  case "EncryptedText":
    if (!opts.length) opts.length = 175;
    if (opts.length < 1 || opts.length > 175)
      die("EncryptedText --length must be 1-175.");
    if (!["asterisk", "X"].includes(opts.maskChar))
      die('--mask-char must be "asterisk" or "X".');
    if (
      !["all", "creditCard", "ssn", "lastFour", "sin", "nino"].includes(
        opts.maskType
      )
    )
      die(
        "--mask-type must be all, creditCard, ssn, lastFour, sin, or nino."
      );
    break;
}

// ── Derive defaults ─────────────────────────────────────────────────────────

const apiName = opts.apiName
  ? opts.apiName.replace(/__c$/, "")
  : opts.label
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

const fullFieldApiName = apiName + "__c";

// Derive relationship defaults
if (opts.type === "Lookup" || opts.type === "MasterDetail") {
  if (!opts.relationshipName) {
    opts.relationshipName = apiName.endsWith("s") ? apiName : apiName + "s";
  }
  if (!opts.relationshipLabel) {
    opts.relationshipLabel = opts.label.endsWith("s")
      ? opts.label
      : opts.label + "s";
  }
}

// ── Print summary ───────────────────────────────────────────────────────────

console.log("=== Creating Custom Field ===");
console.log(`  Object:          ${opts.object}`);
console.log(`  Field Label:     ${opts.label}`);
console.log(`  API Name:        ${fullFieldApiName}`);
console.log(`  Type:            ${isFormula ? "Formula (" + opts.type + ")" : opts.type}`);
if (opts.description) console.log(`  Description:     ${opts.description}`);
if (opts.helpText) console.log(`  Help Text:       ${opts.helpText}`);
if (opts.length) console.log(`  Length:          ${opts.length}`);
if (opts.precision) console.log(`  Precision:       ${opts.precision}`);
if (opts.scale >= 0) console.log(`  Scale:           ${opts.scale}`);
if (opts.visibleLines) console.log(`  Visible Lines:   ${opts.visibleLines}`);
if (opts.required) console.log(`  Required:        Yes`);
if (opts.unique) console.log(`  Unique:          Yes`);
if (opts.externalId) console.log(`  External ID:     Yes`);
if (opts.defaultValue) console.log(`  Default Value:   ${opts.defaultValue}`);
if (isFormula) console.log(`  Formula:         ${opts.formula}`);
if (opts.referenceTo) console.log(`  Related To:      ${opts.referenceTo}`);
if (opts.relationshipName)
  console.log(`  Relationship:    ${opts.relationshipName}`);
if (opts.type === "Lookup")
  console.log(`  On Delete:       ${opts.deleteConstraint}`);
if (opts.picklistValues)
  console.log(`  Values:          ${opts.picklistValues}`);
if (opts.type === "Summary")
  console.log(`  Operation:       ${opts.summaryOperation}`);
if (opts.type === "AutoNumber")
  console.log(`  Format:          ${opts.displayFormat}`);
console.log(`  FLS:             ${opts.fls}`);
console.log(`  Add to Layouts:  ${opts.addToLayouts}`);
if (opts.targetOrg) console.log(`  Target Org:      ${opts.targetOrg}`);
console.log();

// ── Generate field XML ──────────────────────────────────────────────────────

const xmlParts = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">',
  `    <fullName>${escapeXml(fullFieldApiName)}</fullName>`,
  `    <label>${escapeXml(opts.label)}</label>`,
  `    <type>${escapeXml(opts.type)}</type>`,
];

if (opts.description) {
  xmlParts.push(
    `    <description>${escapeXml(opts.description)}</description>`
  );
}
if (opts.helpText) {
  xmlParts.push(
    `    <inlineHelpText>${escapeXml(opts.helpText)}</inlineHelpText>`
  );
}

// Formula-specific elements
if (isFormula) {
  xmlParts.push(`    <formula>${escapeXml(opts.formula)}</formula>`);
  xmlParts.push(
    `    <formulaTreatBlanksAs>${opts.formulaBlanks}</formulaTreatBlanksAs>`
  );
}

// Type-specific elements
switch (opts.type) {
  case "Text":
    if (!isFormula) {
      xmlParts.push(`    <length>${opts.length}</length>`);
      if (opts.required) xmlParts.push(`    <required>true</required>`);
      else xmlParts.push(`    <required>false</required>`);
      xmlParts.push(`    <unique>${opts.unique}</unique>`);
      if (opts.unique)
        xmlParts.push(
          `    <caseSensitive>${opts.caseSensitive}</caseSensitive>`
        );
      xmlParts.push(`    <externalId>${opts.externalId}</externalId>`);
      if (opts.defaultValue)
        xmlParts.push(
          `    <defaultValue>${escapeXml(opts.defaultValue)}</defaultValue>`
        );
    }
    break;

  case "TextArea":
    if (opts.required) xmlParts.push(`    <required>true</required>`);
    else xmlParts.push(`    <required>false</required>`);
    if (opts.defaultValue)
      xmlParts.push(
        `    <defaultValue>${escapeXml(opts.defaultValue)}</defaultValue>`
      );
    break;

  case "LongTextArea":
    xmlParts.push(`    <length>${opts.length}</length>`);
    xmlParts.push(`    <visibleLines>${opts.visibleLines}</visibleLines>`);
    break;

  case "Html":
    xmlParts.push(`    <length>${opts.length}</length>`);
    xmlParts.push(`    <visibleLines>${opts.visibleLines}</visibleLines>`);
    break;

  case "Number":
    if (!isFormula) {
      xmlParts.push(`    <precision>${opts.precision}</precision>`);
      xmlParts.push(`    <scale>${opts.scale}</scale>`);
      if (opts.required) xmlParts.push(`    <required>true</required>`);
      else xmlParts.push(`    <required>false</required>`);
      xmlParts.push(`    <unique>${opts.unique}</unique>`);
      xmlParts.push(`    <externalId>${opts.externalId}</externalId>`);
      if (opts.defaultValue)
        xmlParts.push(
          `    <defaultValue>${escapeXml(opts.defaultValue)}</defaultValue>`
        );
    } else {
      if (opts.precision)
        xmlParts.push(`    <precision>${opts.precision}</precision>`);
      if (opts.scale >= 0)
        xmlParts.push(`    <scale>${opts.scale}</scale>`);
    }
    break;

  case "Currency":
    if (!isFormula) {
      xmlParts.push(`    <precision>${opts.precision}</precision>`);
      xmlParts.push(`    <scale>${opts.scale}</scale>`);
      if (opts.required) xmlParts.push(`    <required>true</required>`);
      else xmlParts.push(`    <required>false</required>`);
      if (opts.defaultValue)
        xmlParts.push(
          `    <defaultValue>${escapeXml(opts.defaultValue)}</defaultValue>`
        );
    } else {
      if (opts.precision)
        xmlParts.push(`    <precision>${opts.precision}</precision>`);
      if (opts.scale >= 0)
        xmlParts.push(`    <scale>${opts.scale}</scale>`);
    }
    break;

  case "Percent":
    if (!isFormula) {
      xmlParts.push(`    <precision>${opts.precision}</precision>`);
      xmlParts.push(`    <scale>${opts.scale}</scale>`);
      if (opts.required) xmlParts.push(`    <required>true</required>`);
      else xmlParts.push(`    <required>false</required>`);
      if (opts.defaultValue)
        xmlParts.push(
          `    <defaultValue>${escapeXml(opts.defaultValue)}</defaultValue>`
        );
    } else {
      if (opts.precision)
        xmlParts.push(`    <precision>${opts.precision}</precision>`);
      if (opts.scale >= 0)
        xmlParts.push(`    <scale>${opts.scale}</scale>`);
    }
    break;

  case "Checkbox":
    xmlParts.push(
      `    <defaultValue>${escapeXml(opts.defaultValue)}</defaultValue>`
    );
    break;

  case "Date":
  case "DateTime":
  case "Time":
    if (!isFormula) {
      if (opts.required) xmlParts.push(`    <required>true</required>`);
      else xmlParts.push(`    <required>false</required>`);
      if (opts.defaultValue)
        xmlParts.push(
          `    <defaultValue>${escapeXml(opts.defaultValue)}</defaultValue>`
        );
    }
    break;

  case "Email":
    if (opts.required) xmlParts.push(`    <required>true</required>`);
    else xmlParts.push(`    <required>false</required>`);
    xmlParts.push(`    <unique>${opts.unique}</unique>`);
    xmlParts.push(`    <externalId>${opts.externalId}</externalId>`);
    if (opts.defaultValue)
      xmlParts.push(
        `    <defaultValue>${escapeXml(opts.defaultValue)}</defaultValue>`
      );
    break;

  case "Phone":
  case "Url":
    if (opts.required) xmlParts.push(`    <required>true</required>`);
    else xmlParts.push(`    <required>false</required>`);
    if (opts.defaultValue)
      xmlParts.push(
        `    <defaultValue>${escapeXml(opts.defaultValue)}</defaultValue>`
      );
    break;

  case "Picklist":
    if (opts.required) xmlParts.push(`    <required>true</required>`);
    else xmlParts.push(`    <required>false</required>`);
    xmlParts.push(buildPicklistValueSet(opts));
    break;

  case "MultiselectPicklist":
    if (opts.required) xmlParts.push(`    <required>true</required>`);
    else xmlParts.push(`    <required>false</required>`);
    xmlParts.push(`    <visibleLines>${opts.visibleLines}</visibleLines>`);
    xmlParts.push(buildPicklistValueSet(opts));
    break;

  case "Lookup":
    xmlParts.push(
      `    <referenceTo>${escapeXml(opts.referenceTo)}</referenceTo>`
    );
    xmlParts.push(
      `    <relationshipLabel>${escapeXml(opts.relationshipLabel)}</relationshipLabel>`
    );
    xmlParts.push(
      `    <relationshipName>${escapeXml(opts.relationshipName)}</relationshipName>`
    );
    xmlParts.push(
      `    <deleteConstraint>${opts.deleteConstraint}</deleteConstraint>`
    );
    if (opts.required) xmlParts.push(`    <required>true</required>`);
    else xmlParts.push(`    <required>false</required>`);
    xmlParts.push(`    <externalId>false</externalId>`);
    break;

  case "MasterDetail":
    xmlParts.push(
      `    <referenceTo>${escapeXml(opts.referenceTo)}</referenceTo>`
    );
    xmlParts.push(
      `    <relationshipLabel>${escapeXml(opts.relationshipLabel)}</relationshipLabel>`
    );
    xmlParts.push(
      `    <relationshipName>${escapeXml(opts.relationshipName)}</relationshipName>`
    );
    xmlParts.push(`    <relationshipOrder>0</relationshipOrder>`);
    xmlParts.push(
      `    <reparentableMasterDetail>${opts.reparentable}</reparentableMasterDetail>`
    );
    xmlParts.push(
      `    <writeRequiresMasterRead>${opts.writeRequiresMasterRead}</writeRequiresMasterRead>`
    );
    xmlParts.push(`    <externalId>false</externalId>`);
    break;

  case "Summary":
    xmlParts.push(
      `    <summaryOperation>${opts.summaryOperation}</summaryOperation>`
    );
    if (opts.summaryField) {
      xmlParts.push(
        `    <summarizedField>${escapeXml(opts.summaryField)}</summarizedField>`
      );
    }
    xmlParts.push(
      `    <summaryForeignKey>${escapeXml(opts.summaryObject)}</summaryForeignKey>`
    );
    if (opts.summaryFilterField) {
      xmlParts.push(`    <summaryFilterItems>`);
      xmlParts.push(
        `        <field>${escapeXml(opts.summaryFilterField)}</field>`
      );
      xmlParts.push(
        `        <operation>${escapeXml(opts.summaryFilterOperation)}</operation>`
      );
      xmlParts.push(
        `        <value>${escapeXml(opts.summaryFilterValue)}</value>`
      );
      xmlParts.push(`    </summaryFilterItems>`);
    }
    xmlParts.push(`    <externalId>false</externalId>`);
    break;

  case "AutoNumber":
    xmlParts.push(
      `    <displayFormat>${escapeXml(opts.displayFormat)}</displayFormat>`
    );
    xmlParts.push(
      `    <startingNumber>${opts.startingNumber}</startingNumber>`
    );
    xmlParts.push(`    <externalId>${opts.externalId}</externalId>`);
    break;

  case "Location":
    xmlParts.push(`    <scale>${opts.scale}</scale>`);
    xmlParts.push(
      `    <displayLocationInDecimal>${opts.displayLocationDecimal}</displayLocationInDecimal>`
    );
    if (opts.required) xmlParts.push(`    <required>true</required>`);
    else xmlParts.push(`    <required>false</required>`);
    break;

  case "EncryptedText":
    xmlParts.push(`    <length>${opts.length}</length>`);
    xmlParts.push(`    <maskChar>${opts.maskChar}</maskChar>`);
    xmlParts.push(`    <maskType>${opts.maskType}</maskType>`);
    if (opts.required) xmlParts.push(`    <required>true</required>`);
    else xmlParts.push(`    <required>false</required>`);
    break;
}

// Tracking
if (opts.trackHistory)
  xmlParts.push(`    <trackHistory>true</trackHistory>`);
if (opts.trackFeedHistory)
  xmlParts.push(`    <trackFeedHistory>true</trackFeedHistory>`);

xmlParts.push("</CustomField>");
xmlParts.push("");

const fieldXml = xmlParts.join("\n");

// ── Set up project directory ────────────────────────────────────────────────

let projectRoot = opts.projectDir;
let tempDir = "";

if (!projectRoot) {
  const sfdxProject = path.join(process.cwd(), "sfdx-project.json");
  if (fs.existsSync(sfdxProject)) {
    projectRoot = process.cwd();
    console.log(`Using existing SFDX project: ${projectRoot}`);
  } else {
    tempDir = path.join(os.tmpdir(), `sf-create-field-${Date.now()}`);
    projectRoot = tempDir;
    fs.mkdirSync(tempDir, { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, "sfdx-project.json"),
      JSON.stringify(
        {
          packageDirectories: [{ path: "force-app", default: true }],
          namespace: "",
          sfdcLoginUrl: "https://login.salesforce.com",
          sourceApiVersion: "62.0",
        },
        null,
        2
      )
    );
    console.log(`Created temporary project: ${tempDir}`);
  }
}

// Write field metadata
const fieldsDir = path.join(
  projectRoot,
  "force-app",
  "main",
  "default",
  "objects",
  opts.object,
  "fields"
);
fs.mkdirSync(fieldsDir, { recursive: true });

const fieldXmlPath = path.join(
  fieldsDir,
  `${fullFieldApiName}.field-meta.xml`
);
fs.writeFileSync(fieldXmlPath, fieldXml, "utf8");
console.log(`Field metadata written: ${fieldXmlPath}`);

// ── Generate permission set for FLS ─────────────────────────────────────────

let permSetPath = "";
if (opts.fls !== "none") {
  const readable = true;
  const editable = opts.fls === "visible";

  const permSetName = `${opts.object.replace(/__c$/, "")}_${apiName}_Access`;
  const permSetXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">',
    `    <label>${escapeXml(permSetName.replace(/_/g, " "))}</label>`,
    `    <fieldPermissions>`,
    `        <editable>${editable}</editable>`,
    `        <field>${escapeXml(opts.object)}.${escapeXml(fullFieldApiName)}</field>`,
    `        <readable>${readable}</readable>`,
    `    </fieldPermissions>`,
    "</PermissionSet>",
    "",
  ].join("\n");

  const permSetDir = path.join(
    projectRoot,
    "force-app",
    "main",
    "default",
    "permissionsets"
  );
  fs.mkdirSync(permSetDir, { recursive: true });
  permSetPath = path.join(
    permSetDir,
    `${permSetName}.permissionset-meta.xml`
  );
  fs.writeFileSync(permSetPath, permSetXml, "utf8");
  console.log(`Permission set written: ${permSetPath}`);
}

console.log();

// ── Deploy field (and permission set) ───────────────────────────────────────

console.log("Deploying to org...");

const sourceDir = path.join(projectRoot, "force-app");
const deployArgs = [
  "project",
  "deploy",
  "start",
  "--source-dir",
  sourceDir,
  "--wait",
  "10",
  "--json",
];
if (opts.targetOrg) deployArgs.push("--target-org", opts.targetOrg);

let deployResult;
try {
  const output = runSf(deployArgs, { cwd: projectRoot });
  deployResult = JSON.parse(output);
} catch (err) {
  let errMsg = "";
  if (err.stdout) {
    try {
      const parsed = JSON.parse(err.stdout);
      errMsg = parsed.message || "";
      if (parsed.result && parsed.result.details) {
        const failures = parsed.result.details.componentFailures || [];
        if (failures.length) {
          errMsg += "\n\nComponent Failures:";
          for (const f of failures) {
            errMsg += `\n  - ${f.fullName || f.fileName}: ${f.problem || "Unknown error"}`;
          }
        }
      }
    } catch {
      // ignore
    }
  }
  if (err.stderr) {
    errMsg = errMsg || err.stderr.toString().trim();
  }
  if (errMsg) console.error(`Deploy Error: ${errMsg}`);
  cleanup(tempDir);
  die(
    `Failed to deploy field "${fullFieldApiName}" on ${opts.object}. ` +
      "Check authentication, org permissions, and field settings."
  );
}

const result = deployResult.result || deployResult;

// ── Add to page layouts (post-deploy) ───────────────────────────────────────

let layoutResult = null;
if (opts.addToLayouts) {
  console.log();
  console.log("Adding field to page layouts...");
  layoutResult = addFieldToLayouts(
    opts.object,
    fullFieldApiName,
    opts.targetOrg,
    projectRoot
  );
}

// ── Report result ───────────────────────────────────────────────────────────

if (opts.jsonOutput) {
  console.log(
    JSON.stringify(
      {
        field: fullFieldApiName,
        object: opts.object,
        type: isFormula ? "Formula" : opts.type,
        deployResult: result,
        permissionSet: permSetPath ? true : false,
        layoutsUpdated: layoutResult,
      },
      null,
      2
    )
  );
} else {
  console.log();
  console.log("=== Deployment Successful ===");
  console.log(`  Object:    ${opts.object}`);
  console.log(`  Field:     ${fullFieldApiName}`);
  console.log(`  Label:     ${opts.label}`);
  console.log(`  Type:      ${isFormula ? "Formula (" + opts.type + ")" : opts.type}`);
  console.log(`  Status:    ${result.status || "Succeeded"}`);
  if (result.id) console.log(`  Deploy ID: ${result.id}`);
  if (result.numberComponentsDeployed != null) {
    console.log(`  Components Deployed: ${result.numberComponentsDeployed}`);
  }
  if (permSetPath) {
    console.log(`  Permission Set: Created (${opts.fls})`);
  }
  if (layoutResult) {
    if (layoutResult.success) {
      console.log(
        `  Layouts Updated: ${layoutResult.layoutCount} layout(s)`
      );
    } else {
      console.log(`  Layouts: ${layoutResult.message}`);
    }
  }
  console.log();
  console.log(
    `Custom field "${opts.label}" (${fullFieldApiName}) created on ${opts.object}.`
  );
}

cleanup(tempDir);

// ── Helper: Build picklist valueSet XML ─────────────────────────────────────

function buildPicklistValueSet(o) {
  const values = o.picklistValues
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const lines = [];
  lines.push("    <valueSet>");
  lines.push(`        <restricted>${o.restricted}</restricted>`);
  lines.push("        <valueSetDefinition>");
  lines.push(`            <sorted>${o.sorted}</sorted>`);
  for (let idx = 0; idx < values.length; idx++) {
    const val = values[idx];
    const valApiName = val
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    const isDefault = o.firstValueDefault && idx === 0;
    lines.push("            <value>");
    lines.push(
      `                <fullName>${escapeXml(valApiName)}</fullName>`
    );
    lines.push(`                <default>${isDefault}</default>`);
    lines.push(`                <label>${escapeXml(val)}</label>`);
    lines.push("            </value>");
  }
  lines.push("        </valueSetDefinition>");
  lines.push("    </valueSet>");
  return lines.join("\n");
}

// ── Helper: Add field to page layouts ───────────────────────────────────────

function addFieldToLayouts(objectName, fieldApiName, targetOrg, projRoot) {
  // Step 1: Retrieve current layouts
  const retrieveArgs = [
    "project",
    "retrieve",
    "start",
    "--metadata",
    `Layout:${objectName}-*`,
    "--target-dir",
    projRoot,
    "--json",
  ];
  if (targetOrg) retrieveArgs.push("--target-org", targetOrg);

  try {
    runSf(retrieveArgs, { cwd: projRoot });
  } catch (err) {
    // Retrieve might fail if no layouts exist or wildcard isn't supported
    // Try listing layouts first
    try {
      const listArgs = [
        "org",
        "list",
        "metadata",
        "--metadata-type",
        "Layout",
        "--json",
      ];
      if (targetOrg) listArgs.push("--target-org", targetOrg);
      const listOutput = runSf(listArgs, { cwd: projRoot });
      const listParsed = JSON.parse(listOutput);
      const allLayouts = listParsed.result || [];
      const objectLayouts = allLayouts.filter(
        (l) =>
          l.fullName && l.fullName.startsWith(objectName + "-")
      );

      if (objectLayouts.length === 0) {
        return {
          success: false,
          message: "No layouts found for this object",
          layoutCount: 0,
        };
      }

      // Retrieve each layout individually
      for (const layout of objectLayouts) {
        const singleRetrieveArgs = [
          "project",
          "retrieve",
          "start",
          "--metadata",
          `Layout:${layout.fullName}`,
          "--target-dir",
          projRoot,
          "--json",
        ];
        if (targetOrg)
          singleRetrieveArgs.push("--target-org", targetOrg);
        try {
          runSf(singleRetrieveArgs, { cwd: projRoot });
        } catch {
          // Skip layouts that fail to retrieve
        }
      }
    } catch {
      return {
        success: false,
        message: "Could not retrieve layouts",
        layoutCount: 0,
      };
    }
  }

  // Step 2: Find and modify layout files
  const layoutsDir = path.join(
    projRoot,
    "force-app",
    "main",
    "default",
    "layouts"
  );

  if (!fs.existsSync(layoutsDir)) {
    return {
      success: false,
      message: "No layouts directory found after retrieval",
      layoutCount: 0,
    };
  }

  const layoutFiles = fs
    .readdirSync(layoutsDir)
    .filter(
      (f) =>
        f.startsWith(objectName + "-") && f.endsWith(".layout-meta.xml")
    );

  if (layoutFiles.length === 0) {
    return {
      success: false,
      message: "No layout files found for this object",
      layoutCount: 0,
    };
  }

  let modifiedCount = 0;
  for (const layoutFile of layoutFiles) {
    const layoutPath = path.join(layoutsDir, layoutFile);
    let layoutContent = fs.readFileSync(layoutPath, "utf8");

    // Check if field is already in the layout
    if (layoutContent.includes(`<field>${fieldApiName}</field>`)) {
      continue;
    }

    // Find the first layoutColumns section and add the field
    const insertPoint = layoutContent.indexOf("</layoutColumns>");
    if (insertPoint === -1) continue;

    const newItem = [
      "            <layoutItems>",
      "                <behavior>Edit</behavior>",
      `                <field>${escapeXml(fieldApiName)}</field>`,
      "            </layoutItems>",
    ].join("\n");

    layoutContent =
      layoutContent.slice(0, insertPoint) +
      newItem +
      "\n        " +
      layoutContent.slice(insertPoint);

    fs.writeFileSync(layoutPath, layoutContent, "utf8");
    modifiedCount++;
  }

  if (modifiedCount === 0) {
    return {
      success: true,
      message: "Field already present in all layouts",
      layoutCount: 0,
    };
  }

  // Step 3: Deploy modified layouts
  const layoutDeployArgs = [
    "project",
    "deploy",
    "start",
    "--source-dir",
    layoutsDir,
    "--wait",
    "10",
    "--json",
  ];
  if (targetOrg) layoutDeployArgs.push("--target-org", targetOrg);

  try {
    runSf(layoutDeployArgs, { cwd: projRoot });
    return { success: true, message: "Layouts updated", layoutCount: modifiedCount };
  } catch (err) {
    let errMsg = "Layout deployment failed";
    if (err.stdout) {
      try {
        const parsed = JSON.parse(err.stdout);
        errMsg = parsed.message || errMsg;
      } catch {
        // ignore
      }
    }
    return { success: false, message: errMsg, layoutCount: 0 };
  }
}

// ── Helper: Cleanup temp directory ──────────────────────────────────────────

function cleanup(dir) {
  if (dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
