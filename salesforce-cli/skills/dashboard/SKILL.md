---
name: dashboard
description: >
  Generate on-demand Salesforce dashboards as static HTML pages with interactive charts, graphs,
  and data tables. Uses Chart.js (CDN, no installation) for bar, line, pie, doughnut, radar, and
  scatter visualizations. ALWAYS invoke this skill when the user wants to create a dashboard,
  generate charts from Salesforce data, visualize org metrics, build a report with graphs, or
  create an HTML summary of their data. Do not generate dashboard HTML directly — use this skill
  first. Triggers: 'create a dashboard', 'visualize my data', 'chart opportunities by stage',
  'build a report with graphs', 'show me a dashboard of', 'HTML report', 'visualize pipeline'.
  Do NOT use for simple data queries without visualization — use salesforce-cli:data-query or
  salesforce-cli:aggregate-query instead.
argument-hint: '<description of what to visualize> [--target-org <alias>]'
allowed-tools: Bash, Read, AskUserQuestion, Skill(salesforce-cli:data-query, salesforce-cli:aggregate-query, salesforce-cli:apex-execute, salesforce-cli:describe-object, salesforce-cli:search-objects)
---

# Salesforce Dashboard Generator

Generate interactive HTML dashboards from Salesforce data. Produces a self-contained static HTML
file with Chart.js charts, data tables, and KPI cards — no installation required.

## Prerequisites

You must be authenticated to a Salesforce org before generating a dashboard.
If not authenticated, run the authentication script first.

## Authentication

If the user is not authenticated or gets an auth error, run the authentication script:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sf-auth.js --status
```

To authenticate interactively (opens browser):
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sf-auth.js --alias <alias>
```

## Workflow

```
User describes dashboard
│
├── 1. Understand & Plan
│   ├── Interpret the user's request
│   ├── Plan: title, sections, chart types, data sources
│   └── DO NOT fetch data or generate anything yet
│
├── 2. Ask Style & Theme (MANDATORY — use AskUserQuestion)
│   ├── Present style options with descriptions
│   ├── Present theme options (light / dark / both with toggle)
│   └── WAIT for user to choose before proceeding
│
├── 3. Present Blueprint (MANDATORY — never skip)
│   ├── Show the dashboard blueprint with chosen style + theme:
│   │   ├── Dashboard title, style, theme
│   │   ├── Each section: type, title, chart type, data source description
│   │   └── Output filename
│   ├── Ask: "Does this look good, or would you like to change anything?"
│   └── WAIT for user confirmation before proceeding
│
├── 4. Fetch Data from Salesforce
│   ├── Run queries using salesforce-cli skills with --json flag
│   └── Collect all results
│
├── 5. Build Dashboard Config & Generate HTML
│   ├── Map query results → chart/table/KPI config
│   ├── Pipe JSON config via stdin to generate-dashboard.js
│   └── Open in browser
│
└── 6. Present to User
    ├── Show file path and size
    └── Offer to adjust anything
```

## Step 1: Understand & Plan

Interpret the user's request and design the dashboard layout. If the request is specific
(e.g., "bar chart of opportunities by stage"), plan exactly that. If the request is vague
(e.g., "show my pipeline"), infer a reasonable dashboard layout with multiple sections.

**Planning checklist:**
- **Dashboard title** — derive from the data subject if not specified
- **Sections** — decide which charts, tables, and KPIs to include
- **Chart types** — pick the best chart type for each data shape (see Query Strategy below)
- **Output filename** — descriptive name like `pipeline-dashboard.html`

Do NOT ask the user to fill in a questionnaire about data content. Instead, design the
dashboard sections yourself. However, style and theme MUST be asked explicitly (see Step 2).

## Step 2: Ask Style & Theme (MANDATORY)

**You MUST use AskUserQuestion to ask the user about style and theme before presenting
the blueprint.** Do not silently default these — the user needs to actively choose.

Ask TWO questions using AskUserQuestion:

**Question 1 — Style:**
- header: "Style"
- question: "Which visual style would you like for your dashboard?"
- options:
  - **Corporate (Recommended)** — Clean, professional look with subtle shadows. Good for business dashboards.
  - **Executive** — Bold, high-contrast with gold accent. Dark only. Great for presentations.
  - **Minimal** — Flat design, no shadows, generous whitespace. Clean and focused.
  - **Vibrant** — Colorful accents with gradient header. Modern, eye-catching.
- Note: If the user picks "Other", also mention `compact` (dense layout, smaller fonts — good for data-heavy views).

**Question 2 — Theme:**
- header: "Theme"
- question: "Which theme would you like?"
- options:
  - **Both with toggle (Recommended)** — Includes a sun/moon button so viewers can switch between light and dark.
  - **Light only** — Fixed light theme, no toggle.
  - **Dark only** — Fixed dark theme, no toggle.
- Note: If user chose Executive style, skip this question — Executive is always dark.

**WAIT for the user to answer both questions before proceeding to Step 3.**

### Style Reference

| Style | Look | Themes | Config Value |
|---|---|---|---|
| Corporate | Clean, professional, subtle shadows | Light + Dark | `"corporate"` |
| Executive | Bold, high-contrast, gold accent bar | Dark only | `"executive"` |
| Minimal | Flat, no shadows, generous whitespace | Light + Dark | `"minimal"` |
| Vibrant | Colorful accents, gradient header | Light + Dark | `"vibrant"` |
| Compact | Dense layout, smaller fonts/padding | Light + Dark | `"compact"` |

### Theme Reference

| Option | Config Value | Behavior |
|---|---|---|
| Both with toggle | `"both"` | Sun/moon toggle in header, defaults to OS preference |
| Light only | `"light"` | Baked light theme, no toggle |
| Dark only | `"dark"` | Baked dark theme, no toggle |

## Step 3: Present Blueprint (MANDATORY)

**You MUST present the blueprint and get user confirmation before fetching any data.**
The blueprint should use the style and theme the user chose in Step 2.

Present a clear summary of what the dashboard will contain. Format it as a numbered list
so the user can easily reference specific items to change:

```
Here's the dashboard I'll generate:

**Title:** Opportunity Pipeline Dashboard
**Style:** Corporate (the style user chose)
**Theme:** Both — light/dark toggle (the theme user chose)
**File:** pipeline-dashboard.html

Sections:
1. KPI — "Open Deals" (count of open opportunities)
2. KPI — "Pipeline Value" (sum of open opportunity amounts)
3. KPI — "Won This Year" (sum of closed-won amounts this year)
4. Bar Chart — "Deals by Stage" (opportunity count grouped by stage)
5. Pie Chart — "Revenue by Stage" (amount sum grouped by stage)
6. Line Chart — "Monthly Revenue Trend" (monthly amount totals this year)
7. Table — "Top 10 Open Opportunities" (name, account, amount, stage, close date)

Does this look good, or would you like to change anything?
(e.g., add/remove sections, change chart types, adjust titles)
```

**After presenting the blueprint:**
- WAIT for the user to respond. Do NOT proceed to data fetching.
- If the user says "looks good" / "yes" / "go ahead" → proceed to Step 4.
- If the user requests changes → update the plan and present the revised blueprint again.
- If the user adds new sections → incorporate them and re-confirm.

This confirmation gate exists because generating the wrong dashboard wastes time and
API calls. It's always faster to confirm first than to regenerate.

## Step 4: Fetch Data from Salesforce

Only proceed here after the user has confirmed the blueprint.

### Query Strategy

| Visualization | Query Type | Skill to Use |
|---|---|---|
| Bar/Pie chart: counts by category | Aggregate (COUNT + GROUP BY) | `salesforce-cli:aggregate-query` |
| Bar/Line chart: sums by category | Aggregate (SUM + GROUP BY) | `salesforce-cli:aggregate-query` |
| Line chart: trend over time | Aggregate (SUM + GROUP BY + CALENDAR_MONTH) | `salesforce-cli:aggregate-query` |
| KPI: total count | Count query | `salesforce-cli:data-query` |
| KPI: total amount | Aggregate (SUM) | `salesforce-cli:aggregate-query` |
| Table: top N records | Standard SELECT + ORDER BY + LIMIT | `salesforce-cli:data-query` |
| Complex calculations | Anonymous Apex | `salesforce-cli:apex-execute` |

### Use --json for Structured Output

Always use the `--json` flag when running queries for dashboard data because you need to
parse the results programmatically to build the chart config:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/aggregate-query/scripts/aggregate.js "SELECT StageName, SUM(Amount) FROM Opportunity GROUP BY StageName" --json
```

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/data-query/scripts/query.js "SELECT Name, Amount, StageName FROM Opportunity ORDER BY Amount DESC LIMIT 10" --json
```

### Parsing Results

Aggregate query JSON returns records like:
```json
{ "StageName": "Closed Won", "expr0": 1500000 }
```

Map `expr0`, `expr1`, etc. to the aggregate functions in order. Named aliases appear as-is:
```json
{ "StageName": "Closed Won", "total": 1500000 }
```

Standard query JSON returns records like:
```json
{ "attributes": { "type": "Account" }, "Name": "Acme", "Industry": "Tech" }
```

Skip the `attributes` key when mapping to table rows.

## Step 5: Build Dashboard Config & Generate HTML

Create a JSON config following the structure documented in [references/chart-patterns.md](references/chart-patterns.md).

### Mapping Data to Charts

**Aggregate → Bar/Pie Chart:**
```
Query result: [{ "StageName": "Prospecting", "expr0": 50 }, { "StageName": "Closed Won", "expr0": 30 }]

Map to:
  labels: ["Prospecting", "Closed Won"]
  datasets[0].data: [50, 30]
```

**Time-Series Aggregate → Line Chart:**
```
Query result: [{ "expr0": 2025, "expr1": 1, "expr2": 100000 }, ...]

Map to:
  labels: ["Jan 2025", "Feb 2025", ...]
  datasets[0].data: [100000, ...]
```

**Standard Query → Table:**
```
Query result: [{ "Name": "Acme", "Amount": 500000 }, ...]

Map to:
  headers: ["Name", "Amount"]
  rows: [["Acme", "$500,000"], ...]
```

### Formatting Values

- Currency: `$1,234,567` or `$1.2M` for KPIs
- Percentages: `34.5%`
- Large numbers: `1,234` or `1.2K` for KPIs
- Dates: `"Jan 2025"` for chart labels, `"2025-01-15"` for table cells

### Layout Recommendations

- Start with KPI cards (3 across using `"width": "third"`) for headline metrics
- Follow with charts (use `"width": "half"` for side-by-side comparisons)
- End with detail tables (`"width": "full"`)
- Use metric-row sections to group 3-6 related metrics compactly

Pipe the config JSON directly into the generation script via stdin using a heredoc.
This avoids creating a temporary config file (which would trigger a file-creation prompt):

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/dashboard/scripts/generate-dashboard.js --stdin --output <dashboard.html> --open <<'DASHEOF'
{ "title": "...", "style": "corporate", "theme": "both", "sections": [...] }
DASHEOF
```

The `--open` flag automatically opens the HTML in the user's default browser.

**IMPORTANT:** Always use `--stdin` with a heredoc. Do NOT write a separate config JSON file.

## Step 6: Present Results

After generating, tell the user:
1. Where the file was saved and its size
2. What sections the dashboard contains (N charts, N tables, N KPIs)
3. That they can open it in any browser
4. Offer to adjust: add/remove sections, change chart types, switch theme, modify titles

## Complete Example

User asks: "Create a dashboard showing my opportunity pipeline"

**Step 1 — Plan:** This is a vague request. Infer a sensible pipeline dashboard with KPIs,
stage breakdowns, a trend line, and a top deals table.

**Step 2 — Ask style & theme using AskUserQuestion:**

> Question 1: "Which visual style would you like for your dashboard?"
> - Corporate (Recommended) — Clean, professional
> - Executive — Bold, dark, gold accent
> - Minimal — Flat, no shadows
> - Vibrant — Colorful, gradient header
>
> Question 2: "Which theme would you like?"
> - Both with toggle (Recommended) — Light/dark switch button
> - Light only
> - Dark only

**User picks Corporate + Both → Step 3 — Present blueprint:**

> Here's the dashboard I'll generate:
>
> **Title:** Opportunity Pipeline Dashboard
> **Subtitle:** Current fiscal year overview
> **Style:** Corporate
> **Theme:** Both (light/dark toggle)
> **File:** pipeline-dashboard.html
>
> Sections:
> 1. KPI — "Open Deals" (count of open opportunities)
> 2. KPI — "Pipeline Value" (sum of open opportunity amounts)
> 3. KPI — "Won This Year" (sum of closed-won amounts this year)
> 4. Bar Chart — "Deals by Stage" (opportunity count grouped by stage)
> 5. Pie Chart — "Revenue by Stage" (amount sum grouped by stage)
> 6. Line Chart — "Monthly Revenue Trend" (monthly amount totals this year)
> 7. Table — "Top 10 Open Opportunities" (name, account, amount, stage, close date)
>
> Does this look good, or would you like to change anything?

**User confirms → Step 4 — Fetch data:**
1. `SELECT StageName, COUNT(Id), SUM(Amount) FROM Opportunity GROUP BY StageName`
2. `SELECT CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate), SUM(Amount) FROM Opportunity WHERE CloseDate >= THIS_YEAR GROUP BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate) ORDER BY ...`
3. `SELECT COUNT(Id) FROM Opportunity WHERE IsClosed = false`
4. `SELECT SUM(Amount) FROM Opportunity WHERE StageName = 'Closed Won' AND CloseDate >= THIS_YEAR`
5. `SELECT Name, Account.Name, Amount, StageName, CloseDate FROM Opportunity WHERE IsClosed = false ORDER BY Amount DESC LIMIT 10`

**Step 5 — Generate HTML with the fetched data.**

## Section Type Reference

For complete documentation on all section types, chart configurations, layout patterns, and
data formatting, see [references/chart-patterns.md](references/chart-patterns.md).

## Tips

- Always use `--json` when running queries for dashboard data so results can be parsed.
- Run multiple independent queries in parallel for faster data collection.
- For pie/doughnut charts, limit to 6-8 slices. Group smaller values into an "Other" category.
- Default to `theme: "both"` so the user gets a toggle button. Only use `"light"` or `"dark"` if explicitly asked.
- Use `executive` style for boardroom/presentation dashboards — it's always dark with a gold accent.
- Use `compact` style when the dashboard has many sections or dense data tables.
- If a query returns no data, either skip that section or show a "No data" message in the chart title.
- The generated HTML requires internet access to load Chart.js from CDN. Tables work offline.
- The generated datetime is always appended — both in the header and footer of the dashboard.
- Suggest descriptive filenames: `pipeline-dashboard.html`, `sales-report.html`, not `dashboard.html`.
