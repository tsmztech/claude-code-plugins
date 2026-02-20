---
name: check-setup
description: Check Salesforce CLI prerequisites and org authentication status
disable-model-invocation: true
allowed-tools:
  - Bash
---

# Salesforce Plugin Setup Check

Run the following checks in order and report results to the user:

## 1. SF CLI Installed
Run: `sf --version`
- If it fails: Tell user to install SF CLI from https://developer.salesforce.com/tools/salesforcecli

## 2. Default Org Set
Run: `sf config get target-org --json`
- If no value: Tell user to run `sf config set target-org <alias> --global`

## 3. Org Authentication Valid
Run: `sf org display --json`
- If it succeeds: Show the org alias, username, and instance URL
- If it fails with auth error: Tell user to run `sf org login web -a <alias>`

## 4. API Access
Run: `sf data query --query "SELECT Id FROM Account LIMIT 1" --json`
- If it succeeds: Confirm API access is working
- If it fails: Report the specific error

## Output Format
Summarize as a checklist:
- ✅ or ❌ SF CLI installed (version)
- ✅ or ❌ Default org configured (alias)
- ✅ or ❌ Authentication valid (username)
- ✅ or ❌ API access working
```

User runs it as:
```
/salesforce-cli:check-setup