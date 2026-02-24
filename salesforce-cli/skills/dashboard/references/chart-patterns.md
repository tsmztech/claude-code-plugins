# Chart Patterns Reference

Complete reference for building the JSON configuration consumed by `generate-dashboard.js`.

## JSON Config Structure

```json
{
  "title": "Dashboard Title",
  "subtitle": "Optional subtitle shown under the title",
  "theme": "light",
  "sections": []
}
```

- `title` (string, required) — Main dashboard heading
- `subtitle` (string, optional) — Shown below the title in muted text
- `theme` (`"light"` | `"dark"`, default `"light"`) — Color theme
- `sections` (array) — Ordered list of sections rendered top-to-bottom, left-to-right

## Section Types

Every section has a `type` field and an optional `width` (`"full"`, `"half"`, `"third"`).

### 1. Chart Section

```json
{
  "type": "chart",
  "chartType": "bar",
  "title": "Revenue by Stage",
  "subtitle": "Current fiscal year",
  "width": "half",
  "palette": "default",
  "data": {
    "labels": ["Prospecting", "Qualification", "Closed Won"],
    "datasets": [
      {
        "label": "Amount ($)",
        "data": [150000, 280000, 420000]
      }
    ]
  },
  "options": {}
}
```

**Fields:**
- `chartType` — One of: `bar`, `line`, `pie`, `doughnut`, `polarArea`, `radar`, `scatter`
- `title` / `subtitle` — Displayed above the chart
- `width` — `"full"` (default), `"half"`, or `"third"`
- `palette` — `"default"`, `"vibrant"`, or `"pastel"`. Colors auto-assigned if not in datasets.
- `data.labels` — X-axis labels (or slice labels for pie/doughnut)
- `data.datasets` — Array of dataset objects (see below)
- `options` — Raw Chart.js options object (merged into defaults)

**Dataset fields:**
- `label` (string) — Legend label for this dataset
- `data` (number[]) — The values
- `backgroundColor` (string | string[]) — Auto-assigned from palette if omitted
- `borderColor` (string | string[]) — Auto-assigned from palette if omitted
- `borderWidth` (number) — Default 2
- `tension` (number) — Line chart smoothing (0 = straight, 0.4 = smooth). Default 0.3 for line charts.
- `fill` (boolean) — Fill area under line. Default true for line charts.
- `pointRadius` (number) — Point size for line charts. Default 4.

### 2. Table Section

```json
{
  "type": "table",
  "title": "Top 10 Accounts",
  "subtitle": "By annual revenue",
  "width": "full",
  "headers": ["Account Name", "Industry", "Annual Revenue", "Employees"],
  "rows": [
    ["Acme Corp", "Technology", "$5,200,000", "1,200"],
    ["GlobalTech", "Finance", "$3,800,000", "890"]
  ],
  "alignments": ["left", "left", "right", "right"],
  "highlightRules": [
    { "column": 2, "condition": "above", "value": 4000000 }
  ],
  "footer": "Showing top 10 of 245 accounts"
}
```

**Fields:**
- `headers` (string[]) — Column headers
- `rows` (string[][]) — Array of row arrays. All values should be pre-formatted strings.
- `alignments` (string[]) — Per-column alignment: `"left"`, `"center"`, `"right"`
- `highlightRules` (array) — Conditional formatting rules:
  - `column` (number) — 0-based column index
  - `condition` — `"positive"` (>0), `"negative"` (<0), `"above"` (>value), `"below"` (<value)
  - `value` (number) — Threshold for `"above"` / `"below"`
- `footer` (string) — Footnote below the table

### 3. KPI Card Section

```json
{
  "type": "kpi",
  "title": "Total Revenue",
  "value": "$1.2M",
  "change": "+15% vs last quarter",
  "trend": "up",
  "width": "third"
}
```

**Fields:**
- `title` — Label above the value
- `value` — The main metric (pre-formatted string)
- `change` — Change description (e.g., "+12%", "vs last month")
- `trend` — `"up"` (green), `"down"` (red), `"neutral"` (gray)
- `width` — Usually `"third"` so 3 KPIs fit in a row

### 4. Metric Row Section

A horizontal row of metrics inside a single card. Use when you have 3-6 related metrics that belong together.

```json
{
  "type": "metric-row",
  "title": "Pipeline Summary",
  "metrics": [
    { "label": "Open Deals", "value": "142", "change": "+8", "trend": "up" },
    { "label": "Avg Deal Size", "value": "$45K", "change": "-3%", "trend": "down" },
    { "label": "Win Rate", "value": "32%", "change": "+2%", "trend": "up" },
    { "label": "Avg Days to Close", "value": "47", "change": "-5", "trend": "up" }
  ]
}
```

## Chart Type Selection Guide

| Data Shape | Best Chart Type | When to Use |
|---|---|---|
| Categories vs values | `bar` | Comparing discrete groups (stages, industries, owners) |
| Trend over time | `line` | Time-series data (monthly revenue, daily counts) |
| Parts of a whole | `pie` or `doughnut` | Distribution (max 6-8 slices, use "Other" for rest) |
| Magnitude comparison | `polarArea` | Like pie but area represents value, not angle |
| Multi-dimensional comparison | `radar` | Comparing multiple metrics across categories |
| Correlation between two values | `scatter` | X-Y relationship analysis |
| Ranked comparison | horizontal `bar` | Leaderboards, rankings (set `options.indexAxis: "y"`) |

### Horizontal Bar Chart

Set `options.indexAxis` to `"y"`:

```json
{
  "type": "chart",
  "chartType": "bar",
  "title": "Top Reps by Revenue",
  "data": { "labels": ["Alice", "Bob", "Carol"], "datasets": [{ "label": "Revenue", "data": [500000, 420000, 380000] }] },
  "options": { "indexAxis": "y" }
}
```

### Stacked Bar Chart

```json
{
  "options": {
    "scales": {
      "x": { "stacked": true },
      "y": { "stacked": true }
    }
  }
}
```

### Multi-Dataset Line Chart

```json
{
  "type": "chart",
  "chartType": "line",
  "data": {
    "labels": ["Jan", "Feb", "Mar", "Apr"],
    "datasets": [
      { "label": "This Year", "data": [100, 200, 150, 300] },
      { "label": "Last Year", "data": [80, 160, 130, 250] }
    ]
  }
}
```

## Layout Patterns

### KPI Row + Charts + Table

```json
{
  "sections": [
    { "type": "kpi", "width": "third", "title": "Total Revenue", "value": "$4.2M", "trend": "up", "change": "+15%" },
    { "type": "kpi", "width": "third", "title": "Open Deals", "value": "142", "trend": "neutral", "change": "" },
    { "type": "kpi", "width": "third", "title": "Win Rate", "value": "34%", "trend": "down", "change": "-2%" },
    { "type": "chart", "chartType": "bar", "width": "half", "title": "Revenue by Stage", "data": {} },
    { "type": "chart", "chartType": "pie", "width": "half", "title": "Deals by Source", "data": {} },
    { "type": "table", "width": "full", "title": "Top Opportunities", "headers": [], "rows": [] }
  ]
}
```

### Side-by-Side Charts

Use `"width": "half"` on two consecutive chart sections.

### Three KPIs in a Row

Use `"width": "third"` on three consecutive KPI sections.

## Data Formatting Tips

- Format currency values before putting them in tables: `"$1,234,567"`
- Format percentages: `"34.5%"`
- Format large numbers: `"1.2M"`, `"45K"`
- For chart data, use raw numbers (Chart.js handles axis formatting)
- For table data, use pre-formatted strings (displayed as-is)
- Dates should be formatted as readable strings: `"Jan 2025"`, `"2025-01-15"`

## Salesforce Data Mapping

When mapping Salesforce query results to chart config:

### Aggregate Query → Bar/Pie Chart

Query: `SELECT StageName, SUM(Amount) FROM Opportunity GROUP BY StageName`

Map to:
- `labels` = each unique StageName value
- `datasets[0].data` = corresponding SUM(Amount) values

### Aggregate Query → Line Chart (Time Series)

Query: `SELECT CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate), SUM(Amount) FROM Opportunity GROUP BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate) ORDER BY ...`

Map to:
- `labels` = formatted month-year strings ("Jan 2025", "Feb 2025", ...)
- `datasets[0].data` = corresponding SUM(Amount) values

### Standard Query → Table

Query: `SELECT Name, Industry, AnnualRevenue FROM Account ORDER BY AnnualRevenue DESC LIMIT 10`

Map to:
- `headers` = ["Name", "Industry", "Annual Revenue"]
- `rows` = each record as a string array with formatted values
