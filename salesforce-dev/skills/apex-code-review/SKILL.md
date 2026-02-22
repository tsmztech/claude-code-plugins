---
name: apex-code-review
description: >
  Apex and Salesforce code review specialist. ALWAYS invoke this skill when the user wants
  to code review, security audit, or quality check classes, triggers, or test classes in a
  Salesforce context. Do not review classes or triggers directly -- use this skill first,
  even if the user does not explicitly say 'Apex'. Triggers: 'code review', 'review my
  class', 'review these classes', 'check my code', 'review my apex', 'apex best practices',
  'security review', '.cls', '.trigger', or class names following Salesforce patterns
  (Handler, Service, Controller, Helper, Batch, Selector, Test). Do NOT use for LWC/Aura
  JavaScript reviews or declarative automation reviews.
allowed-tools: Bash, Read, Glob, Grep, Write, AskUserQuestion
---

# Apex Code Review

Perform a structured, severity-categorized code review of Apex classes, triggers, and
test classes against Salesforce best practices, security guidelines, governor limit
awareness, and design patterns.

## Phase 1: Your FIRST action -- ask where to get the source code

Before doing ANYTHING else -- before searching, before reading files, before any Glob
calls -- you must ask the user where the Apex source code is located. This is your
first action every time because class names alone don't tell you whether the files
exist locally or need to be fetched from a Salesforce org.

### What NOT to do (common failure)

```
❌ WRONG: User says "review AccountService" → you immediately run Glob to search
   for the file → file not found → you ask user to paste code or give a path.
   This wastes time and misses the Salesforce org fetch entirely.
```

### What to do instead

```
✅ RIGHT: User says "review AccountService" → you FIRST ask where to get the file
   → user says "Salesforce org" → you run fetch-apex.js → you have the code.
```

### Step 1: Collect file/class names

Determine which files to review from the request:

- `$ARGUMENTS` contains file paths or class names → use those
- User has an IDE selection → review that code directly (skip Step 2)
- Neither → ask the user which files to review

### Step 2: Ask source preference using AskUserQuestion

Use AskUserQuestion to ask where to get the source code. Here is the exact question
to ask -- do not skip this, do not try to find the files first:

```
question: "Where should I get the Apex source code?"
options:
  - label: "Search locally"
    description: "I'll search for the files in the current project directory"
  - label: "Fetch from Salesforce org"
    description: "I'll retrieve the source code from your connected Salesforce org"
```

Skip this question ONLY if one of these is true:
- The user gave full file paths (e.g., `force-app/.../AccountService.cls`)
- The user has code selected in their IDE
- The user explicitly said "from org" or "from salesforce" in their message

### Step 3: Retrieve files based on user's answer

**If "Search locally":**
1. For full file paths, read directly with the Read tool.
2. For class/trigger names, search using Glob (`**/<Name>.cls` or `**/<Name>.trigger`).
3. If not found, tell the user and offer to fetch from Salesforce org instead.

**If "Fetch from Salesforce org":**
Run the fetch-apex script:

```bash
# Multiple classes (comma-separated)
node ${CLAUDE_PLUGIN_ROOT}/scripts/fetch-apex.js --name AccountService,ContactService

# Pattern match
node ${CLAUDE_PLUGIN_ROOT}/scripts/fetch-apex.js --like Account%

# Triggers
node ${CLAUDE_PLUGIN_ROOT}/scripts/fetch-apex.js --name AccountTrigger --type trigger

# Specific org
node ${CLAUDE_PLUGIN_ROOT}/scripts/fetch-apex.js --name AccountService --target-org myOrg

# List all classes in org
node ${CLAUDE_PLUGIN_ROOT}/scripts/fetch-apex.js --list
```

If the fetch fails with an auth error, suggest running the `sf-auth` skill or
`sf org login web`.

### Corresponding test classes

After retrieving files, also check if a corresponding test class exists (e.g.,
`AccountService.cls` -> `AccountServiceTest.cls` or `AccountService_Test.cls`),
using the same source (local or org) the user chose.

---

## Phase 2: Ask Output Format

Before starting the analysis, ask the user:

```
How would you like the review report delivered?

1. **Chat** -- Display the report directly here in the conversation
2. **Markdown file** -- Generate a `.md` report file (great for sharing/archiving)
3. **CSV file** -- Generate a `.csv` file (great for tracking in spreadsheets)
```

Wait for their response before proceeding.

---

## Phase 3: Analyze Code

Load the comprehensive rules from [references/apex-review-rules.md](references/apex-review-rules.md).

For each file, systematically check against ALL rule categories:

### Security (CRITICAL priority)
- SEC-01: SOQL injection (dynamic SOQL with user input)
- SEC-02: Missing CRUD/FLS enforcement (no `WITH USER_MODE`, no describe checks)
- SEC-03: Missing sharing declaration (no `with sharing`/`inherited sharing`/`without sharing`)
- SEC-04: Insecure endpoints (HTTP instead of HTTPS)
- SEC-05: Hardcoded credentials
- SEC-06: XSS vulnerabilities
- SEC-07: Bad crypto practices
- SEC-08: Open redirect
- SEC-09: CSRF vulnerability

### Governor Limits (HIGH priority)
- GOV-01: SOQL queries inside loops
- GOV-02: DML statements inside loops
- GOV-03: Callouts inside loops
- GOV-04: Non-bulkified trigger code
- GOV-05: Non-selective queries on large objects

### Error Handling (HIGH priority)
- ERR-01: Empty catch blocks
- ERR-02: Catching generic Exception instead of specific types
- ERR-03: Business logic directly in triggers

### Performance (HIGH priority)
- PERF-01: Expensive operations in loops
- PERF-02: Non-restrictive queries (no WHERE/LIMIT)

### Design (MEDIUM priority)
- DES-01 to DES-05: Complexity, method length, parameter count, god classes, nesting

### Testing (MEDIUM priority -- for test classes)
- TST-01 to TST-06: Assertions, seeAllData, runAs, bulk testing, negative testing

### Maintainability (MEDIUM priority)
- MAINT-01: Hardcoded IDs
- MAINT-02: Magic numbers/strings
- MAINT-03: Hardcoded URLs

### Code Style (LOW priority)
- STYLE-01 to STYLE-10: Naming, braces, debug statements, unused code, empty blocks

### Recommendations (INFO)
- REC-01 to REC-08: Cacheable methods, queueable over future, platform cache, etc.

### Analysis Guidelines

- Be thorough but avoid false positives -- only flag actual violations
- For each finding, identify the EXACT line number(s)
- Provide a concrete code fix, not just a description of the problem
- Consider the context: a `without sharing` class may be intentional if documented
- Check relationships between files: does a trigger have a handler? Does a service have tests?
- For test classes, also check: coverage strategy, data factory usage, bulk testing, negative paths

---

## Phase 4: Present Report

### Report Structure

#### 4a. Executive Summary

Show a summary table with counts:

```
## Executive Summary

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL |     X | Security vulnerabilities, data loss risks |
| HIGH     |     X | Governor limit violations, performance issues |
| MEDIUM   |     X | Design/testing/maintainability issues |
| LOW      |     X | Code style and conventions |
| INFO     |     X | Recommendations and suggestions |
| **TOTAL** | **X** | |

Files reviewed: X
Lines analyzed: ~X
```

If zero CRITICAL and HIGH issues, add a positive note:
`No critical or high-severity issues found. The code follows core Salesforce best practices.`

#### 4b. Detailed Findings

Group findings by severity, then by file. For each finding:

```
### [SEVERITY] [Rule ID]: [Rule Name]
**File:** `path/to/File.cls` **Line(s):** X-Y
**Issue:** [Clear description of what's wrong and why it matters]
**Current code:**
```apex
// The problematic code snippet
```
**Recommended fix:**
```apex
// The corrected code snippet
```
```

#### 4c. File-Level Notes

After the detailed findings, add per-file observations:

- Overall code quality assessment
- Missing corresponding test class (if applicable)
- Architecture/pattern recommendations
- Whether the file follows the project's existing patterns

### CSV Format

If the user chose CSV, generate a file with these columns:

```
Severity,Rule ID,Rule Name,Category,File,Line(s),Issue Description,Recommended Fix
```

Use double-quote escaping for fields containing commas or newlines.

### Markdown File Format

If the user chose Markdown, generate a `.md` file with the full report structure above,
including a metadata header:

```markdown
# Apex Code Review Report
- **Date:** [current date]
- **Files Reviewed:** [list]
- **Reviewer:** Claude (Automated)
```

Save the file as `apex-code-review-report.md` (or `apex-code-review-report.csv`) in
the project root or a location specified by the user.

---

## Phase 5: Next Steps

After presenting the report, ask the user:

```
## What would you like to do next?

1. **Apply all fixes** -- I'll implement all recommended changes across all severities
2. **Fix Critical & High only** -- I'll fix only the most important issues
3. **Fix specific issues** -- Tell me which rule IDs or findings to address
4. **Discuss findings** -- Let's review specific findings in more detail
5. **Export report** -- Save the report to a file (if shown in chat)
6. **Done** -- No changes needed
```

### When Applying Fixes

- Make changes one file at a time
- Show a summary of what was changed per file
- Preserve existing code style and formatting
- Do NOT introduce new issues while fixing existing ones
- For complex fixes (e.g., refactoring a trigger to use handler pattern), explain the
  full scope of changes before making them
- After applying fixes, offer to re-run the review to verify no new issues were introduced

---

## Important Notes

- Do NOT skip any severity category during analysis -- check everything
- Do NOT report issues that aren't actually present (no false positives)
- When uncertain about intent (e.g., `without sharing` might be intentional),
  flag it as INFO with a note to verify rather than as CRITICAL
- If reviewing test classes, also evaluate the quality of assertions and coverage
  strategy, not just whether tests exist
- For multi-file reviews, check cross-file concerns:
  - Does every trigger have a corresponding handler class?
  - Do service classes have corresponding test classes?
  - Are there circular dependencies or unclear responsibilities?
- The review should be educational: explain WHY each rule matters, not just what's wrong
