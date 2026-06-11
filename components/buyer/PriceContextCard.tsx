"use client";

import { useEffect, useState } from "react";
import {
  resolvePriceContext,
  yearTrend,
  latestQuarter,
  formatPriceShort,
  formatRentWeekly,
  trendChangePct,
  type ResolvedPriceContext,
  type TrendPoint,
} from "@/lib/price-context";

/**
 * "What do homes here sell and rent for" card for the buyer report - P1-6.
 * Resolves the suburb at the pin (area name first, else nearest suburb
 * centroid) against the baked VGV sale medians + DFFH rental medians
 * (lib/price-context). Omits itself when no suburb resolves. Context only -
 * NOT a valuation, never enters any score.
 */
function MedianRow({ label, trend }: { label: string; trend: TrendPoint[] }) {
  if (trend.length === 0) return null;
  const last = trend[trend.length - 1];
  const first = trend[0];
  const pct = trendChangePct(trend);
  return (
    <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
      {label}:{" "}
      <b className="num text-ink">
        {formatPriceShort(last.value)} ({last.period})
      </b>
      {trend.length >= 2 && pct !== null && (
        <>
          {" "}
          <span className="num">
            - from {formatPriceShort(first.value)} in {first.period} ({pct >= 0 ? "+" : ""}
            {pct}%)
          </span>
        </>
      )}
    </p>
  );
}

export function PriceContextCard({
  lng,
  lat,
  areaName,
  compact = false,
}: {
  lng: number;
  lat: number;
  /** Suburb/SA2 name at the pin if known (e.g. report.location.sa2Name). */
  areaName?: string | null;
  /** Live glimpse panel: medians only, no source/licence/vintage footer. */
  compact?: boolean;
}) {
  const [res, setRes] = useState<ResolvedPriceContext | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "none">("loading");

  useEffect(() => {
    let live = true;
    setStatus("loading");
    resolvePriceContext([lng, lat], areaName).then((r) => {
      if (!live) return;
      setRes(r);
      setStatus(r ? "done" : "none");
    });
    return () => {
      live = false;
    };
  }, [lng, lat, areaName]);

  // No suburb resolved (outside the baked metro set) - omit the card entirely.
  if (status !== "done" || !res) return null;

  const { entry, file } = res;
  const house = yearTrend(entry.houseMedianByYear, 5);
  const unit = yearTrend(entry.unitMedianByYear, 5);
  const rent = latestQuarter(entry.rentMedianByQuarter);
  if (house.length === 0 && unit.length === 0 && !rent) return null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-medium text-ink">Price context</h3>
        <span className="rounded-full border border-surface-border bg-surface-raised px-2.5 py-0.5 text-[11px] font-semibold text-ink-muted">
          {entry.suburb}
        </span>
      </div>
      {res.matchedBy === "nearest" && (
        <p className="mt-1 text-[11px] leading-snug text-ink-muted">
          Nearest suburb with data, ~{res.distanceKm} km from the pin.
        </p>
      )}
      <MedianRow label="House sale median" trend={house} />
      <MedianRow label="Unit sale median" trend={unit} />
      {rent && (
        <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
          Median rent (all properties):{" "}
          <b className="num text-ink">{formatRentWeekly(rent.value)}</b>{" "}
          <span className="num">(year to {rent.period}</span>
          {entry.rentArea && entry.rentArea !== entry.suburb && (
            <span>, {entry.rentArea} area</span>
          )}
          <span className="num">)</span>
        </p>
      )}
      {/* Source/licence/vintage footer - full report only (the live glimpse
          keeps its single not-advice line in the panel header). */}
      {!compact && (
        <p className="mt-2 text-[11px] leading-snug text-ink-muted">
          Context only - not a valuation. Suburb medians move with the handful of
          properties that actually sold or were let; they say nothing about any
          specific property. Valuer-General Victoria property sales (CC BY 4.0,
          houses as at {file.sources.house.period}, units as at{" "}
          {file.sources.unit.period}) and Homes Victoria / DFFH Rental Report (CC
          BY 4.0, as at {file.sources.rent.period}), via DataVic open data.
        </p>
      )}
    </div>
  );
}
