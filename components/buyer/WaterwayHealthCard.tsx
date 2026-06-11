"use client";

import { useEffect, useState } from "react";
import { fetchWaterwayHealth, type WaterwayHealth } from "@/lib/water-quality";

/**
 * "Waterway health near this spot" card - a v2 Water-quality lens. Auto-fetches
 * the averaged Melbourne Water HWS stream-condition score for reaches within
 * ~1 km of the pin (lib/water-quality). Omits itself when there's no nearby
 * waterway + on failure. Context only, never scored.
 */
const BAND_STYLE: Record<WaterwayHealth["band"], { label: string; cls: string }> = {
  "very low": { label: "Very low", cls: "border-[#d73027]/40 bg-[#FBE3E0] text-[#9a241c]" },
  low: { label: "Low", cls: "border-[#E6671C]/40 bg-[#FCEBDD] text-[#9A4A12]" },
  moderate: { label: "Moderate", cls: "border-[#E6AB02]/40 bg-[#FBF3D8] text-[#7a5a00]" },
  high: { label: "High", cls: "border-[#1a9850]/40 bg-[#eaf5ea] text-[#1a6b39]" },
  "very high": { label: "Very high", cls: "border-[#117733]/50 bg-[#e0f0e2] text-[#0f5a2c]" },
};

export function WaterwayHealthCard({
  lng,
  lat,
  compact = false,
}: {
  lng: number;
  lat: number;
  /** Live glimpse panel: score + band only, no caveats or attribution. */
  compact?: boolean;
}) {
  const [health, setHealth] = useState<WaterwayHealth | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "none">("loading");

  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    setStatus("loading");
    fetchWaterwayHealth([lng, lat], { signal: ctrl.signal }).then((h) => {
      if (!live) return;
      setHealth(h);
      setStatus(h ? "done" : "none");
    });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [lng, lat]);

  if (status !== "done" || !health) return null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-medium text-ink">Waterway health</h3>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${BAND_STYLE[health.band].cls}`}>
          {BAND_STYLE[health.band].label} · {health.score}/100
        </span>
      </div>
      {compact ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          Creeks and rivers within ~1 km of this spot score{" "}
          <b className="text-ink">{health.score}/100</b> ({health.band}) for waterway health.
        </p>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          Creeks and rivers within ~1 km of this spot score <b className="text-ink">{health.score}/100</b>{" "}
          ({health.band}) on Melbourne Water&apos;s waterway-condition index. Inner-city and industrial
          reaches tend to score low; leafy upper-catchment creeks score higher - healthier waterways
          mean better local amenity and recreation. Modelled baseline (Healthy Waterways Strategy 2018),
          not a live water-quality reading.{" "}
          <span className="text-ink-muted">&copy; Melbourne Water (CC BY 3.0 AU).</span>
        </p>
      )}
    </div>
  );
}
