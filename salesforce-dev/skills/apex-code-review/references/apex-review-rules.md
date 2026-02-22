# Apex Code Review Rules Reference

Comprehensive rule set for reviewing Salesforce Apex classes. Rules are organized by
severity and category. Each rule includes the rationale, violation pattern, and fix.

---

## Severity Definitions

| Severity | Definition | Examples |
|----------|-----------|----------|
| **CRITICAL** | Security vulnerabilities, data loss risks, or issues that will cause runtime failures in production | SOQL injection, missing CRUD/FLS, missing sharing keywords, hardcoded credentials |
| **HIGH** | Governor limit violations, performance issues that break under load, or incorrect business logic patterns | SOQL/DML in loops, non-bulkified triggers, missing error handling, empty catch blocks |
| **MEDIUM** | Design pattern violations, maintainability issues, or code quality problems | No trigger handler pattern, god classes, excessive complexity, missing test assertions |
| **LOW** | Naming conventions, code style, minor improvements | Naming deviations, missing braces, unused variables, debug statements |
| **INFO** | Suggestions, recommendations, and best practice tips | Consider caching, consider async processing, consider using newer API features |

---

## CRITICAL Rules

### SEC-01: SOQL Injection
**Category:** Security
**PMD Rule:** `ApexSOQLInjection`

SOQL injection occurs when user input is concatenated directly into dynamic SOQL strings.

**Violation:**
```apex
String userInput = ApexPages.currentPage().getParameters().get('name');
List<Account> accounts = Database.query('SELECT Id FROM Account WHERE Name = \'' + userInput + '\'');
```

**Fix:**
```apex
// Preferred: bind variables in static SOQL
List<Account> accounts = [SELECT Id FROM Account WHERE Name = :userInput];

// If dynamic SOQL is required: escapeSingleQuotes
String safe = String.escapeSingleQuotes(userInput);
List<Account> accounts = Database.query('SELECT Id FROM Account WHERE Name = \'' + safe + '\'');
```

### SEC-02: Missing CRUD/FLS Enforcement
**Category:** Security
**PMD Rule:** `ApexCRUDViolation`

Every database operation must respect the running user's object and field permissions.

**Violation:**
```apex
@AuraEnabled
public static List<Account> getAccounts() {
    return [SELECT Id, Name, AnnualRevenue FROM Account];
}
```

**Fix (Modern -- Spring '23+):**
```apex
@AuraEnabled(cacheable=true)
public static List<Account> getAccounts() {
    return [SELECT Id, Name, AnnualRevenue FROM Account WITH USER_MODE];
}
```

**Fix (Legacy):**
```apex
if (!Schema.sObjectType.Account.isAccessible()) {
    throw new AuraHandledException('Insufficient access to Account');
}
```

### SEC-03: Missing Sharing Declaration
**Category:** Security
**PMD Rule:** `ApexSharingViolations`

All classes must explicitly declare `with sharing`, `without sharing`, or `inherited sharing`.
Classes without a sharing keyword default to `without sharing` in many contexts.

**Violation:**
```apex
public class AccountService {
    public List<Account> getAccounts() {
        return [SELECT Id, Name FROM Account];
    }
}
```

**Fix:**
```apex
public with sharing class AccountService { ... }
// OR for utility classes:
public inherited sharing class QueryUtility { ... }
```

### SEC-04: Insecure Endpoints (HTTP)
**Category:** Security
**PMD Rule:** `ApexInsecureEndpoint`

Always use HTTPS. Never use HTTP for external callouts.

**Violation:**
```apex
req.setEndpoint('http://api.example.com/data');
```

**Fix:**
```apex
req.setEndpoint('callout:My_Named_Credential/api/data');
// OR at minimum:
req.setEndpoint('https://api.example.com/data');
```

### SEC-05: Hardcoded Credentials / Sensitive Data
**Category:** Security
**PMD Rule:** `ApexSuggestUsingNamedCred`

Never hardcode API keys, passwords, tokens, or secrets. Use Named Credentials.

**Violation:**
```apex
req.setHeader('Authorization', 'Bearer sk-abc123xyz');
```

**Fix:**
```apex
// Use Named Credentials -- credentials managed in Setup
req.setEndpoint('callout:ExternalService/api/resource');
```

### SEC-06: XSS Vulnerabilities
**Category:** Security
**PMD Rules:** `ApexXSSFromEscapeFalse`, `ApexXSSFromURLParam`

Never disable output encoding or render unsanitized user input.

**Violations:**
- `escape="false"` on Visualforce output tags
- Using URL parameters directly in output without encoding

### SEC-07: Bad Crypto Practices
**Category:** Security
**PMD Rule:** `ApexBadCrypto`

Use randomly generated IVs and keys for encryption. Never use static/hardcoded crypto values.

### SEC-08: Open Redirect
**Category:** Security
**PMD Rule:** `ApexOpenRedirect`

Never redirect to user-controlled URLs without validation.

### SEC-09: CSRF Vulnerability
**Category:** Security
**PMD Rule:** `ApexCSRF`

Never perform state-changing operations in Visualforce page constructors, getter methods,
or page action methods (these execute on GET requests).

---

## HIGH Rules

### GOV-01: SOQL in Loops
**Category:** Governor Limits
**PMD Rule:** `OperationWithLimitsInLoop`

SOQL queries inside loops will hit the 100-query limit. Query once before the loop.

**Violation:**
```apex
for (Contact c : contactList) {
    Account acc = [SELECT Id, Name FROM Account WHERE Id = :c.AccountId];
}
```

**Fix:**
```apex
Set<Id> accountIds = new Set<Id>();
for (Contact c : contactList) {
    accountIds.add(c.AccountId);
}
Map<Id, Account> accountMap = new Map<Id, Account>(
    [SELECT Id, Name FROM Account WHERE Id IN :accountIds]
);
for (Contact c : contactList) {
    Account acc = accountMap.get(c.AccountId);
}
```

### GOV-02: DML in Loops
**Category:** Governor Limits
**PMD Rule:** `OperationWithLimitsInLoop`

DML inside loops will hit the 150-DML limit. Collect records and perform bulk DML.

**Violation:**
```apex
for (Account acc : accounts) {
    acc.Description = 'Updated';
    update acc;
}
```

**Fix:**
```apex
for (Account acc : accounts) {
    acc.Description = 'Updated';
}
update accounts;
```

### GOV-03: Callouts in Loops
**Category:** Governor Limits
**PMD Rule:** `OperationWithLimitsInLoop`

HTTP callouts inside loops will hit the 100-callout limit.

### GOV-04: Non-Bulkified Code
**Category:** Governor Limits

Trigger code must handle up to 200 records per batch. Code that assumes single-record
context will fail in bulk operations (Data Loader, batch jobs, API bulk inserts).

**Check for:**
- Trigger handlers that don't iterate over `Trigger.new`
- Single-record assumptions in service methods called from triggers
- SOQL queries retrieving single records where bulk collection should be used

### GOV-05: Non-Selective Queries on Large Objects
**Category:** Performance

Queries without selective filters on objects with 200,000+ records throw
`System.QueryException: Non-selective query`.

**Check for:**
- Missing WHERE clause filters
- Filters on non-indexed fields
- Leading wildcards in LIKE clauses
- Negative operators (!=, NOT IN, NOT LIKE)

### ERR-01: Empty Catch Blocks
**Category:** Error Handling
**PMD Rule:** `EmptyCatchBlock`

Silently swallowing exceptions hides bugs and makes debugging impossible.

**Violation:**
```apex
try {
    update accounts;
} catch (Exception e) {
    // do nothing
}
```

**Fix:**
```apex
try {
    update accounts;
} catch (DmlException e) {
    ErrorLogger.log('AccountService.updateAccounts', e);
    throw new AccountServiceException('Failed to update accounts: ' + e.getMessage(), e);
}
```

### ERR-02: Catching Generic Exception
**Category:** Error Handling

Catch specific exception types rather than the base `Exception` class.

### ERR-03: Logic in Triggers
**Category:** Design
**PMD Rule:** `AvoidLogicInTrigger`

Triggers should contain zero business logic. Delegate everything to handler classes.

**Violation:**
```apex
trigger AccountTrigger on Account (before insert) {
    for (Account acc : Trigger.new) {
        acc.Description = 'Created on ' + Date.today();
        // ... 50 more lines of logic
    }
}
```

**Fix:**
```apex
trigger AccountTrigger on Account (before insert, before update, after insert, after update) {
    new AccountTriggerHandler().run();
}
```

### PERF-01: Operations with High Cost in Loop
**Category:** Performance
**PMD Rule:** `OperationWithHighCostInLoop`

Expensive operations inside loops (JSON serialization, describe calls, regex compilation)
consume CPU time rapidly.

### PERF-02: Non-Restrictive Queries
**Category:** Performance
**PMD Rule:** `AvoidNonRestrictiveQueries`

SOQL queries without WHERE clause filters or with LIMIT return all records, risking
the 50,000 record retrieval limit.

---

## MEDIUM Rules

### DES-01: Excessive Cyclomatic Complexity
**Category:** Design
**PMD Rules:** `CyclomaticComplexity`, `CognitiveComplexity`, `StdCyclomaticComplexity`

Methods with complexity > 10 are hard to test and maintain. Break into smaller methods.

### DES-02: Method Too Long
**Category:** Design
**PMD Rule:** `NcssCount`

Methods exceeding 40-50 lines of executable code should be broken down.

### DES-03: Too Many Parameters
**Category:** Design
**PMD Rule:** `ExcessiveParameterList`

Methods with more than 4 parameters suggest the need for a wrapper/DTO class.

### DES-04: God Class
**Category:** Design
**PMD Rules:** `ExcessivePublicCount`, `TooManyFields`

Classes with too many public methods/fields or too many fields violate
Single Responsibility Principle. Break into focused service classes.

### DES-05: Deeply Nested If Statements
**Category:** Design
**PMD Rule:** `AvoidDeeplyNestedIfStmts`

More than 3 levels of nesting makes code hard to read. Use guard clauses or extract methods.

### TST-01: Test Without Assertions
**Category:** Testing
**PMD Rule:** `ApexUnitTestClassShouldHaveAsserts`

Every test method MUST contain at least one assertion. Tests without assertions
only prove the code doesn't throw exceptions, not that it works correctly.

### TST-02: Assertions Without Messages
**Category:** Testing
**PMD Rule:** `ApexAssertionsShouldIncludeMessage`

Include descriptive messages in assertions for easier debugging.

### TST-03: Test Using seeAllData=true
**Category:** Testing
**PMD Rule:** `ApexUnitTestShouldNotUseSeeAllDataTrue`

Tests using `@isTest(seeAllData=true)` depend on org data and are fragile.
Create all test data programmatically.

### TST-04: Test Without RunAs
**Category:** Testing
**PMD Rule:** `ApexUnitTestClassShouldHaveRunAs`

Tests should use `System.runAs()` to verify sharing and profile-based behavior.

### TST-05: No Bulk Testing
**Category:** Testing

Test methods should test with 200+ records to validate trigger bulkification.

### TST-06: No Negative Testing
**Category:** Testing

Tests should cover error scenarios, boundary conditions, and exception paths.

### MAINT-01: Hardcoded IDs
**Category:** Maintainability
**PMD Rule:** `AvoidHardcodingId`

IDs differ between sandbox and production. Query by DeveloperName or use Custom Metadata.

**Violation:**
```apex
Account acc = new Account(RecordTypeId = '012000000000001');
```

**Fix:**
```apex
Id rtId = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName()
    .get('Enterprise').getRecordTypeId();
```

### MAINT-02: Magic Numbers/Strings
**Category:** Maintainability

Replace magic numbers with named constants or Custom Metadata.

### MAINT-03: Hardcoded URLs
**Category:** Maintainability

Use Named Credentials, Custom Metadata, or `URL.getOrgDomainUrl()`.

---

## LOW Rules

### STYLE-01: Naming Convention Violations
**Category:** Code Style
**PMD Rules:** `ClassNamingConventions`, `MethodNamingConventions`, `FieldNamingConventions`,
`LocalVariableNamingConventions`, `FormalParameterNamingConventions`, `PropertyNamingConventions`

| Element | Convention | Example |
|---------|-----------|---------|
| Classes | PascalCase | `AccountService` |
| Methods | camelCase, start with verb | `getAccountById()` |
| Variables | camelCase | `accountList` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT` |

### STYLE-02: Missing Braces
**Category:** Code Style
**PMD Rules:** `IfStmtsMustUseBraces`, `ForLoopsMustUseBraces`, `WhileLoopsMustUseBraces`,
`IfElseStmtsMustUseBraces`

Always use braces for control structures, even single-line bodies.

### STYLE-03: Debug Statements in Production Code
**Category:** Code Style
**PMD Rule:** `AvoidDebugStatements`

`System.debug()` calls consume CPU time and clutter logs. Remove from production code or
use a structured logging framework.

### STYLE-04: Unused Variables
**Category:** Code Style
**PMD Rule:** `UnusedLocalVariable`

Remove unused local variables to reduce clutter.

### STYLE-05: Unused Methods
**Category:** Code Style
**PMD Rule:** `UnusedMethod`

Remove unused private methods (dead code).

### STYLE-06: Empty Blocks
**Category:** Code Style
**PMD Rules:** `EmptyIfStmt`, `EmptyWhileStmt`, `EmptyStatementBlock`,
`EmptyTryOrFinallyBlock`

Remove or fill empty code blocks. If intentionally empty, add a comment explaining why.

### STYLE-07: testMethod Keyword
**Category:** Code Style
**PMD Rule:** `ApexUnitTestMethodShouldHaveIsTestAnnotation`

Use `@isTest` annotation instead of the deprecated `testMethod` keyword.

### STYLE-08: Debug Without LoggingLevel
**Category:** Code Style
**PMD Rule:** `DebugsShouldUseLoggingLevel`

Specify `LoggingLevel` in `System.debug()` calls.

### STYLE-09: Field Declarations Position
**Category:** Code Style
**PMD Rule:** `FieldDeclarationsShouldBeAtStart`

Field declarations should come before method declarations.

### STYLE-10: Global Modifier Overuse
**Category:** Code Style
**PMD Rule:** `AvoidGlobalModifier`

Avoid `global` unless required for managed packages. Use `public` instead.

---

## INFO Rules

### REC-01: Consider @AuraEnabled(cacheable=true)

For read-only `@AuraEnabled` methods, add `cacheable=true` for client-side caching.

### REC-02: Consider Queueable Over @future
**PMD Rule:** `AvoidFutureAnnotation`

Queueable provides more features: chaining, monitoring, complex parameters.

### REC-03: Consider Platform Cache

For frequently accessed, rarely changed data, use Org Cache or Session Cache.

### REC-04: Consider WITH USER_MODE

Modern replacement for `WITH SECURITY_ENFORCED`. Enforces CRUD, FLS, and sharing.

### REC-05: Consider Lazy Describe
**PMD Rule:** `EagerlyLoadedDescribeSObjectResult`

Use `SObjectDescribeOptions.DEFERRED` parameter for lazy-loaded describe results.

### REC-06: Consider Aggregate Queries

Use `COUNT()`, `SUM()`, `AVG()` instead of retrieving all records to process in Apex.

### REC-07: Direct Trigger Map Access
**PMD Rule:** `AvoidDirectAccessTriggerMap`

Pass `Trigger.new`/`Trigger.oldMap` as parameters to handler methods rather than
accessing them directly inside service classes.

### REC-08: Consider Queueable Finalizer
**PMD Rule:** `QueueableWithoutFinalizer`

Queueable classes should implement a finalizer for error handling and retry logic.

---

## Governor Limits Quick Reference

| Limit | Synchronous | Asynchronous |
|-------|------------|--------------|
| SOQL queries | 100 | 200 |
| Records retrieved | 50,000 | 50,000 |
| SOSL queries | 20 | 20 |
| DML statements | 150 | 150 |
| DML rows | 10,000 | 10,000 |
| CPU time | 10,000 ms | 60,000 ms |
| Heap size | 6 MB | 12 MB |
| Callouts | 100 | 100 |
| Future calls | 50 | 0 (in future) |
| Queueable jobs | 50 | 1 |
| Email invocations | 10 | 10 |
