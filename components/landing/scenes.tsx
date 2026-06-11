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
const GLIMPSE_AMENITIES: {
  category: PoiCategoryId;
  name: string;
  distanceMeters: number;
}[] = [
  { category: "pharmacy", name: "East Brunswick Pharmacy", distanceMeters: 270 },
  { category: "supermarket", name: "Woolworths Brunswick East", distanceMeters: 350 },
  { category: "school", name: "Brunswick East Primary School", distanceMeters: 450 },
  { category: "gp", name: "Lygon Street Medical Centre", distanceMeters: 600 },
  { category: "park", name: "Merri Creek Trail / CERES", distanceMeters: 700 },
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

      {/* Score strip - the glimpse leads with the area's headline numbers,
          exactly as the live panel does. */}
      <section className="grid grid-cols-3 gap-2">
        {[
          ["Liveability", "78"],
          ["Transport", "84"],
          ["Green space", "66"],
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

      {/* Finding rows: the panel's flattened divider-row pattern with the
          severity accent as a left bar. */}
      <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
        <p className="font-display text-sm font-semibold text-ink">Planning and noise</p>
        <div className="mt-2 divide-y divide-surface-border">
          <div className="border-l-[3px] border-l-caution py-2.5 pl-3 first:pt-0">
            <p className="text-sm font-medium text-ink">Heritage rules apply here</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Parts of Brunswick East sit under a heritage overlay - changes to
              facades and front fences can need a permit.
            </p>
          </div>
          <div className="border-l-[3px] border-l-accent py-2.5 pl-3 last:pb-0">
            <p className="text-sm font-medium text-ink">Tram corridor within 200 m</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Lygon Street trams run late into the evening - listen at the
              property at peak hour.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Scene 4 - the full-report sheet (provenance discipline IS the pitch).      */
/* ------------------------------------------------------------------------- */

const REPORT_FINDINGS: {
  title: string;
  body: string;
  src: string;
  accent: string;
}[] = [
  {
    title: "Heritage overlay (HO110) applies at this point",
    body: "Changes to the facade, additions and some fences need a heritage permit from the council.",
    src: "src: Vicmap Planning, May 2026",
    accent: "border-l-accent",
  },
  {
    title: "No flood or bushfire overlay",
    body: "Clear at this exact point - still ask the council about local drainage history.",
    src: "src: VicPlan hazard mapping, Apr 2026",
    accent: "border-l-surface-border",
  },
  {
    title: "Tram stop 4 minutes on foot",
    body: "Route 96 to the city every 8 minutes at peak from Nicholson Street.",
    src: "src: PTV GTFS timetable, Jun 2026",
    accent: "border-l-surface-border",
  },
  {
    title: "Crime trend improving across Merri-bek",
    body: "Offences per 100,000 residents have fallen three years running.",
    src: "src: Crime Statistics Agency VIC, Mar 2026",
    accent: "border-l-surface-border",
  },
];

const VERIFY_ITEMS = [
  "Order the Section 32 and check the heritage schedule",
  "Walk the block at peak hour for tram and traffic noise",
  "Ask the council about drainage or past flooding nearby",
];

function RiskChip({
  tone,
  children,
}: {
  tone: "caution" | "pass" | "accent";
  children: React.ReactNode;
}) {
  const cls =
    tone === "caution"
      ? "bg-caution-tint text-caution"
      : tone === "pass"
        ? "bg-pass/10 text-pass"
        : "bg-accent-tint text-accent-focus";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}

export function ReportSheet() {
  return (
    <div className="landing-rise pointer-events-auto mx-auto w-full max-h-[55vh] max-w-md overflow-hidden rounded-lg border border-surface-border bg-surface-raised p-5 shadow-card sm:max-h-none sm:max-w-lg sm:p-6">
      <header className="border-b-2 border-accent pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          Buyer location check
        </p>
        <h3 className="mt-0.5 font-display text-xl font-semibold text-accent-focus">
          Brunswick East
        </h3>
        <p className="mt-0.5 text-xs text-ink-muted">
          Merri-bek council area - information only, verify before you buy.
        </p>
      </header>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ["Liveability", "78"],
          ["Transport", "84"],
          ["Green space", "66"],
        ].map(([label, score]) => (
          <div
            key={label}
            className="rounded-md border border-surface-border bg-surface px-2.5 py-2"
          >
            <p className="text-[10px] text-ink-muted">{label}</p>
            <p className="num font-display text-base font-semibold text-accent-focus">
              {score}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <RiskChip tone="caution">Heritage: check</RiskChip>
        <RiskChip tone="pass">Flood: clear</RiskChip>
        <RiskChip tone="pass">Bushfire: clear</RiskChip>
        <RiskChip tone="accent">Noise: verify</RiskChip>
      </div>

      <div className="mt-3 divide-y divide-surface-border">
        {REPORT_FINDINGS.map((f) => (
          <div key={f.title} className={`border-l-[3px] ${f.accent} py-2.5 pl-3`}>
            <p className="text-sm font-medium text-ink">{f.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{f.body}</p>
            <p className="num mt-1 text-[10px] tracking-wide text-ink-muted">{f.src}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-surface-border bg-surface p-3">
        <p className="text-xs font-semibold text-ink">What to verify before you offer</p>
        <ol className="mt-1.5 space-y-1.5">
          {VERIFY_ITEMS.map((v, i) => (
            <li key={v} className="flex gap-2 text-xs text-ink-muted">
              <span className="num flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-ink">
                {i + 1}
              </span>
              <span>{v}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Scene 5 - the compare table (app/compare/page.tsx styling).                */
/* ------------------------------------------------------------------------- */

const COMPARE_ROWS: {
  label: string;
  be: string;
  preston: string;
  gm: string;
  /** Which area column carries the stronger value (accent emphasis). */
  best: "be" | "preston" | null;
}[] = [
  { label: "Liveability", be: "78", preston: "72", gm: "50", best: "be" },
  { label: "Transport", be: "84", preston: "76", gm: "50", best: "be" },
  { label: "Safety trend", be: "Improving", preston: "Steady", gm: "-", best: "be" },
  { label: "Green space", be: "66", preston: "71", gm: "50", best: "preston" },
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
              Preston
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
