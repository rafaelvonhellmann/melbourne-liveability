"use client";

import Link from "next/link";
import type { Place, ScoreWeights } from "@/lib/types";
import { computeWeightedScore } from "@/lib/scoring";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import { getSource } from "@/lib/sources";
type ScoreBreakdownPanelProps = {
  place: Place;
  weights: ScoreWeights;
};

export function ScoreBreakdownPanel({ place, weights }: ScoreBreakdownPanelProps) {
  const breakdown = computeWeightedScore(place, weights);

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised/95 p-3 text-sm backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-100">{place.name}</h2>
          <p className="text-xs text-slate-500">{place.lga}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-emerald-300">
            {breakdown.total.toFixed(0)}
          </div>
          <div className="text-xs text-slate-500">liveability</div>
        </div>
      </div>
      {place.coverage != null && (
        <p className="mt-2 text-xs text-slate-500">
          Coverage: {Math.round(place.coverage * V1_SCORED_DOMAINS.length)}/
          {V1_SCORED_DOMAINS.length} domains
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {breakdown.components.map((c) => {
          const cfg = getDomain(c.domain);
          const ds = place.domains[c.domain];
          const first = ds ? Object.values(ds.subIndicators)[0] : undefined;
          const src = getSource(first?.sourceId);
          return (
            <li key={c.domain} className="border-t border-surface-border/50 pt-2">
              <div className="flex justify-between">
                <span>{cfg?.label ?? c.domain}</span>
                <span className={c.missing ? "text-slate-500" : "text-slate-200"}>
                  {c.missing ? "—" : c.percentile?.toFixed(0)}
                </span>
              </div>
              {!c.missing && (
                <p className="mt-1 text-xs text-slate-500">
                  Weight {c.weight}% · contributes {c.contribution.toFixed(1)}
                  {src && (
                    <>
                      {" · "}
                      {src.name.split(" — ")[0]}
                      {src.period ? ` (${src.period})` : ""}
                    </>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {place.domains.safety && (
        <p className="mt-2 text-xs text-amber-200/80">
          Crime rates can overstate inner-city areas with large daytime populations.
        </p>
      )}
      {place.slug && (
        <Link
          href={`/places/${place.slug}`}
          className="mt-3 inline-block text-xs text-emerald-400 hover:underline"
        >
          Full profile →
        </Link>
      )}
    </div>
  );
}
