# Dashboard Style Guide — LLM Decision Rules

Runtime reference for mapping user requests to dashboard style configurations.
Loaded only when a user picks a non-default style or describes a custom style via free text.

All static values (colors, fonts, Chart.js options, accessibility CSS) are baked into
`generate-dashboard.js` — this file contains only the decision logic the LLM needs.

---

## Available Palettes

| Palette Name | Colors | Colorblind-Safe | Best For |
|---|---|---|---|
| `default` | 10 | No | General-purpose, visual harmony |
| `vibrant` | 10 | No | Eye-catching, marketing |
| `pastel` | 10 | No | Light backgrounds, decorative fills |
| `accessible` | 8 | Yes | Colorblind safety, scientific |
| `accessible-bright` | 7 | Yes | Brighter accessible charts |
| `accessible-extended` | 10 | Yes | 8-10 categories with accessibility |
| `ibm` | 5 | Yes | 3-5 categories, maximum clarity |

### Per-Style Default Palettes

Each style has a built-in default palette that activates when `palette` is omitted from chart sections.
Only set `palette` explicitly to override the style default.

| Style | Default Palette | Character |
|---|---|---|
| `corporate` | `default` | Muted, professional Tableau 10 |
| `executive` | `accessible-bright` | Vivid on dark backgrounds |
| `minimal` | `pastel` | Soft, understated |
| `vibrant` | `vibrant` | Bold, saturated |
| `compact` | `accessible` | Colorblind-safe, functional |

### Manual Override Decision Rules

When explicitly setting `palette` on a chart section (overriding the style default):

```
IF categories <= 3       → ibm
IF categories 4-6        → accessible (skip yellow on light backgrounds)
IF categories 7-8        → accessible-bright
IF categories 9-10       → accessible-extended
IF categories > 10       → Regroup into top 7-8 + "Other"
IF colorblind required   → Never use default or vibrant
IF print/grayscale       → accessible (designed for grayscale)
IF aesthetic priority    → default or vibrant
```

---

## Custom Style Decision Rules

When a user describes a custom style via free text (e.g., "make it look like Stripe",
"dark with neon accents", "modern SaaS feel"), use these rules to construct a style config.

### Mapping User Descriptions to Styles

| User Says | Map To | Reasoning |
|---|---|---|
| "professional", "business", "corporate", "enterprise" | `corporate` | Safe, trustworthy |
| "executive", "boardroom", "presentation", "bold" | `executive` | High-impact, dark |
| "clean", "minimal", "simple", "flat" | `minimal` | Content-first |
| "modern", "colorful", "vibrant", "marketing", "startup" | `vibrant` | Eye-catching |
| "dense", "compact", "monitoring", "ops", "grafana-like" | `compact` | Maximum density |
| "like Stripe" | `corporate` | Archetype of corporate dashboard design |
| "like Vercel" | `minimal` | Radical monochrome minimalism |
| "like Linear" | `executive` | Dark-first, sharp, premium |
| "like Grafana" | `compact` | Monitoring density |
| "like Salesforce" | `corporate` | Enterprise card-based layout |
| "like GitHub" | `minimal` | Border-only cards, system fonts |

### Color Generation Rules

When the user specifies a custom base/accent color:

1. **Determine the gray scale family** based on the accent hue:
   - Blue/Cyan accent → Slate grays (blue undertone)
   - Purple/Violet accent → Zinc grays (subtle purple undertone)
   - Green/Teal accent → Neutral grays
   - Orange/Amber/Gold accent → Stone grays (warm undertone)
   - No strong accent → Neutral grays (pure, impartial)
   - Indigo accent → Slate grays with indigo tinting (like Vibrant style)

2. **Derive light theme from the gray scale**:
   - `bg`: gray-50 to gray-100
   - `cardBg`: `#ffffff`
   - `cardBorder`: gray-200
   - `text`: gray-700
   - `textMuted`: gray-500 (verify ≥ 4.5:1 on white)
   - `textHeading`: gray-900
   - `accent`: the user's chosen color
   - `shadow`: `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)`

3. **Derive dark theme**:
   - `bg`: gray-900
   - `cardBg`: gray-800
   - `cardBorder`: gray-700
   - `text`: gray-200
   - `textMuted`: gray-400
   - `textHeading`: gray-50
   - `accent`: same hue, +15-25% lightness, -5-15% saturation
   - `shadow`: `0 1px 3px rgba(0,0,0,0.4)`

4. **If user says "tinted" or "branded"**: Tint borders and shadows with the accent color
   (like Vibrant style does with indigo)

### Font Selection Rules

| User Says | Font | CDN |
|---|---|---|
| "modern", "saas", "startup" | Inter | `fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap` |
| "classic", "traditional", "no extra fonts" | System stack | (none) |
| "clean", "minimal", "developer" | Geist | `fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap` |
| "bold", "executive", "presentation" | Plus Jakarta Sans | `fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap` |
| "friendly", "playful", "consumer" | DM Sans | `fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap` |
| "dense", "monitoring" | Inter (at reduced sizes) | Same as above |
| no preference | System stack | (none — zero load time) |

### Chart Styling Rules

| User Description | Grid | Border Radius | Fill | Animation |
|---|---|---|---|---|
| "clean", "minimal" | Hidden both axes | 2px | None | 500ms |
| "professional", "corporate" | Y-axis only, dashed, subtle | 6px | 0.1 alpha | 750ms |
| "bold", "executive" | Y-axis only, solid, very faint | 4px | 0.15 alpha | 900ms |
| "colorful", "vibrant" | Y-axis only, accent-tinted | 8px (all corners) | 0.12 alpha | 1000ms |
| "dense", "monitoring" | Y-axis only, dashed, very subtle | 3px | 0.06 alpha | 400ms |

---

## Contrast Failures to Avoid

When generating custom color combinations, avoid these known WCAG AA failures:

| Color | Background | Ratio | Fix |
|---|---|---|---|
| `#16a34a` (green-600) | `#ffffff` | ~3.9:1 | Use `#15803d` (green-700) |
| `#dc2626` (red-600) | `#1e293b` (dark card) | ~3.5:1 | Use `#f87171` (red-400) |
| `#6366f1` (indigo-500) | `#ffffff` | ~3.9:1 | Use `#4f46e5` (indigo-600) |

**Rule**: For trend/status text, always use green-700 / red-700 on light, green-400 / red-400 on dark.
