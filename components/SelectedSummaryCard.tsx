"use client";

import Link from "next/link";
import { X } from "lucide-react";
import type { Place, ScoreWeights } from "@/lib/types";
import { computeWeightedScore } from "@/lib/scoring";
import { getDomain } from "@/lib/domains";
import { ScoreBadge } from "./ScoreVisuals";
import { AddToShortlistButton } from "./AddToShortlistButton";

type SelectedSummaryCardProps = {
  place: Place;
  weights: ScoreWeights;
  /** Human label of the layer currently painted on the choropleth. */
  activeLayerLabel: string;
  onClose: () => void;
  onShortlistChange?: (slugs: string[]) => void;
  className?: string;
};

/**
 * Lightweight map-side quick view for the selected SA2. Deliberately compact
 * (name, composite match score for the current priorities, the strongest
 * driver, and quick actions) — the full profile lives on its own page, and a
 * richer drawer is a separate later task, so this never imports the heavy
 * profile client.
 */
export function SelectedSummaryCard({
  place,
  weights,
  activeLayerLabel,
  onClose,
  onShortlistChange,
  className,
}: SelectedSummaryCardProps) {
  const breakdown = computeWeightedScore(place, weights);

  // Top driver = the present component contributing most to the composite.
  const topDriver = breakdown.components
    .filter((c) => !c.missing)
    .reduce<(typeof breakdown.components)[number] | null>(
      (best, c) => (best == null || c.contribution > best.contribution ? c : best),
      null
    );
  const topDriverLabel = topDriver
    ? (getDomain(topDriver.domain)?.label ?? topDriver.domain)
    : null;

  return (
    <div
      className={`rounded-lg border border-surface-border bg-surface/97 p-3 shadow-card backdrop-blur ${
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
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:text-accent"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {topDriverLabel && topDriver && (
            <p className="mt-1 text-xs text-ink-muted">
              Top driver:{" "}
              <span className="font-medium text-ink">{topDriverLabel}</span>{" "}
              <span className="num">({Math.round(topDriver.percentile ?? 0)})</span>
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-ink-muted">
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
    </div>
  );
}
