"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DomainId, Place } from "@/lib/types";
import { computeWeightedScore } from "@/lib/scoring";
import { getDefaultWeights } from "@/lib/weights";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import { PERSONA_PRESETS, personaWeights, type PersonaId } from "@/lib/personas";
import { sourcesForIndicatorIds, getSource, shortSourceName } from "@/lib/sources";
import { percentileToColor } from "@/lib/colors";
import { metricsForDomain } from "@/lib/metric-catalog";
import type { GmBenchmarks } from "@/lib/benchmarks";
import type { PlaceSeries } from "@/lib/timeseries";
import { MIN_TREND_POINTS } from "@/lib/timeseries";
import { Sparkline } from "./Sparkline";
import { ScoreBadge, DomainBar } from "./ScoreVisuals";
import { MetricCard } from "./MetricCard";
import { ContextPanels } from "./ContextPanels";
import { WalkAccessPanel } from "./WalkAccessPanel";
import { CyclabilityPanel } from "./CyclabilityPanel";
import { DataConfidenceCard } from "./DataConfidenceCard";
import { DataCoverageCard } from "./DataCoverageCard";
import { HomeBuyerCard } from "./HomeBuyerCard";
import { SourceDrawer } from "./SourceDrawer";
import { ProfileEngagement } from "./ProfileEngagement";
import { FeedbackButton } from "./FeedbackButton";
import { BuyerHereCard } from "@/components/buyer/BuyerHereCard";
import { SimilarAreasList } from "./SimilarAreasList";
import type { SimilarAreaItem } from "@/lib/similar-areas";

type Props = {
  place: Place;
  homeBuyerPercentile?: number | null;
  benchmarks?: GmBenchmarks;
  series?: Record<string, PlaceSeries>;
  /** Closest peer areas by per-domain percentile similarity (precomputed at build). */
  similar?: SimilarAreaItem[];
};

type TabKind = "overview" | "persona" | "domain" | "context";
type ContextId = "homebuyer" | "coverage" | "equity" | "walkcycle";

type Tab = {
  id: string;
  label: string;
  kind: TabKind;
  persona?: PersonaId;
  domain?: DomainId;
  context?: ContextId;
};

const PERSONA_ORDER: PersonaId[] = ["family", "youngPro", "retiree", "student"];

export function PlaceProfileClient({
  place,
  homeBuyerPercentile = null,
  benchmarks = {},
  series = {},
  similar = [],
}: Props) {
  const weights = getDefaultWeights();
  const breakdown = computeWeightedScore(place, weights);
  const domains = [...V1_SCORED_DOMAINS];
  const measured = breakdown.components.filter((c) => !c.missing).length;

  const allSources = sourcesForIndicatorIds(
    domains.flatMap((d) =>
      Object.values(place.domains[d]?.subIndicators ?? {}).map((s) => s.sourceId)
    )
  );

  // Personas live in a dropdown (a "lens"), keeping the tab strip uncrowded.
  const personaTabs: Tab[] = PERSONA_ORDER.map((p): Tab => ({
    id: `persona-${p}`,
    label: PERSONA_PRESETS[p].label,
    kind: "persona",
    persona: p,
  }));

  // Tabs shown in the strip: overview, the scored domains, then context groups.
  const stripTabs: Tab[] = [
    { id: "overview", label: "Overview", kind: "overview" },
    ...domains.map(
      (d): Tab => ({
        id: `domain-${d}`,
        label: getDomain(d)?.label ?? d,
        kind: "domain",
        domain: d,
      })
    ),
    { id: "ctx-homebuyer", label: "Home buyer", kind: "context", context: "homebuyer" },
    { id: "ctx-walkcycle", label: "Walk & cycle", kind: "context", context: "walkcycle" },
    { id: "ctx-equity", label: "Equity & community", kind: "context", context: "equity" },
    { id: "ctx-coverage", label: "Data coverage", kind: "context", context: "coverage" },
  ];

  const allTabs = [...stripTabs, ...personaTabs];
  const [activeId, setActiveId] = useState("overview");
  const activeTab = allTabs.find((t) => t.id === activeId) ?? stripTabs[0];

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="flex items-center gap-3 border-b border-surface-border bg-surface px-4 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-sunken px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent"
        >
          ‹ Map
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <FeedbackButton context={`${place.name} - SA2 ${place.sa2Code}`} />
          <Link
            href="/"
            className="font-display text-base font-medium tracking-tight text-ink"
          >
            liveable<span className="text-accent">.</span>melbourne
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Score hero - persistent drawer header */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-surface-border bg-surface p-5 shadow-card">
          <ScoreBadge value={breakdown.total} size={78} caption="score" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-ink">
              {place.name}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              SA2 {place.sa2Code} · {place.lga} · default-weight liveability
            </p>
            {place.suburbAliases.length > 0 && (
              <p className="mt-1 text-xs text-ink-muted">
                Also known as: {place.suburbAliases.slice(0, 6).join(", ")}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="num rounded-full border border-surface-border bg-surface-sunken px-2.5 py-0.5 text-xs text-ink-muted">
              {measured}/{domains.length} domains measured
            </span>
            <ProfileEngagement slug={place.slug} name={place.name} />
          </div>
        </div>

        <div className="mt-5">
          <BuyerHereCard place={place} />
        </div>

        <div className="mt-5 flex items-end gap-3 border-b border-surface-border">
          <TabStrip tabs={stripTabs} activeId={activeId} onSelect={setActiveId} />
          <PersonaLens personas={personaTabs} activeId={activeId} onSelect={setActiveId} />
        </div>

        <section
          id={`panel-${activeTab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab.id}`}
          tabIndex={0}
          className="mt-5 rounded-lg focus-visible:outline-none"
        >
          {activeTab.kind === "overview" && (
            <OverviewPanel
              place={place}
              breakdown={breakdown}
              measured={measured}
              total={domains.length}
              series={series}
              onNavigate={setActiveId}
            />
          )}
          {activeTab.kind === "persona" && activeTab.persona && (
            <PersonaPanel place={place} persona={activeTab.persona} />
          )}
          {activeTab.kind === "domain" && activeTab.domain && (
            <DomainPanel
              place={place}
              domain={activeTab.domain}
              benchmarks={benchmarks}
              series={series}
            />
          )}
          {activeTab.kind === "context" && activeTab.context && (
            <ContextTabPanel
              place={place}
              context={activeTab.context}
              homeBuyerPercentile={homeBuyerPercentile}
            />
          )}
        </section>

        <div className="mt-6">
          <SourceDrawer sources={allSources} />
        </div>

        {similar.length > 0 && (
          <div className="mt-8 rounded-lg border border-surface-border bg-surface p-5 shadow-card">
            <SimilarAreasList items={similar} referenceName={place.name} />
          </div>
        )}

        <p className="mt-6 text-xs text-ink-muted">
          Not relocation or financial advice. The composite and persona scores are
          percentile ranks within Greater Melbourne presented as{" "}
          <b className="text-ink">optional lenses</b> - a data-access tool, not a
          definitive ranking of places. Context metrics are never folded into the
          locked seven-domain composite.
        </p>
      </main>
    </div>
  );
}

/* ----------------------------- Tab strip ------------------------------ */

function TabStrip({
  tabs,
  activeId,
  onSelect,
}: {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusTab = useCallback(
    (id: string) => {
      const btn = btnRefs.current[id];
      if (!btn) return;
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      btn.focus();
      btn.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        inline: "nearest",
        block: "nearest",
      });
    },
    []
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === activeId);
    if (i < 0) return;
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const id = tabs[next].id;
    onSelect(id);
    focusTab(id);
  };

  return (
    <div
      role="tablist"
      aria-label="Place profile sections"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-px [scrollbar-width:thin]"
    >
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            ref={(el) => {
              btnRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(t.id)}
            className={`shrink-0 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm transition-colors motion-reduce:transition-none ${
              active
                ? "border-accent font-semibold text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------- Persona lens --------------------------- */

function PersonaLens({
  personas,
  activeId,
  onSelect,
}: {
  personas: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const active = personas.find((p) => p.id === activeId);
  return (
    <div className="shrink-0 pb-1.5">
      <label htmlFor="persona-lens" className="sr-only">
        Persona lens
      </label>
      <select
        id="persona-lens"
        value={active?.id ?? ""}
        onChange={(e) => {
          if (e.target.value) onSelect(e.target.value);
        }}
        className={`rounded-lg border bg-surface px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          active
            ? "border-accent font-medium text-ink"
            : "border-surface-border text-ink-muted hover:border-accent hover:text-ink"
        }`}
      >
        <option value="">Persona lens…</option>
        {personas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ----------------------------- Overview ------------------------------- */

function OverviewPanel({
  place,
  breakdown,
  measured,
  total,
  series,
  onNavigate,
}: {
  place: Place;
  breakdown: ReturnType<typeof computeWeightedScore>;
  measured: number;
  total: number;
  series: Record<string, PlaceSeries>;
  onNavigate: (id: string) => void;
}) {
  const entryPoints: { id: string; label: string; blurb: string }[] = [
    { id: "ctx-homebuyer", label: "Home buyer index", blurb: "Buyer-oriented context lens (not scored)." },
    { id: "ctx-coverage", label: "Data coverage", blurb: "What we actually hold per domain." },
    { id: "ctx-walkcycle", label: "Walk & cycle", blurb: "15-min access + cyclability (context)." },
    { id: "ctx-equity", label: "Equity & community", blurb: "SEIFA, tenure, dwelling mix (context)." },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Score breakdown · default weights
        </h2>
        {breakdown.components.map((c) => {
          const cfg = getDomain(c.domain);
          return (
            <DomainBar
              key={c.domain}
              label={cfg?.label ?? c.domain}
              percentile={c.missing ? null : (c.percentile ?? null)}
              weight={c.weight}
            />
          );
        })}

        <Caveat className="mt-3">
          <b className="text-ink">One optional lens.</b> This composite is the
          default-weight blend of the seven scored domains, shown as percentile
          ranks within Greater Melbourne - not an authority on where to live. Open
          a persona tab to re-weight it, or a category tab for the underlying
          metrics. Outer-growth areas always rank low on transport.
        </Caveat>

        <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Explore context (never in the score)
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {entryPoints.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onNavigate(e.id)}
              className="rounded-lg border border-surface-border bg-surface p-3 text-left shadow-card transition-colors hover:border-accent"
            >
              <span className="block text-sm font-medium text-ink">{e.label} →</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{e.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <MiniMapCard />
        <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Key facts
          </h3>
          <Fact k="LGA" v={place.lga} />
          <Fact k="SA2 code" v={place.sa2Code} />
          <Fact k="Domains measured" v={`${measured}/${total}`} />
          {topAndBottom(place).map((f) => (
            <Fact key={f.k} k={f.k} v={f.v} swatch={f.pct} />
          ))}
        </div>
        <PopulationTrendCard series={series.population} />
      </div>
    </div>
  );
}

/* ----------------------------- Persona -------------------------------- */

function PersonaPanel({ place, persona }: { place: Place; persona: PersonaId }) {
  const preset = PERSONA_PRESETS[persona];
  const weights = personaWeights(persona);
  const breakdown = computeWeightedScore(place, weights);
  const weighted = breakdown.components; // domains with weight > 0
  const present = weighted.filter((c) => !c.missing).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-surface-border bg-surface p-4 shadow-card">
        <ScoreBadge value={breakdown.total} size={64} caption="lens score" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-medium text-ink">
            {preset.label} lens
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">{preset.description}</p>
        </div>
        <span className="num rounded-full border border-surface-border bg-surface-sunken px-2.5 py-0.5 text-xs text-ink-muted">
          {present}/{weighted.length} weighted domains with data
        </span>
      </div>

      <Caveat className="mt-3">
        <b className="text-ink">Optional lens, not an authority.</b> This re-weights
        the same seven scored domains toward {preset.label.toLowerCase()} priorities
        and renormalises across the domains we hold for this area. It is one way to
        read the data, not a definitive ranking.
      </Caveat>

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Factor breakdown (percentile · weight)
      </h3>
      {weighted.map((c) => {
        const cfg = getDomain(c.domain);
        return (
          <DomainBar
            key={c.domain}
            label={cfg?.label ?? c.domain}
            percentile={c.missing ? null : (c.percentile ?? null)}
            weight={c.weight}
          />
        );
      })}

      {present < weighted.length && (
        <p className="mt-2 text-xs text-ink-muted">
          {weighted.length - present} weighted domain(s) have no data for this SA2
          and are excluded from the lens score (present weights are renormalised).
        </p>
      )}
    </div>
  );
}

/* ----------------------------- Domain --------------------------------- */

function DomainPanel({
  place,
  domain,
  benchmarks,
  series,
}: {
  place: Place;
  domain: DomainId;
  benchmarks: GmBenchmarks;
  series: Record<string, PlaceSeries>;
}) {
  const cfg = getDomain(domain);
  const ds = place.domains[domain];
  const metrics = metricsForDomain(domain);
  const domainBenchmarks = benchmarks[domain] ?? {};

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-surface-border bg-surface p-4 shadow-card">
        <ScoreBadge value={ds?.percentile ?? null} size={58} caption="percentile" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-medium text-ink">
            {cfg?.label ?? domain}
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">{cfg?.description}</p>
        </div>
        <Link
          href={`/?layer=${domain}`}
          className="rounded-full border border-surface-border bg-surface-sunken px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent"
        >
          Show on map →
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {metrics.map((def) => (
          <MetricCard
            key={def.key}
            def={def}
            value={ds?.subIndicators?.[def.key]}
            benchmark={domainBenchmarks[def.key]}
            series={series[def.key]}
            mapHref={`/?layer=${domain}`}
          />
        ))}
      </div>

      {domain === "safety" && (
        <Caveat className="mt-4">
          <b className="text-ink">Crime caveat:</b> resident-population rates can
          overstate inner-city areas with large daytime worker/visitor populations,
          and offences are recorded at suburb/LGA level then allocated to this SA2
          via crosswalk - not resident point-level.
        </Caveat>
      )}

      {domain === "affordability" && (
        <Caveat className="mt-4">
          <b className="text-ink">Read this as cost-pressure, not price.</b> A high score
          means rent takes a small share of <b className="text-ink">local</b> incomes - so
          wealthy suburbs (Toorak, Brighton, Kew) can rank well despite high absolute rents,
          because residents earn more. It uses no sale or purchase prices.
        </Caveat>
      )}

      {domain === "education" && place.context?.community?.year12Pct != null && (
        <Caveat className="mt-4">
          <b className="text-ink">Attainment (context, not scored):</b>{" "}
          {place.context.community.year12Pct.toFixed(1)}% of residents completed Year 12 or
          equivalent (ABS Census 2021). The scored Education domain measures school &amp;
          preschool <i>access</i>, not attainment; university / postgraduate data is not in
          our current source.
        </Caveat>
      )}
    </div>
  );
}

/* ----------------------------- Context -------------------------------- */

function ContextTabPanel({
  place,
  context,
  homeBuyerPercentile,
}: {
  place: Place;
  context: ContextId;
  homeBuyerPercentile: number | null;
}) {
  if (context === "homebuyer") {
    return <HomeBuyerCard place={place} gmPercentile={homeBuyerPercentile} />;
  }
  if (context === "coverage") {
    return (
      <div className="space-y-4">
        <DataCoverageCard place={place} />
        <DataConfidenceCard confidence={place.dataConfidence} />
      </div>
    );
  }
  if (context === "walkcycle") {
    return (
      <div className="space-y-4">
        <WalkAccessPanel walkAccess={place.context?.walkAccess} />
        <CyclabilityPanel cyclability={place.context?.cyclability} />
      </div>
    );
  }
  return <ContextPanels context={place.context} />;
}

/* ----------------------------- Shared bits ---------------------------- */

function Caveat({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-surface-border border-l-[3px] border-l-accent bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-ink-muted ${className}`}
    >
      {children}
    </div>
  );
}

function Fact({
  k,
  v,
  swatch,
}: {
  k: string;
  v: string;
  swatch?: number | null;
}) {
  return (
    <div className="border-b border-surface-border py-2 last:border-0">
      <div className="text-xs text-ink-muted">{k}</div>
      <div className="mt-0.5 flex items-center gap-2">
        {swatch != null && (
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: percentileToColor(swatch) }}
          />
        )}
        <span className="num text-sm font-medium text-ink">{v}</span>
      </div>
    </div>
  );
}

function MiniMapCard() {
  return (
    <Link
      href="/"
      className="block overflow-hidden rounded-lg border border-surface-border shadow-card"
    >
      <div
        className="flex h-40 items-end p-3"
        style={{
          background: "linear-gradient(135deg, #eef1ee, #e7eae6 55%, #dfe3df)",
        }}
      >
        <span className="rounded-md bg-surface/80 px-2 py-1 text-[10px] uppercase tracking-wide text-ink-muted backdrop-blur">
          View SA2 on map →
        </span>
      </div>
    </Link>
  );
}

/**
 * Resident-population trend for the SA2 (ABS ERP series). The richest trend we
 * hold - annual, real SA2 geography - but it is not a scored domain metric, so
 * it renders here in Overview rather than on a domain card. Context only, never
 * folded into any score. The Sparkline states geography, period and any
 * boundary note.
 */
function PopulationTrendCard({ series }: { series?: PlaceSeries }) {
  if (!series || series.points.length < MIN_TREND_POINTS) return null;
  const latest = series.points[series.points.length - 1];
  const source = getSource(series.sourceId);
  const fmt = (v: number) => Math.round(v).toLocaleString("en-AU");
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Population trend
      </h3>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="num text-2xl font-semibold leading-none text-ink">
          {fmt(latest.value)}
        </span>
        <span className="text-[11px] text-ink-muted">people · {latest.period}</span>
      </div>
      <div className="overflow-x-auto">
        <Sparkline series={series} format={fmt} width={132} />
      </div>
      <p className="mt-2 border-t border-surface-border pt-2 text-[11px] text-ink-muted">
        <span>Source: </span>
        {source ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-accent"
          >
            {shortSourceName(source.name)}
          </a>
        ) : (
          <span>{series.sourceId}</span>
        )}{" "}
        · context only - not in the score.
      </p>
    </div>
  );
}

function topAndBottom(place: Place): { k: string; v: string; pct: number }[] {
  const scored = V1_SCORED_DOMAINS.map((d) => ({
    d,
    label: getDomain(d)?.label ?? d,
    pct: place.domains[d]?.percentile ?? null,
  })).filter(
    (x): x is { d: (typeof V1_SCORED_DOMAINS)[number]; label: string; pct: number } =>
      x.pct != null
  );
  if (scored.length === 0) return [];
  const sorted = [...scored].sort((a, b) => b.pct - a.pct);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const facts = [
    { k: "Strongest domain", v: `${top.label} (${top.pct.toFixed(0)})`, pct: top.pct },
  ];
  if (bottom.d !== top.d) {
    facts.push({
      k: "Lowest domain",
      v: `${bottom.label} (${bottom.pct.toFixed(0)})`,
      pct: bottom.pct,
    });
  }
  return facts;
}
