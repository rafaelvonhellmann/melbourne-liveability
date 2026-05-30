# Liveability MVP - Design System (companion to ULTRAPLAN.md)

**Direction:** A - Anthropic warm-editorial. Calm, civic-credible, map-first. Reference: analisa.pt (restraint) + CrystalRoof (profile density). Preview: `design-preview.html`.

**Cardinal rule:** **color is a data channel.** Saturated color is reserved for the data palette (choropleth + scores). Chrome stays warm-neutral. Never use a data color as a UI accent, never use the brand accent as a data color.

---

## 1. Design tokens (single source of truth)

Put these in `app/globals.css` as CSS vars + mirror into `tailwind.config.ts` theme. Every component references tokens - no hardcoded hex anywhere.

### 1.1 Chrome palette (brand)
```css
:root {
  --bg:        #F0EEE6;  /* app background (cream) */
  --surface:   #FAF9F5;  /* panels, cards */
  --surface-2: #F3F1E9;  /* insets, tracks, hover */
  --ink:       #1A1A18;  /* primary text */
  --muted:     #6B6862;  /* secondary text, labels */
  --border:    #E3DFD3;  /* hairlines */
  --accent:    #D97757;  /* clay - interactive/selected/primary ONLY */
  --accent-ink:#FFFFFF;  /* text on accent */
  --focus:     #B65A3C;  /* darker clay for focus ring / a11y contrast */
}
```

### 1.2 Data palette (NEVER themed, colorblind-safe)
ColorBrewer **YlGnBu**, 5-class sequential. Use for choropleth, score fills, legend.
```css
:root {
  --d1:#ffffcc; --d2:#a1dab4; --d3:#41b6c4; --d4:#2c7fb8; --d5:#253494;
  --no-data:#D9D6CF;  /* non-residential / missing SA2 - distinct, desaturated */
}
```
- **Sequential** (YlGnBu) for single-domain + overall score (0->100).
- **Diverging** only where a meaningful midpoint exists (above/below metro median): use ColorBrewer **RdYlBu reversed** (`#d73027 ... #f7f7f7 ... #4575b4`). Document which layers are diverging.
- Continuous scales: interpolate the 5 stops. Bin into 5-7 classes for the legend (quantile classification; state the method in `/methodology`).
- Score number badges use a gradient of `--d4 -> --d5`.

### 1.3 Typography
- **Headings / place names / brand:** serif - **Fraunces** (variable, opsz). Weight 500. Tight letter-spacing (-0.01em). This carries the Anthropic warmth.
- **UI / body / data:** **Inter** (or Geist). Weights 400/500/600.
- **All numbers:** `font-variant-numeric: tabular-nums` ALWAYS (scores, tables, sliders, legends). Non-negotiable - misaligned digits look broken.
- Scale (rem): h1 1.75 / h2 1.375 / h3 0.6875 uppercase-label / body 0.875 / small 0.75.
- Load via `next/font` (self-hosted, no CLS). Do not use Google CDN link in prod.

### 1.4 Shape + depth
```css
--radius: 10px;            /* cards, inputs, chips */
--radius-pill: 999px;      /* presets, badges */
--shadow: 0 1px 3px rgba(40,35,25,.08), 0 8px 24px rgba(40,35,25,.06);
```
- Soft shadows only on floating elements (legend, layer control, popovers, bottom sheet). Flat hairline borders elsewhere. No heavy/colored shadows (that was direction C).

### 1.5 Spacing + motion
- 4px base grid (4/8/12/16/24/32).
- Transitions 150ms ease for hover/active; 250ms for sheet/panel slide. Respect `prefers-reduced-motion` - disable map-fly + sheet spring, keep instant state.

---

## 2. Map styling (where most design goes wrong)

- **Basemap: desaturated/monochrome** - CARTO Positron or Protomaps "light". The basemap must recede so the data choropleth dominates. Never a colorful default basemap.
- Choropleth fill from data palette at ~0.8 opacity; SA2 borders 0.5px `--border` at low zoom, hidden when zoomed out.
- **Selected place:** 3px `--accent` outline (clay), no fill change.
- **Hover:** subtle lighten + cursor pointer; show a small DomainCard popover.
- POI pins: white circle, 3px `--accent` ring, simple icon. Cluster at low zoom (neutral grey clusters, count in tabular-nums).
- Non-residential SA2: `--no-data` fill + diagonal-hatch pattern so it's unmistakably "not scored," with legend entry.
- Legend: always visible (bottom-left), shows scale + classification + no-data swatch.

---

## 3. Component specs (build against tokens)

Map shadcn/ui primitives to these. shadcn = neutral base; theme it warm via the tokens above (set shadcn CSS vars to point at ours).

| Component | Spec |
|---|---|
| **TopBar** | `--surface` bg, hairline bottom. Brand in Fraunces (`liveable.melbourne`, dot in `--accent`). Search center-left, Compare (ghost) + Methodology (accent) right. |
| **SearchBox** | `--surface-2` inset, fuse.js dropdown; matched suburb chars bolded; multi-SA2 suburbs show all hits grouped. |
| **Map** | Section 2. |
| **LayerToggle** | Floating top-right card. Domain list; active = `--accent` chip. Pin layers stackable (checkbox style). |
| **Legend** | Floating bottom-left card; scale swatches + no-data. |
| **BottomSheet (mobile)** | Draggable, 3 detents (peek / half / full). `--surface`, top radius, grab handle. Holds search+results+sliders on mobile. **Mobile-first** - desktop is the right-side panel. |
| **ResultsPanel (desktop)** | Right column 372px, `--surface`, left hairline. Ranked list + selected profile. |
| **ScoreBadge** | Rounded square, gradient `--d4->--d5`, big tabular number + "score" caption. |
| **ScoreBreakdown** | Per-domain bar: label + `percentile - weight%` (tabular), track `--surface-2`, fill = data-palette color matched to percentile. |
| **DomainSliders** | One per scored domain; thumb `--accent`; live value tabular. Social-housing starts 0. Reset button. URL-synced. |
| **PersonaPresets** | Pill row (Family/Young-professional/Retiree/Student); active pill `--accent`. Sets slider weights. |
| **StalenessBadge** | Small pill, `--muted`; "data as of <period>"; amber tint only when past threshold (rent>6mo, crime>18mo, census>5yr). |
| **SourceDrawer** | Slide-over: source name, URL, licence, period, fetch date per indicator. |
| **Caveat** | Inset block, `--accent` left-border, `--muted` text. Crime/percentile-relativity/approx caveats. |
| **Context panels** | EquityPanel / CommunityPanel / EnvironmentPanel / PoliticsPanel: same card style, each headed with a clear **"Context only - not part of the liveability score"** tag. PoliticsPanel strictly neutral, election-year stamped. |
| **CompletenessBadge** | "9/10 indicators" pill; low coverage -> muted warning tint. |
| **DataTable (fallback)** | Sortable ranked table; works without JS; tabular-nums; same data as map. a11y + SEO. |

---

## 4. Accessibility (WCAG AA, build in from start)
- Contrast: `--ink` on `--surface` and `--accent-ink` on `--accent` both pass AA. Verify any new pair.
- Data palette is colorblind-safe (YlGnBu) AND every map value is reachable via the **DataTable** + tooltips - never color-only.
- Full keyboard nav; visible focus ring (`--focus`, 2px offset). `aria` labels on map controls. Sheet/drawer are focus-trapped + Esc-closable.
- Respect `prefers-reduced-motion` and `prefers-color-scheme` (see Sec 6).

---

## 5. Do / Don't
- DO reserve all saturated color for data. DO keep basemap monochrome. DO tabular-nums everywhere.
- DON'T use clay (`--accent`) on the map fills. DON'T add a 2nd brand color. DON'T use gradients except the score badge. DON'T let panels out-color the map.

---

## 6. Deferred (v1.x)
- **Dark mode:** define a parallel token set (`--bg:#1A1A18` etc.); data palette stays identical (test contrast on dark). Don't build in v1.0, but author tokens so it's a swap later.
- OG-image template (per-place share card) reusing ScoreBadge + Fraunces.
- Micro-interactions polish (map fly-to, sheet spring).

---

## 7. How to drive Cursor/Claude for design
1. Implement **Section 1 tokens first** (`globals.css` + tailwind theme) before any component.
2. Point shadcn CSS vars at our tokens (one mapping file).
3. Build **one component at a time** against the table in Sec 3 - paste the relevant row + `design-preview.html` as reference.
4. Prototype the **map + bottom-sheet + live re-color** interaction in isolation before wiring real data.
5. After each component: check contrast + tabular-nums + keyboard focus. No exceptions.
