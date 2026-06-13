"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DomainId, Place } from "@/lib/types";
import { computeWeightedScore } from "@/lib/scoring";
import { getDefaultWeights } from "@/lib/weights";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import { buildAreaSummary } from "@/lib/area-summary";
import { getSource, shortSourceName } from "@/lib/sources";
import { DEFAULT_REGION, getRegion, type RegionId } from "@/lib/regions";
import { percentileToColor } from "@/lib/colors";
import { domainVerdict } from "@/lib/verdict";
import { metricsForDomain } from "@/lib/metric-catalog";
import type { GmBenchmarks, GmContext } from "@/lib/benchmarks";
import type { PlaceSeries } from "@/lib/timeseries";
import { MIN_TREND_POINTS } from "@/lib/timeseries";
import { Sparkline, TrendMethodNote } from "./Sparkline";
import { ScoreBadge, DomainBar } from "./ScoreVisuals";
import { MetricCard } from "./MetricCard";
import { ContextPanels } from "./ContextPanels";
import { WalkAccessPanel } from "./WalkAccessPanel";
import { CyclabilityPanel } from "./CyclabilityPanel";
import { DataConfidenceCard } from "./DataConfidenceCard";
import { DataCoverageCard } from "./DataCoverageCard";
import { HomeBuyerCard } from "./HomeBuyerCard";
import { IncomeAffordabilityCard } from "./IncomeAffordabilityCard";
import { AirQualityCard } from "./AirQualityCard";
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
  gmContext?: GmContext;
  series?: Record<string, PlaceSeries>;
  /** Closest peer areas by per-domain percentile similarity (precomputed at build). */
  similar?: SimilarAreaItem[];
  /** Region whose provenance manifest the trust drawer resolves source ids in
   * (profiles are melbourne-static today; the seam is ready for Wave 8). */
  region?: RegionId;
};

type TabKind = "overview" | "domain" | "context";
type ContextId = "homebuyer" | "coverage" | "equity" | "walkcycle";

type Tab = {
  id: string;
  label: string;
  kind: TabKind;
  domain?: DomainId;
  context?: ContextId;
};

export function PlaceProfileClient({
  place,
  homeBuyerPercentile = null,
  benchmarks = {},
  gmContext,
  series = {},
  similar = [],
  region = DEFAULT_REGION,
}: Props) {
  const weights = getDefaultWeights();
  const breakdown = computeWeightedScore(place, weights);
  const domains = [...V1_SCORED_DOMAINS];
  const measured = breakdown.components.filter((c) => !c.missing).length;
  const regionLabel = getRegion(region).label;

  // Trust drawer input: the ids resolve inside SourceDrawer against the
  // region's manifest (melbourne = bundled sources.json, unchanged).
  const sourceIds = domains.flatMap((d) =>
    Object.values(place.domains[d]?.subIndicators ?? {}).map((s) => s.sourceId)
  );

  // Tabs shown in the strip: overview, the scored domains, then context groups.
  // The persona lens dropdown that used to sit beside the strip is retired
  // (P1-11): areas in some metro regions are missing data, and a re-weighted
  // "persona score" misleads there. The map's interest-view lens
  // (lib/interest-views.ts) is the one lens system; legacy ?persona= links
  // resolve there via legacyPersonaToView.
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

  const [activeId, setActiveId] = useState("overview");
  const activeTab = stripTabs.find((t) => t.id === activeId) ?? stripTabs[0];

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="flex items-center gap-3 border-b border-surface-border bg-surface px-4 py-3">
        <Link
          href={`/?select=${place.slug}`}
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
            Festra
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
              {place.lga} council · default-weight liveability
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

        <div className="mt-5 border-b border-surface-border">
          <TabStrip tabs={stripTabs} activeId={activeId} onSelect={setActiveId} />
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
              regionLabel={regionLabel}
              onNavigate={setActiveId}
            />
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
              gmContext={gmContext}
            />
          )}
        </section>

        <div className="mt-6">
          <SourceDrawer sourceIds={sourceIds} region={region} />
        </div>

        {similar.length > 0 && (
          <div className="mt-8 rounded-lg border border-surface-border bg-surface p-5 shadow-card">
            <SimilarAreasList items={similar} referenceName={place.name} />
          </div>
        )}

        <p className="mt-6 text-xs text-ink-muted">
          Not relocation or financial advice. The composite score is a percentile
          rank within Greater Melbourne presented as an{" "}
          <b className="text-ink">optional lens</b> - a data-access tool, not a
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

/* ----------------------------- Overview ------------------------------- */

function OverviewPanel({
  place,
  breakdown,
  measured,
  total,
  series,
  regionLabel,
  onNavigate,
}: {
  place: Place;
  breakdown: ReturnType<typeof computeWeightedScore>;
  measured: number;
  total: number;
  series: Record<string, PlaceSeries>;
  regionLabel: string;
  onNavigate: (id: string) => void;
}) {
  const entryPoints: { id: string; label: string; blurb: string }[] = [
    { id: "ctx-homebuyer", label: "Home buyer index", blurb: "Buyer-oriented context lens (not scored)." },
    { id: "ctx-coverage", label: "Data coverage", blurb: "What we actually hold per domain." },
    { id: "ctx-walkcycle", label: "Walk & cycle", blurb: "15-min access + cyclability (context)." },
    { id: "ctx-equity", label: "Equity & community", blurb: "SEIFA, tenure, dwelling mix (context)." },
  ];

  // Trends render full-width below the score bars (more room than the 300px
  // rail). Only mount the section when at least one real >=3-point series exists,
  // so the heading never sits above an empty grid.
  const rentSeries = series.rentToIncomeMedianPct;
  const mortgageSeries = series.mortgageToIncomeMedianPct;
  const hasPopTrend =
    !!series.population && series.population.points.length >= MIN_TREND_POINTS;
  const hasAffTrend = [rentSeries, mortgageSeries].some(
    (s) => !!s && s.points.length >= MIN_TREND_POINTS
  );
  const hasAnyTrend = hasPopTrend || hasAffTrend;
  const areaSummary = buildAreaSummary(place);

  return (
    <div className="space-y-6">
      {areaSummary && (
        <div className="rounded-lg border border-surface-border bg-surface-sunken p-4">
          <h2 className="mb-1 text-xs font-semibold tracking-wide text-ink-muted">In brief</h2>
          <p className="text-sm leading-relaxed text-ink">{areaSummary}</p>
        </div>
      )}
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div>
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-ink-muted">
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
              verdict={domainVerdict(
                c.domain,
                c.missing ? null : (c.percentile ?? null),
                regionLabel
              )}
            />
          );
        })}

        <Caveat className="mt-3">
          <b className="text-ink">One optional lens.</b> This composite is the
          default-weight blend of the seven scored domains, shown as percentile
          ranks within Greater Melbourne - not an authority on where to live.
          Open a category tab for the underlying metrics, or re-weight the map
          itself with the Lens picker. Outer-growth areas always rank low on
          transport.
        </Caveat>

        <h3 className="mb-2 mt-5 text-xs font-semibold tracking-wide text-ink-muted">
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
        <MiniMapCard slug={place.slug} />
        <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted">
            Key facts
          </h3>
          <Fact k="Council" v={place.lga} />
          <Fact k="Area code (ABS SA2)" v={place.sa2Code} />
          <Fact k="Domains measured" v={`${measured}/${total}`} />
          {topAndBottom(place).map((f) => (
            <Fact key={f.k} k={f.k} v={f.v} swatch={f.pct} />
          ))}
        </div>
      </div>
    </div>

    {hasAnyTrend && (
      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-ink-muted">
          Trends over time{" "}
          <span className="font-normal normal-case">- context only, never in the score</span>
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <PopulationTrendCard series={series.population} />
          <AffordabilityTrendCard rent={rentSeries} mortgage={mortgageSeries} />
        </div>
      </section>
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
          href={`/?select=${place.slug}&layer=${domain}`}
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
            mapHref={`/?select=${place.slug}&layer=${domain}`}
          />
        ))}
      </div>

      {domain === "safety" && (
        <Caveat className="mt-4">
          <b className="text-ink">Crime caveat:</b> resident-population rates can
          overstate inner-city areas with large daytime worker/visitor populations,
          and offences are recorded at suburb / council level then allocated to this
          area via crosswalk - not resident point-level.
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

      {domain === "education" &&
        (place.context?.community?.year12Pct != null ||
          place.context?.community?.bachelorPlusPct != null) && (
          <Caveat className="mt-4">
            <b className="text-ink">Attainment (context, not scored):</b>{" "}
            {place.context.community.year12Pct != null && (
              <>
                {place.context.community.year12Pct.toFixed(1)}% of residents completed Year 12
                or equivalent.{" "}
              </>
            )}
            {place.context.community.bachelorPlusPct != null && (
              <>
                Among residents who hold a post-school qualification,{" "}
                {place.context.community.bachelorPlusPct.toFixed(1)}% hold a bachelor degree or
                higher
                {place.context.community.postgradPct != null
                  ? ` (${place.context.community.postgradPct.toFixed(1)}% a postgraduate degree)`
                  : ""}
                .{" "}
              </>
            )}
            ABS Census 2021. The scored Education domain measures school &amp; preschool{" "}
            <i>access</i>, not attainment.
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
  gmContext,
}: {
  place: Place;
  context: ContextId;
  homeBuyerPercentile: number | null;
  gmContext?: GmContext;
}) {
  if (context === "homebuyer") {
    return (
      <div className="space-y-4">
        <HomeBuyerCard place={place} gmPercentile={homeBuyerPercentile} />
        <IncomeAffordabilityCard place={place} />
      </div>
    );
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
  return (
    <div className="space-y-4">
      <ContextPanels context={place.context} gmContext={gmContext} />
      <AirQualityCard centroid={place.centroid as [number, number]} />
    </div>
  );
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

function MiniMapCard({ slug }: { slug: string }) {
  return (
    <Link
      href={`/?select=${slug}`}
      className="block overflow-hidden rounded-lg border border-surface-border shadow-card"
    >
      <div
        className="flex h-40 items-end p-3"
        style={{
          background: "linear-gradient(135deg, #eef1ee, #e7eae6 55%, #dfe3df)",
        }}
      >
        <span className="rounded-md bg-surface/80 px-2 py-1 text-[10px] tracking-wide text-ink-muted backdrop-blur">
          Show this area on the map &rarr;
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
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-ink-muted">
        Population trend
      </h3>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="num text-2xl font-semibold leading-none text-ink">
          {fmt(latest.value)}
        </span>
        <span className="text-[11px] text-ink-muted">people · {latest.period}</span>
      </div>
      <Sparkline series={series} format={fmt} fluid width={360} height={130} />
      <div className="mt-0.5 flex justify-between text-[10px] text-ink-muted">
        <span className="num">{series.points[0].period}</span>
        <span className="num">{latest.period}</span>
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
      <TrendMethodNote series={[series]} />
    </div>
  );
}

/**
 * Housing-affordability trend for the SA2 - ABS Census ratio of MEDIANS (median
 * housing cost / median income), 2011/2016/2021. A weaker affordability proxy
 * than a household >30%-stress share (labelled as such), and DISTINCT from the
 * scored "Rent vs income" domain card. Context only, never scored.
 */
function AffordabilityTrendCard({ rent, mortgage }: { rent?: PlaceSeries; mortgage?: PlaceSeries }) {
  const lines = [rent, mortgage].filter(
    (s): s is PlaceSeries => !!s && s.points.length >= MIN_TREND_POINTS
  );
  if (lines.length === 0) return null;
  const source = getSource(lines[0].sourceId);
  const fmt = (v: number) => `${Math.round(v)}%`;
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-ink-muted">
        Affordability trend (medians)
      </h3>
      {lines.map((s) => {
        const latest = s.points[s.points.length - 1];
        return (
          <div key={s.indicator} className="mt-2">
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-xs text-ink-muted">{s.label.replace(" (median)", "")}</span>
              <span className="num text-base font-semibold leading-none text-ink">{fmt(latest.value)}</span>
              <span className="text-[11px] text-ink-muted">· {latest.period}</span>
            </div>
            <Sparkline series={s} format={fmt} fluid width={360} height={42} />
          </div>
        );
      })}
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
          <span>{lines[0].sourceId}</span>
        )}{" "}
        · ratio of medians (cost / income), not a 30%-stress share · context only - not in the score.
      </p>
      {/* ONE note for the whole card - both lines share the same build method. */}
      <TrendMethodNote series={lines} />
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
