---
name: create-field
description: >
  Salesforce custom field creation specialist. ALWAYS invoke this skill when the user wants
  to add a custom field, create a field, or define a new field on a Salesforce object.
  Do not attempt to create custom fields or generate field metadata directly — use this skill
  first. Triggers: 'create field', 'add field', 'new field', 'add column', 'create custom field',
  'add a text field', 'add picklist', 'add lookup', 'add relationship field'.
  Do NOT use for creating objects (use create-object skill), querying data, or describing
  existing fields.
argument-hint: '[object name and/or field description]'
allowed-tools: Bash, Read, AskUserQuestion
---

# Create Salesforce Custom Field

Guide the user through creating a custom field on a Salesforce object. This is a
conversational skill — gather all required information through questions before deploying.

## Workflow

```
User triggers skill
├── 1. Identify target object — which object gets the new field?
├── 2. Choose field type — present the type list, get user's choice
├── 3. Check for duplicates — run describe-object.js BEFORE gathering details
│   ├── Exact match found → STOP, tell user the field exists
│   ├── Similar fields found → show them, ask user to confirm or pick a different name
│   └── No matches → proceed
├── 4. Gather field details — type-specific settings (see tables below)
├── 5. Field-level security — ask which profiles/permission sets should have access
├── 6. Page layout — ask if the field should be added to page layouts
├── 7. Confirm all settings — show summary, ask for confirmation
├── 8. Create the field — run create-field.js
├── 9. Report result — show success/failure
└── 10. Offer next step — ask if they want to create another field
```

## Phase 1: Identify Target Object

Ask which object the field should be created on. If the user already specified it
(via `$ARGUMENTS` or earlier context), confirm it.

Describe the object to verify it exists and see its existing fields:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/describe-object.js <ObjectApiName> --fields-only [--target-org <alias>]
```

This gives you the full field list, which helps avoid duplicates and informs naming.

## Phase 2: Choose Field Type

Present the available field types. Group them logically:

**Basic Data Types:**
| Type | Description |
|------|-------------|
| Text | Single-line text (up to 255 chars) |
| Text Area | Multi-line plain text (255 chars) |
| Text Area (Long) | Large plain text (up to 131,072 chars) |
| Text Area (Rich) | Rich text with formatting (up to 131,072 chars) |
| Number | Numeric value with decimals |
| Currency | Money value with currency symbol |
| Percent | Percentage value |
| Checkbox | True/false toggle |
| Date | Date only |
| Date/Time | Date and time |
| Time | Time only |
| Email | Email address (validated format) |
| Phone | Phone number |
| URL | Web address (displayed as link) |

**Selection Types:**
| Type | Description |
|------|-------------|
| Picklist | Single-select dropdown |
| Picklist (Multi-Select) | Multi-select list |

**Relationship Types:**
| Type | Description |
|------|-------------|
| Lookup | Optional relationship to another object |
| Master-Detail | Required parent-child relationship |

**Computed Types:**
| Type | Description |
|------|-------------|
| Formula | Calculated from other fields |
| Roll-Up Summary | Aggregates child record values (master-detail only) |
| Auto Number | Auto-incrementing identifier |

**Special Types:**
| Type | Description |
|------|-------------|
| Geolocation | Latitude/longitude coordinates |
| Text (Encrypted) | Encrypted text with masking |

Ask the user which type they need. If they describe what they want rather than naming a
type, suggest the appropriate type.

## Phase 3: Check for Duplicates

Once you have the object name and proposed field label/API name, check the field list
you already retrieved in Phase 1. If you haven't described the object yet, do it now:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/describe-object.js <ObjectApiName> --fields-only [--target-org <alias>]
```

To check a specific field in detail:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/describe-object.js <ObjectApiName> --field <FieldApiName> [--target-org <alias>]
```

Review the field list for exact and similar matches (same prefix, similar names).

**If exact match found**: Tell the user the field already exists. Show its details. STOP.

**If similar fields found**: Show the list and ask the user whether:
- This is intentionally different → proceed to Phase 4
- They want to pick a different name → go back
- They want to stop → end the workflow

**If no matches**: Proceed to Phase 4.

## Phase 4: Gather Field Details

Ask type-specific settings. Present sensible defaults and ask what the user wants to change.

### Common Settings (all types)

| Setting | What to ask | Default |
|---------|------------|---------|
| **Label** | "What should the field be called?" | From user input |
| **API Name** | Suggest derived from label | Derived from label |
| **Description** | "Brief description?" | None |
| **Help Text** | "Hover help text?" | None |

### Type-Specific Settings

**Text:**

| Setting | Default | Constraints |
|---------|---------|-------------|
| Length | 255 | 1-255 |
| Required | No | |
| Unique | No | |
| External ID | No | Only if Unique or standalone |
| Case Sensitive | No | Only if Unique |
| Default Value | None | |

**Text Area (Long):**

| Setting | Default | Constraints |
|---------|---------|-------------|
| Length | 32768 | Up to 131,072 |
| Visible Lines | 6 | 2-50 |

**Text Area (Rich):**

| Setting | Default | Constraints |
|---------|---------|-------------|
| Length | 32768 | Up to 131,072 |
| Visible Lines | 25 | 10-50 |

**Number / Currency / Percent:**

| Setting | Default | Constraints |
|---------|---------|-------------|
| Precision (total digits) | 18 | 1-18 |
| Scale (decimal places) | 0 (Number), 2 (Currency/Percent) | 0-17, must be less than precision |
| Required | No | |
| Unique | No | Number only |
| External ID | No | Number only |
| Default Value | None | |

**Checkbox:**

| Setting | Default |
|---------|---------|
| Default Value | false (unchecked) |

**Date / Date/Time / Time:**

| Setting | Default |
|---------|---------|
| Required | No |
| Default Value | None |

**Email / Phone / URL:**

| Setting | Default |
|---------|---------|
| Required | No |
| Unique | No (Email only) |
| External ID | No (Email only) |
| Default Value | None |

**Picklist:**

| Setting | Default |
|---------|---------|
| Values | Ask user to list them |
| Sorted alphabetically | No |
| Restrict to defined values | Yes |
| Use first value as default | No |
| Required | No |

**Picklist (Multi-Select):**

| Setting | Default |
|---------|---------|
| Values | Ask user to list them |
| Visible Lines | 4 (range: 3-10) |
| Sorted alphabetically | No |
| Restrict to defined values | Yes |
| Required | No |

**Lookup Relationship:**

| Setting | What to ask |
|---------|-------------|
| Related To | Which object to reference |
| Child Relationship Name | API name for the relationship |
| Related List Label | Label shown on parent record |
| Delete Constraint | SetNull (default), Restrict, or Cascade |
| Required | No (default) |

**Master-Detail Relationship:**

| Setting | What to ask |
|---------|-------------|
| Related To | Which object is the parent |
| Child Relationship Name | API name for the relationship |
| Related List Label | Label shown on parent record |
| Allow Reparenting | No (default) |
| Sharing Setting | Read/Write access requires read on master? (default: false) |

**Formula:**

| Setting | What to ask |
|---------|-------------|
| Return Type | Text, Number, Currency, Date, Date/Time, Percent, Checkbox, Time |
| Formula Expression | The formula itself |
| Blank Field Handling | Treat blanks as zeros (default) or blanks |
| Precision/Scale | Only for Number/Currency/Percent returns |

**Roll-Up Summary:**

| Setting | What to ask |
|---------|-------------|
| Summarized Object | Which child object |
| Roll-Up Type | COUNT, SUM, MIN, or MAX |
| Field to Aggregate | Which field on the child (not needed for COUNT) |
| Filter Criteria | Optional filter conditions |

**Auto Number:**

| Setting | Default |
|---------|---------|
| Display Format | Ask user (e.g., "REC-{00000}") |
| Starting Number | 1 |
| External ID | No |

**Geolocation:**

| Setting | Default |
|---------|---------|
| Decimal Places | 6 (range: 0-15) |
| Display as Decimal | Yes |
| Required | No |

**Text (Encrypted):**

| Setting | Default | Constraints |
|---------|---------|-------------|
| Length | 175 | 1-175 |
| Mask Character | asterisk | asterisk or X |
| Mask Type | all | all, creditCard, ssn, lastFour, sin, nino |
| Required | No | |

### Tips for Gathering Information

- Group related settings together to minimize back-and-forth
- For picklist values, ask the user to list them all at once (one per line or comma-separated)
- For formulas, help the user write the expression if needed
- For relationship fields, verify the target object exists using describe-object
- Suggest API names by converting label to PascalCase with underscores

## Phase 5: Field-Level Security

Ask the user about field visibility. Present it clearly:

> "Which profiles should have access to this field?"

Offer these options:
1. **All profiles — Visible and Editable** (most common for custom fields)
2. **All profiles — Visible but Read-Only**
3. **System Administrator only** (skip FLS deployment)
4. **Custom selection** — let the user pick specific profiles from the org

If the user chooses option 4, fetch the list of profiles so they can pick:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/list-profiles.js --active-only [--target-org <alias>]
```

Present the profile names as selectable options. The user picks which profiles should
get access and whether it should be visible+editable or read-only per profile.

If the user chooses option 1, 2, or 4, the script will deploy a permission set granting
access. This is safer than modifying profile metadata because it's additive and won't
affect other field permissions.

The script creates a permission set named `<ObjectName>_<FieldName>_Access` automatically.

For the script, pass:
- `--fls visible` — readable + editable for all
- `--fls read-only` — readable only
- `--fls none` — skip FLS (admin only, default)
- `--fls custom` with `--fls-profiles "Profile1,Profile2"` — specific profiles

## Phase 6: Page Layout

Ask the user if the field should be added to page layouts:

> "Should this field be added to the object's page layouts?"

Options:
1. **Yes, add to all layouts** (default in Setup UI)
2. **No, skip layout assignment** (add manually later)

If yes, the script will:
1. Retrieve the current layout(s) from the org
2. Add the field to the first section of each layout
3. Deploy the updated layout(s)

For the script, pass:
- `--add-to-layouts` — retrieve, modify, and deploy all layouts
- (omit flag to skip)

## Phase 7: Confirm Before Creating

Show a complete summary and ask for explicit confirmation:

```
Object:           Property__c
Field Label:      Rental Price
API Name:         Rental_Price__c
Type:             Currency
Precision:        18
Scale:            2
Required:         No
Description:      Monthly rental price for the property
Field Security:   All profiles — Visible and Editable
Page Layouts:     Add to all layouts
```

Wait for confirmation before proceeding.

## Phase 8: Create the Field

Run the creation script:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/create-field/scripts/create-field.js \
  --object "<ObjectApiName>" \
  --label "<label>" \
  --api-name "<apiName>" \
  --type "<fieldType>" \
  [--description "<description>"] \
  [--help-text "<helpText>"] \
  [--required] \
  [--unique] [--case-sensitive] \
  [--external-id] \
  [--default-value "<value>"] \
  [--length <n>] \
  [--precision <n>] [--scale <n>] \
  [--visible-lines <n>] \
  [--picklist-values "Val1,Val2,Val3"] \
  [--sorted] [--restricted] [--first-value-default] \
  [--reference-to "<ObjectApiName>"] \
  [--relationship-name "<name>"] \
  [--relationship-label "<label>"] \
  [--delete-constraint <SetNull|Restrict|Cascade>] \
  [--reparentable] \
  [--write-requires-master-read] \
  [--formula "<expression>"] \
  [--formula-return-type <Text|Number|Currency|Date|DateTime|Percent|Checkbox|Time>] \
  [--formula-blanks <BlankAsZero|BlankAsBlank>] \
  [--summary-object "<ObjectApiName>"] \
  [--summary-operation <count|sum|min|max>] \
  [--summary-field "<FieldApiName>"] \
  [--summary-filter-field "<field>"] \
  [--summary-filter-operation "<op>"] \
  [--summary-filter-value "<value>"] \
  [--display-format "<format>"] \
  [--starting-number <n>] \
  [--display-location-decimal] \
  [--mask-char <asterisk|X>] \
  [--mask-type <all|creditCard|ssn|lastFour|sin|nino>] \
  [--track-history] \
  [--track-feed-history] \
  [--fls <visible|read-only|none>] \
  [--add-to-layouts] \
  [--target-org <alias>]
```

## Phase 9: Report Result

- On success: show the field label, API name, object, and confirm deployment status.
  If FLS and/or layouts were deployed, confirm those too.
- On failure: show the error and suggest fixes (auth, permissions, naming conflicts,
  invalid formula, missing related object).

## Phase 10: Offer Next Step

After successful creation, ask:

> "The field has been created. Would you like to create another field on this object?"

If yes, loop back to Phase 2 (keep the same object context).

## Authentication

If the user is not authenticated or gets an auth error, run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sf-auth.js --status
```

To authenticate:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sf-auth.js --alias <alias>
```
