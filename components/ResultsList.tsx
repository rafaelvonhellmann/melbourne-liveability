"use client";

import Link from "next/link";
import type { Place, ScoreWeights } from "@/lib/types";
import { computeWeightedScore } from "@/lib/scoring";
import { percentileToColor, percentileTextColor } from "@/lib/colors";

type RankedPlace = Place & { total: number };

type ResultsListProps = {
  places: Place[];
  weights: ScoreWeights;
  limit?: number;
  /** When provided, rows select in place (panel swap) instead of navigating. */
  onSelect?: (place: Place) => void;
  selectedSlug?: string;
};

export function ResultsList({
  places,
  weights,
  limit = 15,
  onSelect,
  selectedSlug,
}: ResultsListProps) {
  const ranked: RankedPlace[] = places
    .filter((p) => !p.nonResidential)
    .map((p) => ({ ...p, total: computeWeightedScore(p, weights).total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return (
    <ol aria-label="Ranked places">
      {ranked.map((p, i) => {
        const score = p.total;
        const pill = (
          <>
            <span className="num w-5 shrink-0 text-xs text-ink-muted">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">
                {p.name}
              </span>
              <span className="block truncate text-xs text-ink-muted">{p.lga}</span>
            </span>
            <span
              className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
              style={{
                background: percentileToColor(score),
                color: percentileTextColor(score),
              }}
            >
              {score.toFixed(0)}
            </span>
          </>
        );

        const rowClass = `flex w-full items-center gap-3 border-b border-surface-border px-4 py-2.5 text-left transition-colors hover:bg-surface-sunken ${
          selectedSlug === p.slug ? "bg-surface-sunken" : ""
        }`;

        return (
          <li key={p.sa2Code}>
            {onSelect ? (
              <button type="button" className={rowClass} onClick={() => onSelect(p)}>
                {pill}
              </button>
            ) : (
              <Link href={`/places/${p.slug}`} className={rowClass}>
                {pill}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
