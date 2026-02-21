---
name: create-object
description: >
  Salesforce custom object creation specialist. ALWAYS invoke this skill when the user wants
  to create a new custom object, define an sObject, or add a new entity to their Salesforce org.
  Do not attempt to create custom objects or generate object metadata directly — use this skill
  first. Triggers: 'create object', 'new custom object', 'add object', 'define object',
  'create sObject', 'create entity'. Do NOT use for creating fields (use create-field skill),
  querying data, or describing existing objects.
argument-hint: '[object label or description]'
allowed-tools: Bash, Read, AskUserQuestion
---

# Create Salesforce Custom Object

Guide the user through creating a new custom object in their Salesforce org. This is a
conversational skill — gather all required information through questions before executing.

## Workflow

```
User triggers skill
├── 1. Understand purpose & name — ask what the object is for, get label & API name
├── 2. Check for duplicates — run search-objects.js BEFORE gathering detailed settings
│   ├── Exact match found → STOP, tell user the object exists
│   ├── Similar objects found → show them, ask user to confirm proceed or pick a different name
│   └── No matches → proceed to gather settings
├── 3. Gather object settings — ask remaining questions (see below)
├── 4. Confirm all settings — show summary, ask for confirmation
├── 5. Create the object — run create-object.js
├── 6. Report result — show success/failure
└── 7. Offer next step — ask if they want to create fields now
```

## Phase 1: Understand Purpose & Name

Start by asking the user what the object is for. This context helps you:
- Suggest a good label and API name
- Recommend appropriate settings (e.g., enable reports for trackable entities)
- Suggest relevant fields later

If the user already provided a label or description in their message (via `$ARGUMENTS`),
acknowledge it.

Get at minimum these before proceeding to the duplicate check:

| Setting | What to ask | Default |
|---------|------------|---------|
| **Label** | "What should the object be called?" | From user input |
| **Plural Label** | "What's the plural form?" | Label + "s" |
| **API Name** | Suggest one derived from label, ask to confirm | Derived from label |

## Phase 2: Check for Duplicates

Once you have the API name, **immediately** check for duplicates before gathering any
more settings. This avoids wasting the user's time if the object already exists.

**Step 1 — Search for similar objects (both standard and custom):**

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/search-objects.js "<ObjectName>" [--target-org <alias>]
```

Do NOT pass `--custom-only` — the search must include standard objects because creating
a custom object with a name that collides with a standard object (e.g., "Case", "Account",
"Order") causes confusion and naming conflicts. The fuzzy match will surface both
`Account` (standard) and `Account_Tracker__c` (custom) so the user sees the full picture.

**Step 2 — If the search returns a match with the same or very similar name, describe it:**

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/describe-object.js <ObjectApiName> --fields-only [--target-org <alias>]
```

**If exact match found** (standard or custom): Tell the user the object already exists.
Show its details. If it's a standard object, explain that Salesforce already provides it
and suggest adding custom fields to it instead. Do NOT proceed with creation.

**If similar objects found**: Show the full list (indicating which are standard vs custom)
and ask the user whether:
- This is intentionally a different object → proceed to Phase 3
- They want to pick a different name → go back and ask for a new label/API name
- They want to use the existing object instead → end the workflow, optionally invoke create-field

**If no matches**: Proceed to Phase 3.

## Phase 3: Gather Object Settings

Now gather the remaining settings. Ask for the description and group related settings
together to avoid too many back-and-forth exchanges. Use smart defaults based on the
object's purpose.

### Additional Required Information

| Setting | What to ask | Default |
|---------|------------|---------|
| **Description** | "Brief description of what this object represents?" | None |

### Record Name Settings

| Setting | What to ask | Default |
|---------|------------|---------|
| **Record Name Label** | "What should the name field be called?" | "{Label} Name" |
| **Name Type** | "Should the name field be free-text or auto-numbered?" | Text |
| **Display Format** | Only if AutoNumber: "What format? e.g. PROP-{00000}" | — |
| **Starting Number** | Only if AutoNumber: "Starting number?" | 1 |

### Optional Features

Present these as a group with recommended defaults. Ask the user which they want to change:

| Setting | Default | Recommend when... |
|---------|---------|-------------------|
| **Allow Reports** | Yes | Almost always |
| **Allow Activities** | Yes | Object tracks tasks/events |
| **Track Field History** | No | Object needs audit trail |
| **Allow in Chatter Groups** | No | Collaborative objects |
| **Allow Search** | Yes | Almost always |
| **Deployment Status** | Deployed | InDevelopment for sandbox work |

### Enterprise Features

Present these as a group. Defaults are fine for most orgs:

| Setting | Default |
|---------|---------|
| **Allow Sharing** | Yes |
| **Allow Bulk API Access** | Yes |
| **Allow Streaming API Access** | Yes |

### Tips for Gathering Information

- If the label starts with a vowel sound (e.g., "Application", "Employee"), set `--starts-with-vowel`
- Suggest an API name by replacing spaces with underscores (e.g., "Rental Property" → "Rental_Property")
- For objects that represent trackable business processes, recommend enabling History
- For collaborative objects, recommend enabling Chatter Groups and Feeds
- Keep the conversation efficient — don't ask about every setting individually. Present
  sensible defaults and ask what the user wants to change.

## Phase 4: Confirm Before Creating

Show a complete summary of all settings and ask for explicit confirmation before executing.
Format it clearly:

```
Object:           Property
Plural:           Properties
API Name:         Property__c
Description:      Tracks rental properties in the portfolio
Record Name:      Property Name (Text)
Reports:          Yes
Activities:       Yes
History:          No
Search:           Yes
Deployment:       Deployed
...
```

Wait for the user to confirm before proceeding.

## Phase 5: Create the Object

Run the creation script with all gathered parameters:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/create-object/scripts/create-object.js \
  --label "<label>" \
  --plural-label "<plural>" \
  --api-name "<apiName>" \
  --description "<description>" \
  --record-name "<recordName>" \
  --name-type <Text|AutoNumber> \
  [--display-format "<format>"] \
  [--starting-number <n>] \
  --deployment-status <Deployed|InDevelopment> \
  --sharing-model <ReadWrite|Private|Read> \
  [--starts-with-vowel] \
  [--enable-reports | --no-reports] \
  [--enable-activities | --no-activities] \
  [--enable-history | --no-history] \
  [--enable-feeds | --no-feeds] \
  [--enable-search | --no-search] \
  [--allow-chatter-groups | --no-chatter-groups] \
  [--enable-sharing | --no-sharing] \
  [--enable-bulk-api | --no-bulk-api] \
  [--enable-streaming-api | --no-streaming-api] \
  [--target-org <alias>]
```

## Phase 6: Report Result

- On success: show the object label, API name, and confirm it was deployed.
- On failure: show the error and suggest fixes (auth issues, permissions, naming conflicts).

## Phase 7: Offer Next Step

After successful creation, ask the user:

> "The object has been created. Would you like to add custom fields to it now?"

If they say yes, invoke the `salesforce-dev:create-field` skill.

## Authentication

If the user is not authenticated or gets an auth error, run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sf-auth.js --status
```

To authenticate:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sf-auth.js --alias <alias>
```

See `scripts/sf-auth.js --help` for all options.
