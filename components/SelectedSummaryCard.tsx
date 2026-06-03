"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { X, Search } from "lucide-react";
import type { Place, ScoreWeights } from "@/lib/types";
import { computeWeightedScore } from "@/lib/scoring";
import { getDomain } from "@/lib/domains";
import { percentileToColor, percentileWord } from "@/lib/colors";
import { findSimilarAreas, toSimilarItems } from "@/lib/similar-areas";
import { ScoreBadge } from "./ScoreVisuals";
import { AddToShortlistButton } from "./AddToShortlistButton";
import { SimilarAreasList } from "./SimilarAreasList";

type SelectedSummaryCardProps = {
  place: Place;
  weights: ScoreWeights;
  /** All loaded areas - source for the "find areas like this" peer match. */
  places?: Place[];
  /** Human label of the layer currently painted on the choropleth. */
  activeLayerLabel: string;
  onClose: () => void;
  onShortlistChange?: (slugs: string[]) => void;
  className?: string;
};

/**
 * Lightweight map-side quick view for the selected SA2. Deliberately compact
 * (name, composite match score for the current priorities, the strongest
 * driver, and quick actions) - the full profile lives on its own page, and a
 * richer drawer is a separate later task, so this never imports the heavy
 * profile client.
 */
export function SelectedSummaryCard({
  place,
  weights,
  places = [],
  activeLayerLabel,
  onClose,
  onShortlistChange,
  className,
}: SelectedSummaryCardProps) {
  const breakdown = computeWeightedScore(place, weights);
  const [showSimilar, setShowSimilar] = useState(false);

  // Peer match is equal-weighted + deterministic; compute only when revealed (and
  // memoise so re-renders from hover/selection don't re-rank ~354 areas).
  const similar = useMemo(
    () => (showSimilar ? toSimilarItems(findSimilarAreas(place, places, { limit: 5 })) : []),
    [showSimilar, place, places]
  );

  // Plain-language read of the user's top-priority categories (feedback: lead
  // with words, not bare numbers). Highest-weighted present domains first.
  const topDomains = [...breakdown.components]
    .filter((c) => !c.missing)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  return (
    <div
      className={`rounded-lg border border-surface-border bg-surface p-3 shadow-card ${
        className ?? ""
      }`}
      role="region"
      aria-label={`Selected area: ${place.name}`}
    >
      <div className="flex items-start gap-3">
        <ScoreBadge value={breakdown.total} size={50} caption="match" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-display text-base font-medium leading-tight text-ink">
                {place.name}
              </h3>
              <p className="truncate text-xs text-ink-muted">{place.lga}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 -mt-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-sunken hover:text-accent"
              aria-label="Close - back to the map"
            >
              <X className="h-4 w-4" aria-hidden />
              <span className="md:hidden">Close</span>
            </button>
          </div>
          {topDomains.length > 0 && (
            <ul className="mt-1.5 space-y-1" aria-label="Your top priorities here">
              {topDomains.map((c) => (
                <li
                  key={c.domain}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-ink-muted">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: percentileToColor(c.percentile) }}
                      aria-hidden
                    />
                    <span className="truncate">
                      {getDomain(c.domain)?.label ?? c.domain}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-ink">
                    {percentileWord(c.percentile)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[11px] text-ink-muted">
            Showing on map: {activeLayerLabel}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/places/${place.slug}`}
          className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Full profile →
        </Link>
        <AddToShortlistButton
          slug={place.slug}
          onShortlistChange={onShortlistChange}
        />
      </div>

      <p className="mt-2 text-[11px] leading-snug text-ink-muted">
        “Match” reflects your priorities, not a single objective score.
      </p>

      {places.length > 0 && (
        <div className="mt-3 border-t border-surface-border pt-3">
          <button
            type="button"
            onClick={() => setShowSimilar((v) => !v)}
            aria-expanded={showSimilar}
            className="inline-flex items-center gap-1.5 rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent"
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
            {showSimilar ? "Hide similar areas" : "Find areas like this"}
          </button>
          {showSimilar && (
            <div className="mt-3">
              <SimilarAreasList items={similar} referenceName={place.name} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
