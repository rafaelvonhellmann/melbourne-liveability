"use client";

import { useEffect, useState } from "react";
import { fetchTreeCanopy, type TreeCanopy } from "@/lib/tree-canopy";

/**
 * Compact "tree canopy at this spot" card for the buyer report - a v2 greenery
 * lens, sibling to the urban-heat card (both from the Victorian Cooling &
 * Greening layers). Auto-fetches PERANYTREE at the pin; omits itself outside
 * metro coverage. Context only, never scored.
 */
const BAND_STYLE: Record<TreeCanopy["band"], { label: string; cls: string }> = {
  sparse: { label: "Sparse", cls: "border-[#b8a06a]/40 bg-[#f4efe2] text-[#7a5a00]" },
  moderate: { label: "Moderate", cls: "border-[#7fae57]/40 bg-[#eef5e6] text-[#4a6b2e]" },
  leafy: { label: "Leafy", cls: "border-[#1a9850]/40 bg-[#eaf5ea] text-[#1a6b39]" },
  "very leafy": { label: "Very leafy", cls: "border-[#117733]/50 bg-[#e0f0e2] text-[#0f5a2c]" },
};

export function TreeCanopyCard({ lng, lat }: { lng: number; lat: number }) {
  const [canopy, setCanopy] = useState<TreeCanopy | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "none">("loading");

  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    setStatus("loading");
    fetchTreeCanopy([lng, lat], { signal: ctrl.signal }).then((c) => {
      if (!live) return;
      setCanopy(c);
      setStatus(c ? "done" : "none");
    });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [lng, lat]);

  if (status === "none") return null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-medium text-ink">Tree canopy</h3>
        {status === "done" && canopy && (
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${BAND_STYLE[canopy.band].cls}`}
          >
            {BAND_STYLE[canopy.band].label} · {canopy.canopyPct.toFixed(1)}%
          </span>
        )}
      </div>
      {status === "loading" && <p className="mt-2 text-xs text-ink-muted">Checking tree canopy...</p>}
      {status === "done" && canopy && (
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          About <b className="text-ink">{canopy.canopyPct.toFixed(1)}%</b> of the area right around
          this spot sits under tree canopy (trees 3 m+). Greater Melbourne averages roughly 15%.
          Leafier streets are cooler in summer, shadier and generally more sought-after; sparse,
          paved areas run hotter. Snapshot: aerial-derived, 2018.{" "}
          <span className="text-ink-muted">
            &copy; State of Victoria (DTP), Vegetation Cover for Metropolitan Melbourne (CC BY 4.0).
          </span>
        </p>
      )}
    </div>
  );
}
