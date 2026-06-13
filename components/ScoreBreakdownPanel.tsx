"use client";

import Link from "next/link";
import type { Place, ScoreWeights } from "@/lib/types";
import { computeWeightedScore } from "@/lib/scoring";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import { DEFAULT_REGION, getRegion } from "@/lib/regions";
import { domainVerdict } from "@/lib/verdict";
import { ScoreBadge, DomainBar } from "./ScoreVisuals";

type ScoreBreakdownPanelProps = {
  place: Place;
  weights: ScoreWeights;
};

export function ScoreBreakdownPanel({ place, weights }: ScoreBreakdownPanelProps) {
  const breakdown = computeWeightedScore(place, weights);
  const regionLabel = getRegion(DEFAULT_REGION).label;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 text-sm shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-medium leading-tight text-ink">
            {place.name}
          </h2>
          <p className="text-xs text-ink-muted">{place.lga}</p>
          {place.coverage != null && (
            <p className="num mt-1 text-xs text-ink-muted">
              {Math.round(place.coverage * V1_SCORED_DOMAINS.length)}/
              {V1_SCORED_DOMAINS.length} indicators
            </p>
          )}
        </div>
        <ScoreBadge value={breakdown.total} size={58} caption="score" />
      </div>

      <div className="mt-4">
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted">
          Score breakdown
        </h3>
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
      </div>

      {place.domains.safety && (
        <p className="mt-1 rounded-lg border border-surface-border border-l-[3px] border-l-accent bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-ink-muted">
          <span className="font-medium text-ink">Crime caveat:</span> resident-population
          rates can overstate inner-city areas with large daytime populations.
        </p>
      )}

      {place.slug && (
        <Link
          href={`/places/${place.slug}`}
          className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
        >
          Full profile →
        </Link>
      )}
    </div>
  );
}
