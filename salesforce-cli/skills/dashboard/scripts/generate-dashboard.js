#!/usr/bin/env node
/**
 * generate-dashboard.js - Generate a static HTML dashboard from a JSON config
 *
 * Reads a JSON configuration file containing chart definitions, table data,
 * and KPI cards, then produces a self-contained HTML file using Chart.js (CDN)
 * for visualizations.
 *
 * Usage:
 *   node generate-dashboard.js <config.json> --output <file.html>
 *   node generate-dashboard.js --stdin --output <file.html>
 *   node generate-dashboard.js --help
 *
 * Options:
 *   --output, -f    Output HTML file path (required)
 *   --stdin         Read config JSON from stdin instead of a file
 *   --open          Open the HTML file in the default browser after generation
 *   --help, -h      Show this help message
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Parse arguments ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let configPath = "";
let outputPath = "";
let openBrowser = false;
let useStdin = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--output":
    case "-f":
      outputPath = args[++i] || "";
      break;
    case "--stdin":
      useStdin = true;
      break;
    case "--open":
      openBrowser = true;
      break;
    case "--help":
    case "-h":
      console.log(
        [
          "Usage: node generate-dashboard.js <config.json> --output <file.html> [--open]",
          "       node generate-dashboard.js --stdin --output <file.html> [--open]",
          "",
          "Generate a static HTML dashboard from a JSON configuration.",
          "",
          "Options:",
          "  --output, -f <path>   Output HTML file path (required)",
          "  --stdin               Read config JSON from stdin (pipe or heredoc)",
          "  --open                Open in default browser after generation",
          "  --help, -h            Show this help message",
          "",
          "The config JSON should contain:",
          '  title        - Dashboard title (string)',
          '  subtitle     - Optional subtitle (string)',
          '  theme        - "light" or "dark" (default: "light")',
          '  sections     - Array of section objects (chart, table, kpi, or metric-row)',
          "",
          "See references/chart-patterns.md for full configuration details.",
        ].join("\n")
      );
      process.exit(0);
      break;
    default:
      if (args[i].startsWith("-")) {
        die(`Unknown option: ${args[i]}`);
      }
      if (!configPath) {
        configPath = args[i];
      } else {
        die(`Unexpected argument: ${args[i]}`);
      }
  }
}

if (!configPath && !useStdin) {
  die("Config JSON file or --stdin is required. Usage: node generate-dashboard.js <config.json> --output <file.html>");
}
if (!outputPath) {
  die("Output file is required. Use --output <file.html>");
}

// ── Read and parse config ───────────────────────────────────────────────────

let config;
try {
  let raw;
  if (useStdin) {
    raw = fs.readFileSync(0, "utf8"); // fd 0 = stdin
  } else {
    raw = fs.readFileSync(configPath, "utf8");
  }
  config = JSON.parse(raw);
} catch (err) {
  die(`Failed to read config: ${err.message}`);
}

const title = config.title || "Dashboard";
const subtitle = config.subtitle || "";
const theme = config.theme || "light";
const sections = config.sections || [];
const generatedAt = new Date().toLocaleString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

// ── Color palettes ──────────────────────────────────────────────────────────

const PALETTES = {
  default: [
    "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
    "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
  ],
  vibrant: [
    "#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea",
    "#0891b2", "#e11d48", "#65a30d", "#c026d3", "#ea580c",
  ],
  pastel: [
    "#93c5fd", "#fca5a5", "#86efac", "#fde047", "#c4b5fd",
    "#67e8f9", "#fda4af", "#bef264", "#e879f9", "#fdba74",
  ],
};

function getColors(count, paletteName) {
  const palette = PALETTES[paletteName] || PALETTES.default;
  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(palette[i % palette.length]);
  }
  return colors;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Build HTML sections ─────────────────────────────────────────────────────

let chartScripts = [];
let chartIndex = 0;

function buildSection(section) {
  switch (section.type) {
    case "chart":
      return buildChart(section);
    case "table":
      return buildTable(section);
    case "kpi":
      return buildKpi(section);
    case "metric-row":
      return buildMetricRow(section);
    default:
      return `<!-- Unknown section type: ${escapeHtml(section.type || "undefined")} -->`;
  }
}

function buildChart(section) {
  const id = `chart_${chartIndex++}`;
  const width = section.width || "full";
  const widthClass = width === "half" ? "col-half" : width === "third" ? "col-third" : "col-full";
  const chartTitle = section.title || "";
  const chartSubtitle = section.subtitle || "";
  const chartType = section.chartType || "bar";
  const data = section.data || { labels: [], datasets: [] };
  const userOptions = section.options || {};
  const palette = section.palette || "default";

  // Auto-assign colors if not provided
  const datasets = (data.datasets || []).map((ds, dsIdx) => {
    const copy = { ...ds };
    const isPie = ["pie", "doughnut", "polarArea"].includes(chartType);

    if (isPie) {
      if (!copy.backgroundColor) {
        copy.backgroundColor = getColors(data.labels.length, palette);
      }
      if (!copy.borderColor) {
        copy.borderColor = theme === "dark" ? "#1e293b" : "#ffffff";
      }
      copy.borderWidth = copy.borderWidth ?? 2;
    } else {
      if (!copy.backgroundColor) {
        const color = getColors(dsIdx + 1, palette)[dsIdx];
        copy.backgroundColor = chartType === "line" ? hexToRgba(color, 0.1) : hexToRgba(color, 0.7);
      }
      if (!copy.borderColor) {
        copy.borderColor = getColors(dsIdx + 1, palette)[dsIdx];
      }
      copy.borderWidth = copy.borderWidth ?? 2;
      if (chartType === "line") {
        copy.tension = copy.tension ?? 0.3;
        copy.pointRadius = copy.pointRadius ?? 4;
        copy.pointHoverRadius = copy.pointHoverRadius ?? 6;
        copy.fill = copy.fill ?? true;
      }
    }
    return copy;
  });

  const chartData = { labels: data.labels, datasets };

  // Build Chart.js options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: { display: false },
      legend: {
        display: datasets.length > 1 || ["pie", "doughnut", "polarArea"].includes(chartType),
        position: "bottom",
        labels: {
          color: theme === "dark" ? "#cbd5e1" : "#475569",
          padding: 16,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: theme === "dark" ? "#334155" : "#1e293b",
        titleColor: "#f1f5f9",
        bodyColor: "#e2e8f0",
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
      },
    },
    ...userOptions,
  };

  // Add scales for non-pie charts
  if (!["pie", "doughnut", "polarArea", "radar"].includes(chartType)) {
    options.scales = options.scales || {
      x: {
        grid: { color: theme === "dark" ? "#334155" : "#e2e8f0" },
        ticks: { color: theme === "dark" ? "#94a3b8" : "#64748b" },
      },
      y: {
        grid: { color: theme === "dark" ? "#334155" : "#e2e8f0" },
        ticks: { color: theme === "dark" ? "#94a3b8" : "#64748b" },
        beginAtZero: true,
      },
    };
  }

  chartScripts.push(`
    new Chart(document.getElementById('${id}'), {
      type: '${chartType}',
      data: ${JSON.stringify(chartData)},
      options: ${JSON.stringify(options)}
    });
  `);

  return `
    <div class="section ${widthClass}">
      <div class="card chart-card">
        ${chartTitle ? `<h3 class="section-title">${escapeHtml(chartTitle)}</h3>` : ""}
        ${chartSubtitle ? `<p class="section-subtitle">${escapeHtml(chartSubtitle)}</p>` : ""}
        <div class="chart-container">
          <canvas id="${id}"></canvas>
        </div>
      </div>
    </div>
  `;
}

function buildTable(section) {
  const width = section.width || "full";
  const widthClass = width === "half" ? "col-half" : width === "third" ? "col-third" : "col-full";
  const tableTitle = section.title || "";
  const tableSubtitle = section.subtitle || "";
  const headers = section.headers || [];
  const rows = section.rows || [];
  const footer = section.footer || "";
  const alignments = section.alignments || [];
  const highlightRules = section.highlightRules || [];

  const headerHtml = headers
    .map((h, i) => {
      const align = alignments[i] || "left";
      return `<th style="text-align:${align}">${escapeHtml(String(h))}</th>`;
    })
    .join("");

  const rowsHtml = rows
    .map((row) => {
      const cells = row
        .map((cell, i) => {
          const align = alignments[i] || "left";
          let cls = "";
          for (const rule of highlightRules) {
            if (rule.column === i) {
              const val = parseFloat(cell);
              if (rule.condition === "positive" && val > 0) cls = "highlight-positive";
              if (rule.condition === "negative" && val < 0) cls = "highlight-negative";
              if (rule.condition === "above" && val > rule.value) cls = "highlight-positive";
              if (rule.condition === "below" && val < rule.value) cls = "highlight-negative";
            }
          }
          return `<td style="text-align:${align}" class="${cls}">${escapeHtml(String(cell))}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="section ${widthClass}">
      <div class="card">
        ${tableTitle ? `<h3 class="section-title">${escapeHtml(tableTitle)}</h3>` : ""}
        ${tableSubtitle ? `<p class="section-subtitle">${escapeHtml(tableSubtitle)}</p>` : ""}
        <div class="table-container">
          <table>
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        ${footer ? `<p class="table-footer">${escapeHtml(footer)}</p>` : ""}
      </div>
    </div>
  `;
}

function buildKpi(section) {
  const kpiTitle = section.title || "";
  const value = section.value || "0";
  const change = section.change || "";
  const trend = section.trend || "neutral";
  const icon = section.icon || "";
  const width = section.width || "third";
  const widthClass = width === "half" ? "col-half" : width === "third" ? "col-third" : "col-full";

  const trendClass = trend === "up" ? "trend-up" : trend === "down" ? "trend-down" : "trend-neutral";
  const trendArrow = trend === "up" ? "&#9650;" : trend === "down" ? "&#9660;" : "&#9654;";

  return `
    <div class="section ${widthClass}">
      <div class="card kpi-card">
        <div class="kpi-header">
          ${icon ? `<span class="kpi-icon">${escapeHtml(icon)}</span>` : ""}
          <span class="kpi-label">${escapeHtml(kpiTitle)}</span>
        </div>
        <div class="kpi-value">${escapeHtml(String(value))}</div>
        ${change ? `<div class="kpi-change ${trendClass}">${trendArrow} ${escapeHtml(String(change))}</div>` : ""}
      </div>
    </div>
  `;
}

function buildMetricRow(section) {
  const metrics = section.metrics || [];
  const metricsHtml = metrics
    .map((m) => {
      const trend = m.trend || "neutral";
      const trendClass = trend === "up" ? "trend-up" : trend === "down" ? "trend-down" : "trend-neutral";
      const trendArrow = trend === "up" ? "&#9650;" : trend === "down" ? "&#9660;" : "&#9654;";
      return `
        <div class="metric-item">
          <div class="kpi-label">${escapeHtml(m.label || "")}</div>
          <div class="kpi-value">${escapeHtml(String(m.value || "0"))}</div>
          ${m.change ? `<div class="kpi-change ${trendClass}">${trendArrow} ${escapeHtml(String(m.change))}</div>` : ""}
        </div>
      `;
    })
    .join("");

  return `
    <div class="section col-full">
      <div class="card metric-row-card">
        ${section.title ? `<h3 class="section-title">${escapeHtml(section.title)}</h3>` : ""}
        <div class="metric-row">${metricsHtml}</div>
      </div>
    </div>
  `;
}

// ── Build sections HTML ─────────────────────────────────────────────────────

const sectionsHtml = sections.map(buildSection).join("\n");

// ── Theme styles ────────────────────────────────────────────────────────────

const isDark = theme === "dark";
const themeVars = isDark
  ? {
      bg: "#0f172a",
      cardBg: "#1e293b",
      cardBorder: "#334155",
      text: "#e2e8f0",
      textMuted: "#94a3b8",
      textHeading: "#f1f5f9",
      tableBg: "#1e293b",
      tableStripeBg: "#253449",
      tableHeaderBg: "#334155",
      tableBorder: "#475569",
      shadow: "0 1px 3px rgba(0,0,0,0.4)",
      kpiBg: "#1e293b",
    }
  : {
      bg: "#f1f5f9",
      cardBg: "#ffffff",
      cardBorder: "#e2e8f0",
      text: "#334155",
      textMuted: "#64748b",
      textHeading: "#0f172a",
      tableBg: "#ffffff",
      tableStripeBg: "#f8fafc",
      tableHeaderBg: "#f1f5f9",
      tableBorder: "#e2e8f0",
      shadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
      kpiBg: "#ffffff",
    };

// ── Generate HTML ───────────────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: ${themeVars.bg};
      color: ${themeVars.text};
      line-height: 1.6;
      min-height: 100vh;
    }

    .dashboard {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }

    .dashboard-header {
      text-align: center;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 2px solid ${themeVars.cardBorder};
    }

    .dashboard-header h1 {
      font-size: 28px;
      font-weight: 700;
      color: ${themeVars.textHeading};
      margin-bottom: 4px;
    }

    .dashboard-header .subtitle {
      font-size: 16px;
      color: ${themeVars.textMuted};
    }

    .dashboard-header .generated-at {
      font-size: 12px;
      color: ${themeVars.textMuted};
      margin-top: 8px;
    }

    .sections {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
    }

    .section { min-width: 0; }
    .col-full { width: 100%; }
    .col-half { width: calc(50% - 10px); }
    .col-third { width: calc(33.333% - 14px); }

    @media (max-width: 1024px) {
      .col-third { width: calc(50% - 10px); }
    }
    @media (max-width: 640px) {
      .col-half, .col-third { width: 100%; }
    }

    .card {
      background: ${themeVars.cardBg};
      border: 1px solid ${themeVars.cardBorder};
      border-radius: 12px;
      padding: 24px;
      box-shadow: ${themeVars.shadow};
      height: 100%;
    }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: ${themeVars.textHeading};
      margin-bottom: 4px;
    }

    .section-subtitle {
      font-size: 13px;
      color: ${themeVars.textMuted};
      margin-bottom: 16px;
    }

    .chart-container {
      position: relative;
      height: 320px;
      margin-top: 12px;
    }

    /* Tables */
    .table-container { overflow-x: auto; margin-top: 12px; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    thead th {
      background: ${themeVars.tableHeaderBg};
      color: ${themeVars.textHeading};
      font-weight: 600;
      padding: 10px 14px;
      border-bottom: 2px solid ${themeVars.tableBorder};
      white-space: nowrap;
    }

    tbody td {
      padding: 9px 14px;
      border-bottom: 1px solid ${themeVars.tableBorder};
      color: ${themeVars.text};
    }

    tbody tr:nth-child(even) { background: ${themeVars.tableStripeBg}; }
    tbody tr:hover { background: ${isDark ? "#2d3d53" : "#e8f0fe"}; }

    .table-footer {
      font-size: 12px;
      color: ${themeVars.textMuted};
      margin-top: 8px;
      text-align: right;
    }

    .highlight-positive { color: #16a34a; font-weight: 600; }
    .highlight-negative { color: #dc2626; font-weight: 600; }

    /* KPI Cards */
    .kpi-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px 16px;
    }

    .kpi-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .kpi-icon { font-size: 20px; }

    .kpi-label {
      font-size: 13px;
      font-weight: 500;
      color: ${themeVars.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .kpi-value {
      font-size: 32px;
      font-weight: 700;
      color: ${themeVars.textHeading};
      line-height: 1.2;
    }

    .kpi-change {
      font-size: 14px;
      font-weight: 600;
      margin-top: 6px;
    }

    .trend-up { color: #16a34a; }
    .trend-down { color: #dc2626; }
    .trend-neutral { color: ${themeVars.textMuted}; }

    /* Metric Row */
    .metric-row {
      display: flex;
      justify-content: space-around;
      flex-wrap: wrap;
      gap: 24px;
      margin-top: 12px;
    }

    .metric-item {
      text-align: center;
      flex: 1;
      min-width: 120px;
    }

    .metric-item .kpi-value { font-size: 24px; }

    /* Footer */
    .dashboard-footer {
      text-align: center;
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid ${themeVars.cardBorder};
      font-size: 12px;
      color: ${themeVars.textMuted};
    }

    /* Print styles */
    @media print {
      body { background: white; color: #333; }
      .card { box-shadow: none; border: 1px solid #ddd; break-inside: avoid; }
      .dashboard { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <div class="dashboard-header">
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ""}
      <p class="generated-at">Generated: ${escapeHtml(generatedAt)}</p>
    </div>
    <div class="sections">
      ${sectionsHtml}
    </div>
    <div class="dashboard-footer">
      Generated: ${escapeHtml(generatedAt)}
    </div>
  </div>
  <script>
    ${chartScripts.join("\n")}
  </script>
</body>
</html>`;

// ── Write output ────────────────────────────────────────────────────────────

const absOutput = path.resolve(outputPath);
try {
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });
  fs.writeFileSync(absOutput, html, "utf8");
} catch (err) {
  die(`Failed to write output file: ${err.message}`);
}

const fileSize = fs.statSync(absOutput).size;
const fileSizeKb = (fileSize / 1024).toFixed(1);

console.log(`Dashboard generated successfully!`);
console.log(`  File: ${absOutput}`);
console.log(`  Size: ${fileSizeKb} KB`);
console.log(`  Sections: ${sections.length}`);
console.log(`  Charts: ${chartIndex}`);
console.log(`  Theme: ${theme}`);
console.log(`  Generated: ${generatedAt}`);

// ── Open in browser ─────────────────────────────────────────────────────────

if (openBrowser) {
  try {
    const isWin = process.platform === "win32";
    const isMac = process.platform === "darwin";
    const cmd = isWin
      ? `start "" "${absOutput}"`
      : isMac
        ? `open "${absOutput}"`
        : `xdg-open "${absOutput}"`;
    execSync(cmd, { stdio: "ignore" });
    console.log(`  Opened in browser.`);
  } catch {
    console.log(`  Could not auto-open. Please open the file manually.`);
  }
}

// ── Utilities ───────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
