"use client";

import Link from "next/link";
import type { Place, ScoreWeights } from "@/lib/types";
import { computeWeightedScore } from "@/lib/scoring";

type RankedPlace = Place & { total: number };

type ResultsListProps = {
  places: Place[];
  weights: ScoreWeights;
  limit?: number;
};

export function ResultsList({ places, weights, limit = 15 }: ResultsListProps) {
  const ranked: RankedPlace[] = places
    .filter((p) => !p.nonResidential)
    .map((p) => ({ ...p, total: computeWeightedScore(p, weights).total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return (
    <ol className="space-y-1 text-sm" aria-label="Ranked places">
      {ranked.map((p, i) => (
        <li key={p.sa2Code}>
          <Link
            href={`/places/${p.slug}`}
            className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-surface-border/40"
          >
            <span>
              <span className="mr-2 text-slate-500">{i + 1}.</span>
              {p.name}
            </span>
            <span className="font-medium text-emerald-300">
              {p.total.toFixed(0)}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
