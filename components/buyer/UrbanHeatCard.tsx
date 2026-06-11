"use client";

import { useEffect, useState } from "react";
import { fetchUrbanHeat, type UrbanHeat } from "@/lib/urban-heat";

/**
 * Compact "urban heat at this spot" card for the buyer report - a v2 Environment
 * lens. Auto-fetches the land-surface-temperature uplift at the pin from the
 * Victorian Cooling & Greening layer (lib/urban-heat). Omits itself when the
 * point isn't covered (outside metro Melbourne) or the lookup fails. Context
 * only, never scored.
 */
const BAND_STYLE: Record<UrbanHeat["band"], { label: string; cls: string }> = {
  cooler: { label: "Cooler", cls: "border-[#1a9850]/40 bg-[#eaf5ea] text-[#1a6b39]" },
  moderate: { label: "Moderate", cls: "border-[#E6AB02]/40 bg-[#FBF3D8] text-[#7a5a00]" },
  hot: { label: "Hot", cls: "border-[#E6671C]/40 bg-[#FCEBDD] text-[#9A4A12]" },
  "very hot": { label: "Very hot", cls: "border-[#d73027]/40 bg-[#FBE3E0] text-[#9a241c]" },
};

export function UrbanHeatCard({
  lng,
  lat,
  compact = false,
}: {
  lng: number;
  lat: number;
  /** Live glimpse panel: drop attribution, snapshot vintage + methodology caveat. */
  compact?: boolean;
}) {
  const [heat, setHeat] = useState<UrbanHeat | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "none">("loading");

  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    setStatus("loading");
    fetchUrbanHeat([lng, lat], { signal: ctrl.signal }).then((h) => {
      if (!live) return;
      setHeat(h);
      setStatus(h ? "done" : "none");
    });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [lng, lat]);

  // No data here (outside the metro heat layer) - omit the card entirely.
  if (status === "none") return null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-medium text-ink">Urban heat</h3>
        {status === "done" && heat && (
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${BAND_STYLE[heat.band].cls}`}
          >
            {BAND_STYLE[heat.band].label} · +{heat.uhiC.toFixed(1)}°C
          </span>
        )}
      </div>
      {status === "loading" && <p className="mt-2 text-xs text-ink-muted">Checking urban heat...</p>}
      {status === "done" && heat && (
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          On a hot summer day, surfaces around this spot run about{" "}
          <b className="text-ink">+{heat.uhiC.toFixed(1)}°C</b> hotter than leafy, vegetated land
          {compact ? (
            "."
          ) : (
            <>
              {" "}
              (land-<i>surface</i> temperature, not air temperature). Leafier streets and tree
              canopy keep a street cooler; bare roofs, roads and car parks run hotter - it shapes
              summer comfort and cooling costs. Snapshot: Landsat-derived, 2018.{" "}
              <span className="text-ink-muted">
                &copy; State of Victoria (DTP), Cooling &amp; Greening Melbourne (CC BY 4.0).
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
