#!/usr/bin/env node
/**
 * create-object.js - Create a Salesforce custom object via Metadata API
 *
 * Generates a .object-meta.xml file and deploys it to the target org.
 *
 * Usage:
 *   node create-object.js --label "Property" [options]
 *
 * Required:
 *   --label                  Object display label (e.g. "Property")
 *
 * Optional:
 *   --plural-label           Plural label (default: label + "s")
 *   --api-name               API name without __c (default: derived from label)
 *   --description            Object description
 *   --record-name            Name field label (default: "<label> Name")
 *   --name-type              Name field type: Text or AutoNumber (default: Text)
 *   --display-format         AutoNumber format (e.g. "PROP-{00000}")
 *   --starting-number        AutoNumber starting number (default: 1)
 *   --deployment-status      Deployed or InDevelopment (default: Deployed)
 *   --sharing-model          ReadWrite, Private, or Read (default: ReadWrite)
 *   --starts-with-vowel      Set if label starts with vowel sound
 *   --enable-reports         Enable reports (default: true)
 *   --no-reports             Disable reports
 *   --enable-activities      Enable activities (default: true)
 *   --no-activities          Disable activities
 *   --enable-history         Enable field history tracking (default: false)
 *   --no-history             Disable field history tracking
 *   --enable-feeds           Enable Chatter feeds (default: false)
 *   --no-feeds               Disable Chatter feeds
 *   --enable-search          Enable search (default: true)
 *   --no-search              Disable search
 *   --allow-chatter-groups   Allow in Chatter groups (default: false)
 *   --no-chatter-groups      Disallow in Chatter groups
 *   --enable-sharing         Enable sharing (default: true)
 *   --no-sharing             Disable sharing
 *   --enable-bulk-api        Enable Bulk API (default: true)
 *   --no-bulk-api            Disable Bulk API
 *   --enable-streaming-api   Enable Streaming API (default: true)
 *   --no-streaming-api       Disable Streaming API
 *   --target-org, -o         Target org alias or username
 *   --project-dir            Existing SFDX project dir (default: creates temp dir)
 *   --json                   Output raw JSON result
 *   --help, -h               Show this help message
 */

const { execFileSync, execSync, spawnSync } = require("child_process");
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

// ── Parse arguments ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const opts = {
  label: "",
  pluralLabel: "",
  apiName: "",
  description: "",
  recordName: "",
  nameType: "Text",
  displayFormat: "",
  startingNumber: 1,
  deploymentStatus: "Deployed",
  sharingModel: "ReadWrite",
  startsWithVowel: false,
  enableReports: true,
  enableActivities: true,
  enableHistory: false,
  enableFeeds: false,
  enableSearch: true,
  allowChatterGroups: false,
  enableSharing: true,
  enableBulkApi: true,
  enableStreamingApi: true,
  targetOrg: "",
  projectDir: "",
  jsonOutput: false,
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--label":
      opts.label = args[++i] || "";
      break;
    case "--plural-label":
      opts.pluralLabel = args[++i] || "";
      break;
    case "--api-name":
      opts.apiName = args[++i] || "";
      break;
    case "--description":
      opts.description = args[++i] || "";
      break;
    case "--record-name":
      opts.recordName = args[++i] || "";
      break;
    case "--name-type":
      opts.nameType = args[++i] || "Text";
      break;
    case "--display-format":
      opts.displayFormat = args[++i] || "";
      break;
    case "--starting-number":
      opts.startingNumber = parseInt(args[++i], 10) || 1;
      break;
    case "--deployment-status":
      opts.deploymentStatus = args[++i] || "Deployed";
      break;
    case "--sharing-model":
      opts.sharingModel = args[++i] || "ReadWrite";
      break;
    case "--starts-with-vowel":
      opts.startsWithVowel = true;
      break;
    case "--enable-reports":
      opts.enableReports = true;
      break;
    case "--no-reports":
      opts.enableReports = false;
      break;
    case "--enable-activities":
      opts.enableActivities = true;
      break;
    case "--no-activities":
      opts.enableActivities = false;
      break;
    case "--enable-history":
      opts.enableHistory = true;
      break;
    case "--no-history":
      opts.enableHistory = false;
      break;
    case "--enable-feeds":
      opts.enableFeeds = true;
      break;
    case "--no-feeds":
      opts.enableFeeds = false;
      break;
    case "--enable-search":
      opts.enableSearch = true;
      break;
    case "--no-search":
      opts.enableSearch = false;
      break;
    case "--allow-chatter-groups":
      opts.allowChatterGroups = true;
      break;
    case "--no-chatter-groups":
      opts.allowChatterGroups = false;
      break;
    case "--enable-sharing":
      opts.enableSharing = true;
      break;
    case "--no-sharing":
      opts.enableSharing = false;
      break;
    case "--enable-bulk-api":
      opts.enableBulkApi = true;
      break;
    case "--no-bulk-api":
      opts.enableBulkApi = false;
      break;
    case "--enable-streaming-api":
      opts.enableStreamingApi = true;
      break;
    case "--no-streaming-api":
      opts.enableStreamingApi = false;
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
      console.log(
        [
          'Usage: node create-object.js --label "My Object" [options]',
          "",
          "Create a Salesforce custom object and deploy it to the target org.",
          "",
          "Required:",
          "  --label                  Object display label",
          "",
          "Key Options:",
          "  --plural-label           Plural label (default: label + 's')",
          "  --api-name               API name without __c suffix",
          "  --description            Object description",
          '  --record-name            Name field label (default: "<label> Name")',
          "  --name-type              Text or AutoNumber (default: Text)",
          '  --display-format         AutoNumber format (e.g. "OBJ-{00000}")',
          "  --deployment-status      Deployed or InDevelopment (default: Deployed)",
          "  --sharing-model          ReadWrite, Private, or Read (default: ReadWrite)",
          "  --starts-with-vowel      Label starts with vowel sound",
          "  --enable-reports         Enable reports (default)",
          "  --enable-activities      Enable activities (default)",
          "  --enable-history         Enable field history tracking",
          "  --enable-feeds           Enable Chatter feeds",
          "  --enable-search          Enable search (default)",
          "  --allow-chatter-groups   Allow in Chatter groups",
          "  --enable-sharing         Enable sharing (default)",
          "  --enable-bulk-api        Enable Bulk API (default)",
          "  --enable-streaming-api   Enable Streaming API (default)",
          "  --target-org, -o         Target org alias or username",
          "  --project-dir            SFDX project dir (default: temp dir)",
          "  --json                   Output as JSON",
          "  --help, -h               Show this help",
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

// ── Validate ────────────────────────────────────────────────────────────────

if (!opts.label) {
  die('--label is required. Example: --label "Property"');
}

if (opts.nameType === "AutoNumber" && !opts.displayFormat) {
  die(
    '--display-format is required when --name-type is AutoNumber. Example: --display-format "PROP-{00000}"'
  );
}

if (!["Text", "AutoNumber"].includes(opts.nameType)) {
  die(`Invalid --name-type: "${opts.nameType}". Must be "Text" or "AutoNumber".`);
}

if (!["Deployed", "InDevelopment"].includes(opts.deploymentStatus)) {
  die(
    `Invalid --deployment-status: "${opts.deploymentStatus}". Must be "Deployed" or "InDevelopment".`
  );
}

if (!["ReadWrite", "Private", "Read"].includes(opts.sharingModel)) {
  die(
    `Invalid --sharing-model: "${opts.sharingModel}". Must be "ReadWrite", "Private", or "Read".`
  );
}

// ── Derive defaults ─────────────────────────────────────────────────────────

const apiName = opts.apiName
  ? opts.apiName.replace(/__c$/, "")
  : opts.label.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

const fullApiName = apiName + "__c";
const pluralLabel = opts.pluralLabel || opts.label + "s";
const recordName = opts.recordName || opts.label + " Name";

console.log("=== Creating Custom Object ===");
console.log(`  Label:             ${opts.label}`);
console.log(`  Plural Label:      ${pluralLabel}`);
console.log(`  API Name:          ${fullApiName}`);
if (opts.description) console.log(`  Description:       ${opts.description}`);
console.log(`  Record Name:       ${recordName}`);
console.log(`  Name Type:         ${opts.nameType}`);
if (opts.nameType === "AutoNumber") {
  console.log(`  Display Format:    ${opts.displayFormat}`);
  console.log(`  Starting Number:   ${opts.startingNumber}`);
}
console.log(`  Deployment Status: ${opts.deploymentStatus}`);
console.log(`  Sharing Model:     ${opts.sharingModel}`);
console.log(`  Reports:           ${opts.enableReports}`);
console.log(`  Activities:        ${opts.enableActivities}`);
console.log(`  History:           ${opts.enableHistory}`);
console.log(`  Feeds:             ${opts.enableFeeds}`);
console.log(`  Search:            ${opts.enableSearch}`);
console.log(`  Chatter Groups:    ${opts.allowChatterGroups}`);
console.log(`  Sharing:           ${opts.enableSharing}`);
console.log(`  Bulk API:          ${opts.enableBulkApi}`);
console.log(`  Streaming API:     ${opts.enableStreamingApi}`);
if (opts.targetOrg) console.log(`  Target Org:        ${opts.targetOrg}`);
console.log();

// ── Generate XML ────────────────────────────────────────────────────────────

let nameFieldXml;
if (opts.nameType === "AutoNumber") {
  nameFieldXml = `    <nameField>
        <label>${escapeXml(recordName)}</label>
        <type>AutoNumber</type>
        <displayFormat>${escapeXml(opts.displayFormat)}</displayFormat>
        <startingNumber>${opts.startingNumber}</startingNumber>
    </nameField>`;
} else {
  nameFieldXml = `    <nameField>
        <label>${escapeXml(recordName)}</label>
        <type>Text</type>
    </nameField>`;
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>${escapeXml(opts.label)}</label>
    <pluralLabel>${escapeXml(pluralLabel)}</pluralLabel>${opts.description ? `\n    <description>${escapeXml(opts.description)}</description>` : ""}
${nameFieldXml}
    <deploymentStatus>${opts.deploymentStatus}</deploymentStatus>
    <sharingModel>${opts.sharingModel}</sharingModel>${opts.startsWithVowel ? "\n    <startsWith>Vowel</startsWith>" : ""}
    <enableReports>${opts.enableReports}</enableReports>
    <enableActivities>${opts.enableActivities}</enableActivities>
    <enableHistory>${opts.enableHistory}</enableHistory>
    <enableFeeds>${opts.enableFeeds}</enableFeeds>
    <enableSearch>${opts.enableSearch}</enableSearch>
    <allowInChatterGroups>${opts.allowChatterGroups}</allowInChatterGroups>
    <enableSharing>${opts.enableSharing}</enableSharing>
    <enableBulkApi>${opts.enableBulkApi}</enableBulkApi>
    <enableStreamingApi>${opts.enableStreamingApi}</enableStreamingApi>
    <enableLicensing>false</enableLicensing>
    <searchLayouts/>
</CustomObject>
`;

// ── Write files to project dir ──────────────────────────────────────────────

let projectRoot = opts.projectDir;
let tempDir = "";

if (!projectRoot) {
  // Check if current directory is an SFDX project
  const sfdxProject = path.join(process.cwd(), "sfdx-project.json");
  if (fs.existsSync(sfdxProject)) {
    projectRoot = process.cwd();
    console.log(`Using existing SFDX project: ${projectRoot}`);
  } else {
    // Create a temporary SFDX project structure
    tempDir = path.join(os.tmpdir(), `sf-create-obj-${Date.now()}`);
    projectRoot = tempDir;
    fs.mkdirSync(tempDir, { recursive: true });

    // Minimal sfdx-project.json
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

const objectDir = path.join(
  projectRoot,
  "force-app",
  "main",
  "default",
  "objects",
  fullApiName
);
fs.mkdirSync(objectDir, { recursive: true });

const xmlPath = path.join(objectDir, `${fullApiName}.object-meta.xml`);
fs.writeFileSync(xmlPath, xml, "utf8");
console.log(`Metadata written: ${xmlPath}`);
console.log();

// ── Deploy ──────────────────────────────────────────────────────────────────

console.log("Deploying to org...");

const deployArgs = [
  "project",
  "deploy",
  "start",
  "--source-dir",
  objectDir,
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
      // ignore parse failures
    }
  }
  if (err.stderr) {
    errMsg = errMsg || err.stderr.toString().trim();
  }
  if (errMsg) console.error(`Deploy Error: ${errMsg}`);
  die(
    `Failed to deploy custom object "${fullApiName}". Check authentication and org permissions.`
  );
}

// ── Result ──────────────────────────────────────────────────────────────────

const result = deployResult.result || deployResult;

if (opts.jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log();
  console.log("=== Deployment Successful ===");
  console.log(`  Object:   ${fullApiName}`);
  console.log(`  Label:    ${opts.label}`);
  console.log(`  Status:   ${result.status || "Succeeded"}`);
  if (result.id) console.log(`  Deploy ID: ${result.id}`);
  if (result.numberComponentsDeployed != null) {
    console.log(`  Components Deployed: ${result.numberComponentsDeployed}`);
  }
  console.log();
  console.log(`Custom object "${opts.label}" (${fullApiName}) has been created successfully.`);
}

// Clean up temp dir
if (tempDir) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
