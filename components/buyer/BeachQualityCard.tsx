"use client";

import { useEffect, useState } from "react";
import { fetchNearestBeach, type NearestBeach } from "@/lib/beach-quality";

/**
 * "Nearest bay-beach swim quality" card - the second half of the v2 Water-quality
 * lens. Finds the nearest monitored beach within ~6 km of the pin (lib/beach-
 * quality) and shows its typical recent EPA Beach Report grade. Omits itself when
 * no beach is nearby (inland pins). Context only, never scored.
 */
const GRADE_STYLE: Record<NearestBeach["grade"], { cls: string }> = {
  Good: { cls: "border-[#1a9850]/40 bg-[#eaf5ea] text-[#1a6b39]" },
  Fair: { cls: "border-[#E6AB02]/40 bg-[#FBF3D8] text-[#7a5a00]" },
  Poor: { cls: "border-[#d73027]/40 bg-[#FBE3E0] text-[#9a241c]" },
};

export function BeachQualityCard({ lng, lat }: { lng: number; lat: number }) {
  const [beach, setBeach] = useState<NearestBeach | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "none">("loading");

  useEffect(() => {
    let live = true;
    fetchNearestBeach([lng, lat]).then((b) => {
      if (!live) return;
      setBeach(b);
      setStatus(b ? "done" : "none");
    });
    return () => {
      live = false;
    };
  }, [lng, lat]);

  // Only relevant near the water: omit if the nearest monitored beach is more
  // than ~2 km away (an inland pin doesn't need a beach card).
  if (status !== "done" || !beach || beach.distanceKm > 2) return null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-medium text-ink">Beach swim quality</h3>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${GRADE_STYLE[beach.grade].cls}`}>
          {beach.grade}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        Nearest monitored bay beach: <b className="text-ink">{beach.name}</b> (~{beach.distanceKm} km).
        Typical recent swim quality is <b className="text-ink">{beach.grade}</b> (median{" "}
        {beach.value} enterococci/100 mL over the last {beach.n} samples; latest {beach.date}). Good
        ≤40, Fair 41-200, Poor &gt;200 (NHMRC). This is measured sampling, not EPA&apos;s live
        rain-driven daily forecast - check the EPA Beach Report before swimming.{" "}
        <span className="text-ink-muted">&copy; EPA Victoria / DataVic (CC BY 4.0).</span>
      </p>
    </div>
  );
}
