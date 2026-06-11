"use client";

import { POI_CATEGORY_BY_ID, type PoiCategoryId } from "@/lib/poi-categories";

/**
 * Static scene furniture for the landing scroll story (components/Landing.tsx).
 *
 * Every block here is a faithful style replica of the live product surface it
 * previews - the buyer panel's Section cards, the full report's provenance
 * lines, the /compare table - composed with the SAME utility classes the real
 * components use, but with fixed Brunswick East demo content so nothing
 * fetches. The scroll-driven entrance/exit transforms live on the wrapper
 * classes (.landing-el / .landing-rise / .landing-sheet in globals.css).
 */

/* ------------------------------------------------------------------------- */
/* Shared caption card - the left-hand (mobile: bottom) narration per scene.  */
/* ------------------------------------------------------------------------- */

export function CaptionCard({
  heading,
  body,
  footnote,
  className = "",
}: {
  heading: string;
  body: string;
  /** One honest muted line under the body (e.g. the coverage disclosure). */
  footnote?: string;
  className?: string;
}) {
  return (
    <div
      className={`landing-el pointer-events-auto w-full rounded-lg border border-surface-border bg-surface-raised p-5 shadow-card sm:max-w-sm ${className}`}
    >
      <h2 className="font-display text-xl font-semibold leading-snug text-accent-focus">
        {heading}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
      {footnote && <p className="mt-3 text-xs text-ink-muted">{footnote}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Scene 3 - the right-side panel glimpse (BuyerReportPanel aesthetic).       */
/* ------------------------------------------------------------------------- */

const fmtDist = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

/** Demo amenity rows in the live POI palette - same row markup as the panel. */
/**
 * REAL nearby amenities for the landing pin, straight from the baked POI tile
 * (report-tiles/pois/14/14790/10050.json) - names, categories and straight-line
 * distances are genuine so the glimpse matches what the app itself would show.
 */
const GLIMPSE_AMENITIES: {
  category: PoiCategoryId;
  name: string;
  distanceMeters: number;
}[] = [
  { category: "park", name: "Fleming Park", distanceMeters: 62 },
  { category: "cafe_restaurant", name: "Joan Specialty Coffee", distanceMeters: 65 },
  { category: "gym_leisure", name: "Nexus Performance", distanceMeters: 282 },
  { category: "gp", name: "East Brunswick Medical Centre", distanceMeters: 389 },
  { category: "school", name: "Brunswick East Primary School", distanceMeters: 633 },
];

export function GlimpsePanel() {
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4 text-ink">
      <header>
        <h3 className="font-display text-lg font-semibold text-accent-focus">
          Brunswick East
        </h3>
        <p className="mt-0.5 text-xs text-ink-muted">
          Merri-bek council area - information only, not advice.
        </p>
      </header>

      {/* Score strip - the area's REAL percentile ranks (places.json,
          brunswick-east-206011106), exactly as the live panel leads. */}
      <section className="grid grid-cols-3 gap-2">
        {[
          ["Affordability", "92"],
          ["Health access", "86"],
          ["Transport", "82"],
        ].map(([label, score]) => (
          <div
            key={label}
            className="rounded-lg border border-surface-border bg-surface px-2.5 py-2 shadow-card"
          >
            <p className="text-[10px] text-ink-muted">{label}</p>
            <p className="num font-display text-base font-semibold text-accent-focus">
              {score}
            </p>
          </div>
        ))}
      </section>

      {/* Section card: same classes as BuyerReportPanel's Section component. */}
      <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
        <p className="font-display text-sm font-semibold text-ink">Nearby amenities</p>
        <ul className="mt-2 space-y-1">
          {GLIMPSE_AMENITIES.map((a) => (
            <li
              key={a.name}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: POI_CATEGORY_BY_ID[a.category]?.color ?? "#8A857B",
                  }}
                  aria-hidden
                />
                <span className="truncate text-ink-muted">{a.name}</span>
              </span>
              <span className="num shrink-0 text-ink">{fmtDist(a.distanceMeters)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Finding row: the panel's flattened divider-row pattern with the
          severity accent as a left bar. */}
      <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
        <p className="font-display text-sm font-semibold text-ink">Planning and noise</p>
        <div className="mt-2">
          <div className="border-l-[3px] border-l-caution py-1 pl-3">
            <p className="text-sm font-medium text-ink">Heritage rules apply here</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Changes to facades and front fences can need a permit.
            </p>
          </div>
        </div>
      </section>

      {/* The rest of the live panel, as it appears before you scroll it -
          REAL section titles from BuyerReportPanel, one-line teasers each.
          This is the feature breadth the glimpse is advertising. */}
      <section className="grid grid-cols-2 gap-2">
        {[
          ["Sun & light", "Simulate sun and shadows at any hour"],
          ["How far you can get", "Real walk and cycle reach from here"],
          ["Distance to your places", "Commutes to YOUR work and school"],
          ["Things to verify", "The checks to run before you offer"],
        ].map(([title, teaser]) => (
          <div
            key={title}
            className="rounded-lg border border-surface-border bg-surface p-3 shadow-card"
          >
            <p className="font-display text-xs font-semibold text-ink">{title}</p>
            <p className="mt-1 text-[11px] leading-snug text-ink-muted">{teaser}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Scene 4 - the full-report sheet (provenance discipline IS the pitch).      */
/* ------------------------------------------------------------------------- */

/**
 * REAL Brunswick East figures from data/generated/places.json
 * (slug brunswick-east-206011106) - percentile ranks within Greater Melbourne,
 * ABS ERP population, Vic DoE school counts and the live walk-access counts.
 * Nothing here is invented; the landing shows the product's own numbers.
 */
const AREA_DOMAINS: { label: string; percentile: number }[] = [
  { label: "Affordability", percentile: 92 },
  { label: "Income", percentile: 88 },
  { label: "Health access", percentile: 86 },
  { label: "Transport", percentile: 82 },
  { label: "Hazards", percentile: 60 },
  { label: "Safety", percentile: 58 },
  { label: "Education", percentile: 57 },
];

const WALK_COUNTS: { label: string; count: number }[] = [
  { label: "Cafes and restaurants", count: 67 },
  { label: "Parks and open space", count: 47 },
  { label: "Supermarkets", count: 16 },
  { label: "GPs and clinics", count: 8 },
];

export function ReportSheet() {
  return (
    <div className="landing-rise pointer-events-auto mx-auto w-full max-h-[55vh] max-w-md overflow-hidden rounded-lg border border-surface-border bg-surface-raised p-5 shadow-card sm:max-h-none sm:max-w-xl sm:p-6">
      <header className="border-b-2 border-accent pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          Area report - free for every suburb
        </p>
        <h3 className="mt-0.5 font-display text-xl font-semibold text-accent-focus">
          Brunswick East
        </h3>
        <p className="mt-0.5 text-xs text-ink-muted">
          Merri-bek council area - 13,765 residents across 2.17 km2, inner
          north of Melbourne.
        </p>
      </header>

      {/* The report's REAL tab rail (PlaceProfileClient) - every lens the
          full page opens into. */}
      <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden="true">
        {["Overview", "Safety", "Transport", "Home buyer", "Walk & cycle", "Equity & community"].map(
          (tab, i) => (
            <span
              key={tab}
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                i === 0
                  ? "bg-accent text-accent-ink"
                  : "border border-surface-border bg-surface text-ink-muted"
              }`}
            >
              {tab}
            </span>
          )
        )}
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-[1.15fr_1fr]">
        {/* Percentile bars - the real ranks within Greater Melbourne. */}
        <div>
          <p className="text-xs font-semibold text-ink">
            How it ranks across Greater Melbourne
          </p>
          <ul className="mt-2 space-y-2">
            {AREA_DOMAINS.map((d) => (
              <li key={d.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-ink-muted">{d.label}</span>
                  <span className="num text-xs font-semibold text-accent-focus">
                    {d.percentile}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${d.percentile}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* The live walk-access counts + schooling facts. */}
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-surface-border bg-surface p-3">
            <p className="text-xs font-semibold text-ink">
              Within a 1.2 km walk
            </p>
            <ul className="mt-1.5 space-y-1">
              {WALK_COUNTS.map((w) => (
                <li
                  key={w.label}
                  className="flex items-baseline justify-between gap-3 text-xs"
                >
                  <span className="text-ink-muted">{w.label}</span>
                  <span className="num font-semibold text-ink">{w.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-surface-border bg-surface p-3">
            <p className="text-xs font-semibold text-ink">Schools in the area</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              2 government and 1 catholic school operate inside the boundary;
              zoning maps sit in the full report.
            </p>
          </div>
        </div>
      </div>

      <p className="num mt-4 border-t border-surface-border pt-2.5 text-[10px] tracking-wide text-ink-muted">
        src: ABS ERP 2023 - Vic DoE school locations 2025 - walk access from
        OpenStreetMap + Vicmap. Every line in the full report carries its
        source and date.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Scene 5 - the compare table (app/compare/page.tsx styling).                */
/* ------------------------------------------------------------------------- */

/**
 * REAL percentile ranks from data/generated/places.json (Brunswick East
 * 206011106 vs Preston East 209021428); the Greater Melbourne baseline is the
 * metro median (50) by construction. Education honestly goes to Preston East.
 */
const COMPARE_ROWS: {
  label: string;
  be: string;
  preston: string;
  gm: string;
  /** Which area column carries the stronger value (accent emphasis). */
  best: "be" | "preston" | null;
}[] = [
  { label: "Affordability", be: "92", preston: "59", gm: "50", best: "be" },
  { label: "Health access", be: "86", preston: "81", gm: "50", best: "be" },
  { label: "Transport", be: "82", preston: "59", gm: "50", best: "be" },
  { label: "Education", be: "57", preston: "82", gm: "50", best: "preston" },
];

export function CompareTable() {
  return (
    <div className="landing-rise pointer-events-auto mx-auto w-full max-w-md overflow-x-auto rounded-lg border border-surface-border bg-surface shadow-card sm:max-w-xl">
      <table className="w-full min-w-[420px] border-collapse text-left text-sm">
        <thead>
          <tr>
            <th scope="col" className="w-32 border-b border-surface-border px-3 py-2.5" />
            <th
              scope="col"
              className="border-b border-surface-border px-3 py-2.5 font-display text-sm font-semibold text-accent-focus"
            >
              Brunswick East
            </th>
            <th
              scope="col"
              className="border-b border-surface-border px-3 py-2.5 font-display text-sm font-semibold text-accent-focus"
            >
              Preston East
            </th>
            <th
              scope="col"
              className="border-b border-l border-surface-border bg-surface-sunken/60 px-3 py-2.5 font-display text-sm font-medium text-ink-muted"
            >
              Greater Melbourne
            </th>
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((r) => (
            <tr key={r.label}>
              <th
                scope="row"
                className="border-b border-surface-border px-3 py-2.5 text-xs font-semibold tracking-wide text-ink-muted"
              >
                {r.label}
              </th>
              <td
                className={`num border-b border-surface-border px-3 py-2.5 ${
                  r.best === "be" ? "font-semibold text-accent-focus" : "text-ink"
                }`}
              >
                {r.be}
              </td>
              <td
                className={`num border-b border-surface-border px-3 py-2.5 ${
                  r.best === "preston" ? "font-semibold text-accent-focus" : "text-ink"
                }`}
              >
                {r.preston}
              </td>
              <td className="num border-b border-l border-surface-border bg-surface-sunken/60 px-3 py-2.5 text-ink-muted">
                {r.gm}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] leading-snug text-ink-muted">
        Percentile ranks within Greater Melbourne - the baseline column is the
        metro median.
      </p>
    </div>
  );
}
