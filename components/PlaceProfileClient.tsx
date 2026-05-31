"use client";

import { useState } from "react";
import Link from "next/link";
import type { Place } from "@/lib/types";
import { computeWeightedScore } from "@/lib/scoring";
import { getDefaultWeights } from "@/lib/weights";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import { getSource, sourcesForIndicatorIds } from "@/lib/sources";
import { percentileToColor } from "@/lib/colors";
import { ScoreBadge, DomainBar } from "./ScoreVisuals";
import { ContextPanels } from "./ContextPanels";
import { WalkAccessPanel } from "./WalkAccessPanel";
import { CyclabilityPanel } from "./CyclabilityPanel";
import { DataConfidenceCard } from "./DataConfidenceCard";
import { SourceDrawer } from "./SourceDrawer";
import { ProfileEngagement } from "./ProfileEngagement";

type Props = { place: Place };

export function PlaceProfileClient({ place }: Props) {
  const [comprehensive, setComprehensive] = useState(false);
  const weights = getDefaultWeights();
  const breakdown = computeWeightedScore(place, weights);
  const domains = [...V1_SCORED_DOMAINS];

  const measured = breakdown.components.filter((c) => !c.missing).length;

  const allSources = sourcesForIndicatorIds(
    domains.flatMap((d) =>
      Object.values(place.domains[d]?.subIndicators ?? {}).map((s) => s.sourceId)
    )
  );

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-surface-border bg-surface px-4 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-sunken px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent"
        >
          ‹ Map
        </Link>
        <Link
          href="/"
          className="ml-auto font-display text-base font-medium tracking-tight text-ink"
        >
          liveable<span className="text-accent">.</span>melbourne
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Score hero */}
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
              {measured}/{domains.length} indicators
            </span>
            <ProfileEngagement slug={place.slug} name={place.name} />
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
          {/* LEFT — breakdown, expands with mode */}
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Score breakdown
              </h2>
              <SegmentedToggle
                comprehensive={comprehensive}
                onChange={setComprehensive}
              />
            </div>

            {breakdown.components.map((c) => {
              const cfg = getDomain(c.domain);
              const ds = place.domains[c.domain];
              return (
                <div key={c.domain} className={comprehensive ? "mb-4" : "mb-2.5"}>
                  <DomainBar
                    label={cfg?.label ?? c.domain}
                    percentile={c.missing ? null : (c.percentile ?? null)}
                    weight={c.weight}
                  />
                  {comprehensive && ds && (
                    <div className="ml-1 border-l-2 border-surface-border pl-3 motion-safe:transition-all">
                      <div className="pl-1">
                        {Object.entries(ds.subIndicators).map(([key, ind]) => (
                          <SubIndicator key={key} name={key} ind={ind} />
                        ))}
                        {c.domain === "safety" && (
                          <Caveat>
                            <b className="text-ink">Crime caveat:</b> resident-population
                            rates can overstate inner-city areas with large daytime
                            worker/visitor populations.
                          </Caveat>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {!comprehensive ? (
              <div className="mt-2 rounded-lg border border-dashed border-surface-border bg-surface-sunken p-4">
                <p className="font-display text-base font-medium text-ink">
                  Want the full picture?
                </p>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-muted">
                  Switch to <b className="text-ink">Comprehensive</b> to reveal every
                  sub-indicator, the property/violent crime split, staleness flags, and
                  the Equity · Community · Politics context panels.
                </p>
                {place.domains.safety && (
                  <Caveat className="mt-3">
                    <b className="text-ink">Heads up:</b> percentiles are relative to
                    Greater Melbourne; outer-growth areas always rank low on transport.
                  </Caveat>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <ContextPanels context={place.context} />
                <WalkAccessPanel walkAccess={place.context?.walkAccess} />
                <CyclabilityPanel cyclability={place.context?.cyclability} />
                <DataConfidenceCard confidence={place.dataConfidence} />
              </div>
            )}
          </div>

          {/* RIGHT — map link + key facts; nearby + sources in comprehensive */}
          <div className="space-y-4">
            <MiniMapCard />
            <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Key facts
              </h3>
              <Fact k="LGA" v={place.lga} />
              <Fact k="SA2 code" v={place.sa2Code} />
              <Fact k="Indicators measured" v={`${measured}/${domains.length}`} />
              {topAndBottom(place).map((f) => (
                <Fact key={f.k} k={f.k} v={f.v} swatch={f.pct} />
              ))}
            </div>

            {comprehensive && place.context?.walkAccess && (
              <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Nearby (15-min walk)
                </h3>
                <p className="text-xs text-ink-muted">
                  {place.context.walkAccess.reachable} of{" "}
                  {place.context.walkAccess.total} everyday-amenity categories reachable.
                  See the walk-access panel for the breakdown.
                </p>
              </div>
            )}

            {comprehensive && allSources.length > 0 && (
              <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Sources
                </h3>
                <ul className="space-y-1.5">
                  {allSources.map((s) => (
                    <li key={s.id}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-2 text-xs text-ink-muted hover:text-accent"
                      >
                        <span className="truncate">{s.name.split(" — ")[0]}</span>
                        <span aria-hidden>↗</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <SourceDrawer sources={allSources} />
        </div>

        <p className="mt-6 text-xs text-ink-muted">
          Not relocation or financial advice. Scores are percentile ranks within
          Greater Melbourne only — a data-access tool, not a scoring engine for
          places.
        </p>
      </main>
    </div>
  );
}

function SegmentedToggle({
  comprehensive,
  onChange,
}: {
  comprehensive: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="inline-flex gap-0.5 rounded-full border border-surface-border bg-surface-sunken p-0.5"
      role="group"
      aria-label="Profile detail level"
    >
      <button
        type="button"
        aria-pressed={!comprehensive}
        onClick={() => onChange(false)}
        className={`rounded-full px-3 py-1 text-xs transition-colors ${
          !comprehensive
            ? "bg-surface font-semibold text-ink shadow-card"
            : "text-ink-muted hover:text-ink"
        }`}
      >
        Simple
      </button>
      <button
        type="button"
        aria-pressed={comprehensive}
        onClick={() => onChange(true)}
        className={`rounded-full px-3 py-1 text-xs transition-colors ${
          comprehensive
            ? "bg-accent font-semibold text-accent-ink"
            : "text-ink-muted hover:text-ink"
        }`}
      >
        Comprehensive
      </button>
    </div>
  );
}

function SubIndicator({
  name,
  ind,
}: {
  name: string;
  ind: import("@/lib/types").IndicatorValue;
}) {
  const src = getSource(ind.sourceId);
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-xs">
      <span className="flex-1 text-ink">
        {name}
        {ind.stale && (
          <span className="ml-1.5 inline-flex rounded-full border border-[#E9C8B4] bg-[#FBEEE6] px-1.5 py-0.5 text-[10px] text-[#9A552F]">
            stale{src?.period ? ` · ${src.period}` : ""}
          </span>
        )}
      </span>
      <span className="num w-20 text-right text-ink-muted">
        {ind.raw != null ? ind.raw.toFixed(2) : "—"}
      </span>
      <span className="h-1.5 w-16 overflow-hidden rounded bg-surface-sunken">
        <span
          className="block h-full rounded"
          style={{
            width: `${ind.percentile ?? 0}%`,
            background: percentileToColor(ind.percentile),
          }}
        />
      </span>
      <span className="num w-6 text-right text-ink">
        {ind.percentile != null ? ind.percentile.toFixed(0) : "—"}
      </span>
    </div>
  );
}

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
          background:
            "linear-gradient(135deg, #eef1ee, #e7eae6 55%, #dfe3df)",
        }}
      >
        <span className="rounded-md bg-surface/80 px-2 py-1 text-[10px] uppercase tracking-wide text-ink-muted backdrop-blur">
          View SA2 on map →
        </span>
      </div>
    </Link>
  );
}

function topAndBottom(place: Place): { k: string; v: string; pct: number }[] {
  const scored = V1_SCORED_DOMAINS.map((d) => ({
    d,
    label: getDomain(d)?.label ?? d,
    pct: place.domains[d]?.percentile ?? null,
  })).filter((x): x is { d: (typeof V1_SCORED_DOMAINS)[number]; label: string; pct: number } =>
    x.pct != null
  );
  if (scored.length === 0) return [];
  const sorted = [...scored].sort((a, b) => b.pct - a.pct);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const facts = [{ k: "Strongest domain", v: `${top.label} (${top.pct.toFixed(0)})`, pct: top.pct }];
  if (bottom.d !== top.d) {
    facts.push({
      k: "Lowest domain",
      v: `${bottom.label} (${bottom.pct.toFixed(0)})`,
      pct: bottom.pct,
    });
  }
  return facts;
}
