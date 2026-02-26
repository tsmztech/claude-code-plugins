#!/usr/bin/env node
/**
 * generate-dashboard.js - Generate a static HTML dashboard from a JSON config
 *
 * Reads a JSON configuration file containing chart definitions, table data,
 * and KPI cards, then produces a self-contained HTML file using Chart.js (CDN)
 * for visualizations. Supports multiple visual styles and light/dark themes
 * with runtime toggle.
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
 *
 * The config JSON should contain:
 *   title        - Dashboard title (string)
 *   subtitle     - Optional subtitle (string)
 *   style        - Visual style: "corporate", "executive", "minimal", "vibrant", "compact"
 *   theme        - "light", "dark", or "both" (default: "both")
 *   sections     - Array of section objects (chart, table, kpi, or metric-row)
 *
 * See references/chart-patterns.md for full configuration details.
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
          '  style        - "corporate", "executive", "minimal", "vibrant", or "compact"',
          '  theme        - "light", "dark", or "both" (default: "both")',
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

// ── Style definitions ───────────────────────────────────────────────────────

const STYLES = {
  corporate: {
    themes: ["light", "dark"],
    defaultPalette: "default",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontCDN: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    layout: {
      borderRadius: "12px",
      cardPadding: "24px",
      gap: "20px",
      fontBase: "14px",
      fontHeading: "28px",
      fontKpi: "32px",
      fontSection: "16px",
      chartHeight: "320px",
    },
    chartDefaults: {
      bar: { borderRadius: 6, barPercentage: 0.8, categoryPercentage: 0.75 },
      line: { tension: 0.3, borderWidth: 2, pointRadius: 4, fill: true, fillAlpha: 0.1 },
      doughnut: { cutout: "65%", spacing: 2 },
      grid: { x: { display: false }, y: { borderDash: [4, 4] } },
      ticks: { font: { size: 12 }, padding: 8, maxTicksLimit: 7, maxRotation: 0 },
      legend: { padding: 16, font: { size: 12 } },
      tooltip: { backgroundColor: "rgba(15,23,42,0.95)", padding: 12, cornerRadius: 8 },
      animation: { duration: 750, easing: "easeOutQuart" },
    },
    light: {
      bg: "#f1f5f9",
      cardBg: "#ffffff",
      cardBorder: "#e2e8f0",
      text: "#334155",
      textMuted: "#64748b",
      textHeading: "#0f172a",
      tableHeaderBg: "#f1f5f9",
      tableStripeBg: "#f8fafc",
      tableBorder: "#e2e8f0",
      hoverBg: "#e8f0fe",
      shadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
      accent: "#4e79a7",
      chartGrid: "#e2e8f0",
      chartTick: "#64748b",
      chartLegend: "#475569",
      pieBorder: "#ffffff",
      trendUp: "#15803d",
      trendDown: "#b91c1c",
    },
    dark: {
      bg: "#0f172a",
      cardBg: "#1e293b",
      cardBorder: "#334155",
      text: "#e2e8f0",
      textMuted: "#94a3b8",
      textHeading: "#f1f5f9",
      tableHeaderBg: "#334155",
      tableStripeBg: "#253449",
      tableBorder: "#475569",
      hoverBg: "#2d3d53",
      shadow: "0 1px 3px rgba(0,0,0,0.4)",
      accent: "#60a5fa",
      chartGrid: "#334155",
      chartTick: "#94a3b8",
      chartLegend: "#cbd5e1",
      pieBorder: "#1e293b",
      trendUp: "#4ade80",
      trendDown: "#f87171",
    },
  },
  executive: {
    themes: ["dark"],
    defaultPalette: "accessible-bright",
    fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif",
    fontCDN: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
    layout: {
      borderRadius: "8px",
      cardPadding: "28px",
      gap: "20px",
      fontBase: "14px",
      fontHeading: "32px",
      fontKpi: "36px",
      fontSection: "17px",
      chartHeight: "340px",
    },
    chartDefaults: {
      bar: { borderRadius: 4, barPercentage: 0.75, categoryPercentage: 0.7 },
      line: { tension: 0.3, borderWidth: 3, pointRadius: 5, fill: true, fillAlpha: 0.15 },
      doughnut: { cutout: "70%", spacing: 2 },
      grid: { x: { display: false }, y: {} },
      ticks: { font: { size: 13, weight: "500" }, padding: 10, maxTicksLimit: 6, maxRotation: 0 },
      legend: { padding: 20, font: { size: 13 } },
      tooltip: { backgroundColor: "rgba(250,250,250,0.95)", titleColor: "#18181b", bodyColor: "#27272a", padding: 14, cornerRadius: 6 },
      animation: { duration: 900, easing: "easeOutQuart" },
    },
    dark: {
      bg: "#09090b",
      cardBg: "#18181b",
      cardBorder: "#27272a",
      text: "#d4d4d8",
      textMuted: "#71717a",
      textHeading: "#fafafa",
      tableHeaderBg: "#27272a",
      tableStripeBg: "#1c1c1f",
      tableBorder: "#3f3f46",
      hoverBg: "#2c2c30",
      shadow: "0 1px 3px rgba(0,0,0,0.5)",
      accent: "#d97706",
      chartGrid: "#27272a",
      chartTick: "#71717a",
      chartLegend: "#a1a1aa",
      pieBorder: "#18181b",
      trendUp: "#4ade80",
      trendDown: "#f87171",
    },
  },
  minimal: {
    themes: ["light", "dark"],
    defaultPalette: "pastel",
    fontFamily: "'Geist', 'Inter', system-ui, -apple-system, sans-serif",
    fontCDN: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap",
    layout: {
      borderRadius: "4px",
      cardPadding: "24px",
      gap: "16px",
      fontBase: "14px",
      fontHeading: "26px",
      fontKpi: "30px",
      fontSection: "15px",
      chartHeight: "300px",
    },
    chartDefaults: {
      bar: { borderRadius: 2, barPercentage: 0.7, categoryPercentage: 0.8 },
      line: { tension: 0.35, borderWidth: 2, pointRadius: 0, fill: false },
      doughnut: { cutout: "60%", spacing: 0 },
      grid: { x: { display: false }, y: { display: false } },
      ticks: { font: { size: 11 }, padding: 6, maxTicksLimit: 5, maxRotation: 0 },
      legend: { padding: 12, font: { size: 11 } },
      tooltip: { backgroundColor: "rgba(23,23,23,0.9)", padding: 10, cornerRadius: 4 },
      animation: { duration: 500, easing: "easeOutCubic" },
    },
    light: {
      bg: "#ffffff",
      cardBg: "#ffffff",
      cardBorder: "#e5e5e5",
      text: "#404040",
      textMuted: "#737373",
      textHeading: "#171717",
      tableHeaderBg: "#fafafa",
      tableStripeBg: "#fafafa",
      tableBorder: "#e5e5e5",
      hoverBg: "#f5f5f5",
      shadow: "none",
      accent: "#404040",
      chartGrid: "#e5e5e5",
      chartTick: "#737373",
      chartLegend: "#525252",
      pieBorder: "#ffffff",
      trendUp: "#15803d",
      trendDown: "#b91c1c",
    },
    dark: {
      bg: "#171717",
      cardBg: "#1c1c1c",
      cardBorder: "#2e2e2e",
      text: "#d4d4d4",
      textMuted: "#737373",
      textHeading: "#fafafa",
      tableHeaderBg: "#262626",
      tableStripeBg: "#1f1f1f",
      tableBorder: "#404040",
      hoverBg: "#2a2a2a",
      shadow: "none",
      accent: "#d4d4d4",
      chartGrid: "#2e2e2e",
      chartTick: "#737373",
      chartLegend: "#a3a3a3",
      pieBorder: "#1c1c1c",
      trendUp: "#4ade80",
      trendDown: "#f87171",
    },
  },
  vibrant: {
    themes: ["light", "dark"],
    defaultPalette: "vibrant",
    fontFamily: "'DM Sans', 'Plus Jakarta Sans', -apple-system, sans-serif",
    fontCDN: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap",
    layout: {
      borderRadius: "16px",
      cardPadding: "24px",
      gap: "20px",
      fontBase: "14px",
      fontHeading: "28px",
      fontKpi: "32px",
      fontSection: "16px",
      chartHeight: "320px",
    },
    chartDefaults: {
      bar: { borderRadius: 8, borderSkipped: false, barPercentage: 0.75, categoryPercentage: 0.7 },
      line: { tension: 0.4, borderWidth: 2.5, pointRadius: 4, fill: true, fillAlpha: 0.12 },
      doughnut: { cutout: "60%", spacing: 3 },
      grid: { x: { display: false }, y: {} },
      ticks: { font: { size: 12, weight: "500" }, padding: 8, maxTicksLimit: 7, maxRotation: 0 },
      legend: { padding: 16, font: { size: 12 } },
      tooltip: { backgroundColor: "rgba(30,27,75,0.95)", padding: 14, cornerRadius: 10 },
      animation: { duration: 1000, easing: "easeOutQuart" },
    },
    light: {
      bg: "#f8fafc",
      cardBg: "#ffffff",
      cardBorder: "#e0e7ff",
      text: "#334155",
      textMuted: "#4f46e5",
      textHeading: "#1e1b4b",
      tableHeaderBg: "#eef2ff",
      tableStripeBg: "#f5f3ff",
      tableBorder: "#e0e7ff",
      hoverBg: "#eef2ff",
      shadow: "0 1px 3px rgba(99,102,241,0.1), 0 1px 2px rgba(99,102,241,0.06)",
      accent: "#6366f1",
      chartGrid: "#e0e7ff",
      chartTick: "#6366f1",
      chartLegend: "#4f46e5",
      pieBorder: "#ffffff",
      trendUp: "#15803d",
      trendDown: "#b91c1c",
    },
    dark: {
      bg: "#0f0b2e",
      cardBg: "#1a1545",
      cardBorder: "#312e81",
      text: "#c7d2fe",
      textMuted: "#818cf8",
      textHeading: "#e0e7ff",
      tableHeaderBg: "#252060",
      tableStripeBg: "#1e1850",
      tableBorder: "#3730a3",
      hoverBg: "#2d2670",
      shadow: "0 1px 3px rgba(99,102,241,0.3)",
      accent: "#818cf8",
      chartGrid: "#312e81",
      chartTick: "#818cf8",
      chartLegend: "#a5b4fc",
      pieBorder: "#1a1545",
      trendUp: "#4ade80",
      trendDown: "#f87171",
    },
  },
  compact: {
    themes: ["light", "dark"],
    defaultPalette: "accessible",
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontCDN: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    layout: {
      borderRadius: "8px",
      cardPadding: "16px",
      gap: "12px",
      fontBase: "13px",
      fontHeading: "22px",
      fontKpi: "26px",
      fontSection: "14px",
      chartHeight: "260px",
    },
    chartDefaults: {
      bar: { borderRadius: 3, barPercentage: 0.85, categoryPercentage: 0.85 },
      line: { tension: 0.25, borderWidth: 1.5, pointRadius: 2, fill: true, fillAlpha: 0.06 },
      doughnut: { cutout: "55%", spacing: 1 },
      grid: { x: { display: false }, y: { borderDash: [3, 3] } },
      ticks: { font: { size: 10 }, padding: 4, maxTicksLimit: 5, maxRotation: 45 },
      legend: { padding: 10, font: { size: 10 }, boxWidth: 8 },
      tooltip: { backgroundColor: "rgba(17,24,39,0.95)", padding: 8, cornerRadius: 4 },
      animation: { duration: 400, easing: "easeOutCubic" },
    },
    light: {
      bg: "#f9fafb",
      cardBg: "#ffffff",
      cardBorder: "#e5e7eb",
      text: "#374151",
      textMuted: "#6b7280",
      textHeading: "#111827",
      tableHeaderBg: "#f3f4f6",
      tableStripeBg: "#f9fafb",
      tableBorder: "#e5e7eb",
      hoverBg: "#eff6ff",
      shadow: "0 1px 2px rgba(0,0,0,0.05)",
      accent: "#3b82f6",
      chartGrid: "#e5e7eb",
      chartTick: "#6b7280",
      chartLegend: "#4b5563",
      pieBorder: "#ffffff",
      trendUp: "#15803d",
      trendDown: "#b91c1c",
    },
    dark: {
      bg: "#111827",
      cardBg: "#1f2937",
      cardBorder: "#374151",
      text: "#e5e7eb",
      textMuted: "#9ca3af",
      textHeading: "#f9fafb",
      tableHeaderBg: "#374151",
      tableStripeBg: "#1f2937",
      tableBorder: "#4b5563",
      hoverBg: "#2d3a4d",
      shadow: "0 1px 2px rgba(0,0,0,0.3)",
      accent: "#60a5fa",
      chartGrid: "#374151",
      chartTick: "#9ca3af",
      chartLegend: "#d1d5db",
      pieBorder: "#1f2937",
      trendUp: "#4ade80",
      trendDown: "#f87171",
    },
  },
};

// ── Conditional formatting colors (theme-aware) ─────────────────────────────

const CONDITIONAL_COLORS = {
  light: {
    highlightPositiveBg: "#dcfce7", highlightPositiveText: "#15803d",
    highlightNegativeBg: "#fee2e2", highlightNegativeText: "#b91c1c",
    highlightWarningBg: "#fef3c7", highlightWarningText: "#92400e",
    highlightInfoBg: "#dbeafe", highlightInfoText: "#1d4ed8",
  },
  dark: {
    highlightPositiveBg: "rgba(34,197,94,0.15)", highlightPositiveText: "#4ade80",
    highlightNegativeBg: "rgba(239,68,68,0.15)", highlightNegativeText: "#f87171",
    highlightWarningBg: "rgba(245,158,11,0.15)", highlightWarningText: "#fbbf24",
    highlightInfoBg: "rgba(59,130,246,0.15)", highlightInfoText: "#60a5fa",
  },
};

// ── Resolve style and theme ─────────────────────────────────────────────────

const styleName = STYLES[config.style] ? config.style : "corporate";
const styleConfig = STYLES[styleName];

// Determine effective theme mode
let themeMode = config.theme || "both";
// Executive only supports dark
if (styleConfig.themes.length === 1) {
  themeMode = styleConfig.themes[0];
} else if (themeMode !== "light" && themeMode !== "dark" && themeMode !== "both") {
  themeMode = "both";
}

const showToggle = themeMode === "both" && styleConfig.themes.length > 1;
const chartDefs = styleConfig.chartDefaults || {};

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
  accessible: [
    "#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2",
    "#D55E00", "#CC79A7", "#000000",
  ],
  "accessible-bright": [
    "#4477AA", "#66CCEE", "#228833", "#CCBB44", "#EE6677",
    "#AA3377", "#BBBBBB",
  ],
  "accessible-extended": [
    "#332288", "#88CCEE", "#44AA99", "#117733", "#999933",
    "#DDCC77", "#CC6677", "#882255", "#AA4499", "#DDDDDD",
  ],
  ibm: [
    "#648FFF", "#785EF0", "#DC267F", "#FE6100", "#FFB000",
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

let chartConfigs = [];
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
  const palette = section.palette || styleConfig.defaultPalette || "default";
  const typeDefs = chartDefs[chartType] || chartDefs[chartType === "pie" ? "doughnut" : chartType] || {};

  const datasets = (data.datasets || []).map((ds, dsIdx) => {
    const copy = { ...ds };
    const isPie = ["pie", "doughnut", "polarArea"].includes(chartType);

    if (isPie) {
      if (!copy.backgroundColor) {
        copy.backgroundColor = getColors(data.labels.length, palette);
      }
      // borderColor will be overridden at runtime from CSS variable
      copy.borderColor = "__THEME_PIE_BORDER__";
      copy.borderWidth = copy.borderWidth ?? 2;
    } else {
      const fillAlpha = typeDefs.fillAlpha ?? (chartType === "line" ? 0.1 : 0.7);
      if (!copy.backgroundColor) {
        const color = getColors(dsIdx + 1, palette)[dsIdx];
        copy.backgroundColor = hexToRgba(color, fillAlpha);
      }
      if (!copy.borderColor) {
        copy.borderColor = getColors(dsIdx + 1, palette)[dsIdx];
      }
      copy.borderWidth = copy.borderWidth ?? typeDefs.borderWidth ?? 2;
      if (chartType === "bar") {
        copy.borderRadius = copy.borderRadius ?? typeDefs.borderRadius ?? 0;
        if (typeDefs.barPercentage !== undefined) copy.barPercentage = copy.barPercentage ?? typeDefs.barPercentage;
        if (typeDefs.categoryPercentage !== undefined) copy.categoryPercentage = copy.categoryPercentage ?? typeDefs.categoryPercentage;
        if (typeDefs.borderSkipped !== undefined) copy.borderSkipped = copy.borderSkipped ?? typeDefs.borderSkipped;
      }
      if (chartType === "line") {
        copy.tension = copy.tension ?? typeDefs.tension ?? 0.3;
        copy.pointRadius = copy.pointRadius ?? typeDefs.pointRadius ?? 4;
        copy.pointHoverRadius = copy.pointHoverRadius ?? (copy.pointRadius + 2);
        copy.fill = copy.fill ?? typeDefs.fill ?? true;
      }
    }
    return copy;
  });

  const chartData = { labels: data.labels, datasets };
  const showLegend = datasets.length > 1 || ["pie", "doughnut", "polarArea"].includes(chartType);

  chartConfigs.push({ id, type: chartType, data: chartData, baseOptions: userOptions, showLegend, styleDefs: chartDefs });

  return `
    <div class="section ${widthClass}">
      <div class="card chart-card">
        ${chartTitle ? `<h3 class="section-title">${escapeHtml(chartTitle)}</h3>` : ""}
        ${chartSubtitle ? `<p class="section-subtitle">${escapeHtml(chartSubtitle)}</p>` : ""}
        <div class="chart-container"><canvas id="${id}" role="img" aria-label="${escapeHtml(chartTitle || "Chart")}"></canvas></div>
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
      return `<th scope="col" style="text-align:${align}">${escapeHtml(String(h))}</th>`;
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
              if (rule.condition === "warning") cls = "highlight-warning";
              if (rule.condition === "info") cls = "highlight-info";
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
      <div class="card kpi-card" role="region" aria-label="${escapeHtml(kpiTitle + ': ' + String(value))}">
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
      <div class="card metric-row-card" role="region" aria-label="${escapeHtml(section.title || "Metrics")}">
        ${section.title ? `<h3 class="section-title">${escapeHtml(section.title)}</h3>` : ""}
        <div class="metric-row">${metricsHtml}</div>
      </div>
    </div>
  `;
}

// ── Build sections HTML ─────────────────────────────────────────────────────

const sectionsHtml = sections.map(buildSection).join("\n");

// ── CSS Generation ──────────────────────────────────────────────────────────

function camelToKebab(s) {
  return s.replace(/([A-Z])/g, "-$1").toLowerCase();
}

function generateCSS(style, mode) {
  const layout = style.layout;

  // Layout variables (fixed, not theme-togglable)
  const layoutVars = Object.entries(layout)
    .map(([k, v]) => `--${camelToKebab(k)}: ${v};`)
    .join("\n      ");

  // Theme CSS variable block generator
  const themeVars = (obj) =>
    Object.entries(obj)
      .map(([k, v]) => `--${camelToKebab(k)}: ${v};`)
      .join("\n      ");

  let themeCss = "";
  if (mode === "both" && style.themes.length > 1) {
    themeCss = `
    :root, [data-theme="light"] {
      ${themeVars(style.light)}
      ${themeVars(CONDITIONAL_COLORS.light)}
    }
    [data-theme="dark"] {
      ${themeVars(style.dark)}
      ${themeVars(CONDITIONAL_COLORS.dark)}
    }`;
  } else if (mode === "dark" || (style.themes.length === 1 && style.themes[0] === "dark")) {
    themeCss = `
    :root {
      ${themeVars(style.dark)}
      ${themeVars(CONDITIONAL_COLORS.dark)}
    }`;
  } else {
    themeCss = `
    :root {
      ${themeVars(style.light || style.dark)}
      ${themeVars(CONDITIONAL_COLORS.light)}
    }`;
  }

  return `
    :root {
      ${layoutVars}
    }
    ${themeCss}

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: ${style.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"};
      background: var(--bg);
      color: var(--text);
      font-size: var(--font-base);
      line-height: 1.6;
      min-height: 100vh;
      transition: background 0.3s ease, color 0.3s ease;
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
      border-bottom: 2px solid var(--card-border);
      position: relative;
    }

    .dashboard-header h1 {
      font-size: var(--font-heading);
      font-weight: 700;
      color: var(--text-heading);
      margin-bottom: 4px;
    }

    .dashboard-header .subtitle {
      font-size: 16px;
      color: var(--text-muted);
    }

    .dashboard-header .generated-at {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 8px;
    }

    .sections {
      display: flex;
      flex-wrap: wrap;
      gap: var(--gap);
    }

    .section { min-width: 0; }
    .col-full { width: 100%; }
    .col-half { width: calc(50% - var(--gap) / 2); }
    .col-third { width: calc(33.333% - var(--gap) * 2 / 3); }

    @media (max-width: 1024px) {
      .col-third { width: calc(50% - var(--gap) / 2); }
    }
    @media (max-width: 640px) {
      .col-half, .col-third { width: 100%; }
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--border-radius);
      padding: var(--card-padding);
      box-shadow: var(--shadow);
      height: 100%;
      transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
    }

    .section-title {
      font-size: var(--font-section);
      font-weight: 600;
      color: var(--text-heading);
      margin-bottom: 4px;
    }

    .section-subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }

    .chart-container {
      position: relative;
      height: var(--chart-height);
      margin-top: 12px;
    }

    /* Tables */
    .table-container { overflow-x: auto; margin-top: 12px; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--font-base);
    }

    thead th {
      background: var(--table-header-bg);
      color: var(--text-heading);
      font-weight: 600;
      padding: 10px 14px;
      border-bottom: 2px solid var(--table-border);
      white-space: nowrap;
      position: sticky;
      top: 0;
      z-index: 1;
    }

    tbody td {
      padding: 9px 14px;
      border-bottom: 1px solid var(--table-border);
      color: var(--text);
      font-variant-numeric: tabular-nums lining-nums;
    }

    tbody tr:nth-child(even) { background: var(--table-stripe-bg); }
    tbody tr:hover { background: var(--hover-bg); }

    .table-footer {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 8px;
      text-align: right;
    }

    .highlight-positive { color: var(--highlight-positive-text); background-color: var(--highlight-positive-bg); font-weight: 600; }
    .highlight-negative { color: var(--highlight-negative-text); background-color: var(--highlight-negative-bg); font-weight: 600; }
    .highlight-warning { color: var(--highlight-warning-text); background-color: var(--highlight-warning-bg); font-weight: 600; }
    .highlight-info { color: var(--highlight-info-text); background-color: var(--highlight-info-bg); font-weight: 600; }

    /* KPI Cards */
    .kpi-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--card-padding) 16px;
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
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .kpi-value {
      font-size: var(--font-kpi);
      font-weight: 700;
      color: var(--text-heading);
      line-height: 1.2;
      font-variant-numeric: tabular-nums lining-nums;
    }

    .kpi-change {
      font-size: 14px;
      font-weight: 600;
      margin-top: 6px;
      font-variant-numeric: tabular-nums lining-nums;
    }

    .trend-up { color: var(--trend-up); }
    .trend-down { color: var(--trend-down); }
    .trend-neutral { color: var(--text-muted); }

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

    /* Theme Toggle */
    .theme-toggle {
      position: absolute;
      top: 0;
      right: 0;
      width: 40px;
      height: 40px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text);
      transition: background 0.3s ease, border-color 0.3s ease;
      padding: 0;
    }

    .theme-toggle:hover {
      background: var(--hover-bg);
    }

    .theme-toggle:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .theme-toggle:focus:not(:focus-visible) {
      outline: none;
    }

    .theme-toggle .sun-icon { display: none; }
    .theme-toggle .moon-icon { display: block; }

    [data-theme="dark"] .theme-toggle .sun-icon { display: block; }
    [data-theme="dark"] .theme-toggle .moon-icon { display: none; }

    /* Footer */
    .dashboard-footer {
      text-align: center;
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid var(--card-border);
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Print styles */
    @media print {
      body { background: white !important; color: #333 !important; }
      .card { box-shadow: none !important; border: 1px solid #ddd !important; break-inside: avoid; }
      .dashboard { padding: 0; }
      .theme-toggle { display: none !important; }
      .dashboard-header { color: #333; }
      .dashboard-header h1 { color: #111 !important; }
      .dashboard-header .subtitle { color: #555 !important; }
      .dashboard-header .generated-at { color: #777 !important; }
      .section-title { color: #111 !important; }
      .kpi-value { color: #111 !important; }
      .kpi-label { color: #555 !important; }
      thead th { background: #f5f5f5 !important; color: #111 !important; }
      tbody td { color: #333 !important; }
      .dashboard-footer { color: #777 !important; }
    }

    /* Accessibility: reduced motion */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }

    /* Accessibility: high contrast */
    @media (prefers-contrast: more) {
      :root { --card-border: currentColor; --shadow: none; }
      .card { border-width: 2px; }
      .kpi-label, .section-subtitle, .table-footer, .generated-at {
        color: var(--text);
      }
    }

    /* Accessibility: Windows High Contrast Mode */
    @media (forced-colors: active) {
      .card { border: 2px solid CanvasText; }
      .theme-toggle { border: 2px solid ButtonText; }
      .trend-up, .trend-down, .highlight-positive, .highlight-negative {
        forced-color-adjust: none;
      }
    }
  `;
}

function getStyleSpecificCSS(name) {
  switch (name) {
    case "executive":
      return `
    .dashboard::before {
      content: '';
      display: block;
      height: 4px;
      background: linear-gradient(90deg, var(--accent), transparent);
      margin-bottom: 8px;
      border-radius: 2px;
    }
    .dashboard-header {
      text-align: left;
      border-bottom: none;
    }
      `;
    case "minimal":
      return `
    .card {
      box-shadow: none;
    }
    .dashboard-header {
      border-bottom: none;
      padding-bottom: 16px;
    }
      `;
    case "vibrant":
      return `
    .dashboard-header {
      background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent), transparent 70%));
      border-radius: var(--border-radius);
      padding: 28px;
      margin-bottom: 8px;
      border-bottom: none;
    }
    .dashboard-header h1,
    .dashboard-header .subtitle,
    .dashboard-header .generated-at {
      color: #ffffff;
    }
    [data-theme="dark"] .dashboard-header h1,
    [data-theme="dark"] .dashboard-header .subtitle,
    [data-theme="dark"] .dashboard-header .generated-at {
      color: #e0e7ff;
    }
      `;
    case "compact":
      return `
    .chart-container {
      height: var(--chart-height);
    }
    table {
      font-size: var(--font-base);
    }
    thead th {
      padding: 7px 10px;
    }
    tbody td {
      padding: 6px 10px;
    }
      `;
    default:
      return "";
  }
}

// ── Toggle button HTML ──────────────────────────────────────────────────────

const toggleButtonHtml = showToggle
  ? `
      <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme" aria-label="Toggle light and dark theme">
        <svg class="sun-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <svg class="moon-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>`
  : "";

// ── Chart rendering JS ─────────────────────────────────────────────────────

function generateChartScript() {
  const configsJson = JSON.stringify(chartConfigs);

  const toggleJs = showToggle
    ? `
    function toggleTheme() {
      var html = document.documentElement;
      var current = html.getAttribute('data-theme') || 'light';
      var next = current === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
      localStorage.setItem('dashboard-theme', next);
      renderCharts();
      updateToggleIcon();
    }

    function updateToggleIcon() {
      var isDark = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark';
      var sunEl = document.querySelector('.sun-icon');
      var moonEl = document.querySelector('.moon-icon');
      if (sunEl) sunEl.style.display = isDark ? 'block' : 'none';
      if (moonEl) moonEl.style.display = isDark ? 'none' : 'block';
    }
    `
    : "";

  const initJs = showToggle
    ? `
      var saved = localStorage.getItem('dashboard-theme');
      if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
      updateToggleIcon();
      renderCharts();
    `
    : `
      renderCharts();
    `;

  return `
    var CHART_CONFIGS = ${configsJson};
    var chartInstances = [];

    function getThemeColor(name) {
      return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
    }

    function renderCharts() {
      chartInstances.forEach(function(c) { c.destroy(); });
      chartInstances = [];

      var grid = getThemeColor('chart-grid');
      var tick = getThemeColor('chart-tick');
      var legend = getThemeColor('chart-legend');
      var pieBorder = getThemeColor('pie-border');
      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      CHART_CONFIGS.forEach(function(cfg) {
        var data = JSON.parse(JSON.stringify(cfg.data));
        var sd = cfg.styleDefs || {};
        var typeDefs = sd[cfg.type] || (cfg.type === 'pie' ? sd.doughnut : undefined) || {};

        // Update pie/doughnut border colors for current theme
        if (['pie', 'doughnut', 'polarArea'].indexOf(cfg.type) !== -1) {
          data.datasets.forEach(function(ds) { ds.borderColor = pieBorder; });
        }

        // Build legend labels merging style defaults with theme colors
        var legendLabels = { color: legend, usePointStyle: true };
        if (sd.legend) {
          if (sd.legend.padding) legendLabels.padding = sd.legend.padding;
          if (sd.legend.font) legendLabels.font = sd.legend.font;
          if (sd.legend.boxWidth) legendLabels.boxWidth = sd.legend.boxWidth;
        } else {
          legendLabels.padding = 16;
        }

        // Build tooltip merging style defaults
        var tooltipDefs = sd.tooltip || {};
        var tooltip = {
          backgroundColor: tooltipDefs.backgroundColor || 'rgba(15, 23, 42, 0.95)',
          titleColor: tooltipDefs.titleColor || '#f1f5f9',
          bodyColor: tooltipDefs.bodyColor || '#e2e8f0',
          padding: tooltipDefs.padding || 12,
          cornerRadius: tooltipDefs.cornerRadius || 8,
          displayColors: true
        };

        // Animation: use style default, override to 0 if reduced motion
        var anim = sd.animation || { duration: 750 };
        if (reduceMotion) anim = { duration: 0 };

        var options = {
          responsive: true,
          maintainAspectRatio: false,
          animation: anim,
          plugins: {
            title: { display: false },
            legend: {
              display: cfg.showLegend,
              position: 'bottom',
              labels: legendLabels
            },
            tooltip: tooltip
          }
        };

        // Doughnut/pie: apply cutout and spacing from style
        if (['doughnut', 'pie'].indexOf(cfg.type) !== -1 && (typeDefs.cutout || typeDefs.spacing !== undefined)) {
          if (typeDefs.cutout) options.cutout = typeDefs.cutout;
          if (typeDefs.spacing !== undefined) options.spacing = typeDefs.spacing;
        }

        // Non-pie charts: add scales with style grid/tick defaults + theme colors
        if (['pie', 'doughnut', 'polarArea', 'radar'].indexOf(cfg.type) === -1) {
          var gridDefs = sd.grid || {};
          var tickDefs = sd.ticks || {};
          var xGridDef = gridDefs.x || {};
          var yGridDef = gridDefs.y || {};
          var userScales = (cfg.baseOptions && cfg.baseOptions.scales) ? cfg.baseOptions.scales : {};
          var xUser = userScales.x || {};
          var yUser = userScales.y || {};

          // Build x-axis grid: style display setting + theme color
          var xGrid = { color: grid };
          if (xGridDef.display !== undefined) xGrid.display = xGridDef.display;
          if (xGridDef.borderDash) xGrid.borderDash = xGridDef.borderDash;
          if (xGridDef.color) xGrid.color = xGridDef.color;

          // Build y-axis grid: style display setting + theme color fallback
          var yGrid = { color: grid };
          if (yGridDef.display !== undefined) yGrid.display = yGridDef.display;
          if (yGridDef.borderDash) yGrid.borderDash = yGridDef.borderDash;
          if (yGridDef.color) yGrid.color = yGridDef.color;

          // Build tick options
          var xTick = { color: tick };
          var yTick = { color: tick };
          if (tickDefs.font) { xTick.font = tickDefs.font; yTick.font = tickDefs.font; }
          if (tickDefs.padding !== undefined) { xTick.padding = tickDefs.padding; yTick.padding = tickDefs.padding; }
          if (tickDefs.maxTicksLimit) { xTick.maxTicksLimit = tickDefs.maxTicksLimit; yTick.maxTicksLimit = tickDefs.maxTicksLimit; }
          if (tickDefs.maxRotation !== undefined) { xTick.maxRotation = tickDefs.maxRotation; }

          options.scales = {
            x: Object.assign({ grid: xGrid, ticks: xTick }, xUser),
            y: Object.assign({ grid: yGrid, ticks: yTick, beginAtZero: true }, yUser)
          };
        }

        // Merge remaining base options (user overrides win)
        if (cfg.baseOptions) {
          if (cfg.baseOptions.plugins) {
            Object.assign(options.plugins, cfg.baseOptions.plugins);
          }
          if (cfg.baseOptions.indexAxis) {
            options.indexAxis = cfg.baseOptions.indexAxis;
          }
        }

        chartInstances.push(new Chart(document.getElementById(cfg.id), {
          type: cfg.type,
          data: data,
          options: options
        }));
      });
    }

    ${toggleJs}

    document.addEventListener('DOMContentLoaded', function() {
      ${initJs}
    });
  `;
}

// ── Determine initial data-theme attribute ──────────────────────────────────

let initialDataTheme = "";
if (themeMode === "both") {
  // Will be resolved at runtime via JS (OS preference or localStorage)
  // Default to light in the HTML attribute; JS will override on DOMContentLoaded
  initialDataTheme = 'light';
} else {
  initialDataTheme = themeMode;
}

// ── Generate full CSS ───────────────────────────────────────────────────────

const css = generateCSS(styleConfig, themeMode) + getStyleSpecificCSS(styleName);

// ── Font CDN link ────────────────────────────────────────────────────────────

const fontLinkHtml = styleConfig.fontCDN
  ? `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${styleConfig.fontCDN}" rel="stylesheet">`
  : "";

// ── Generate HTML ───────────────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en" data-theme="${initialDataTheme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${showToggle ? `<script>
    (function(){var s=localStorage.getItem('dashboard-theme');if(s){document.documentElement.setAttribute('data-theme',s)}else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches){document.documentElement.setAttribute('data-theme','dark')}})();
  <\/script>` : ""}
  ${fontLinkHtml}
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>
  <style>${css}</style>
</head>
<body>
  <div class="dashboard">
    <div class="dashboard-header">
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ""}
      <p class="generated-at">Generated: ${escapeHtml(generatedAt)}</p>
      ${toggleButtonHtml}
    </div>
    <div class="sections">
      ${sectionsHtml}
    </div>
    <div class="dashboard-footer">
      Generated: ${escapeHtml(generatedAt)}
    </div>
  </div>
  <script>
    ${generateChartScript()}
  <\/script>
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

const themeLabel = showToggle ? `${themeMode} (toggle enabled)` : themeMode;

console.log(`Dashboard generated successfully!`);
console.log(`  File: ${absOutput}`);
console.log(`  Size: ${fileSizeKb} KB`);
console.log(`  Sections: ${sections.length}`);
console.log(`  Charts: ${chartIndex}`);
console.log(`  Style: ${styleName}`);
console.log(`  Theme: ${themeLabel}`);
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
