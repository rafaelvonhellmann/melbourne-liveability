"use client";

import { useEffect, useState } from "react";
import { fetchAircraftNoise, type AircraftNoise } from "@/lib/aircraft-noise";

/**
 * "Aircraft noise at this spot" card for the buyer report - a v2 lens. Auto-tests
 * whether the pin falls inside a mapped ANEF contour (Melbourne Airport / Avalon)
 * via lib/aircraft-noise. Omits itself for the common case (outside all contours)
 * + on failure. Context only, never scored.
 */
function tone(anef: number): string {
  if (anef >= 30) return "border-[#d73027]/40 bg-[#FBE3E0] text-[#9a241c]";
  if (anef >= 25) return "border-[#E6671C]/40 bg-[#FCEBDD] text-[#9A4A12]";
  return "border-[#E6AB02]/40 bg-[#FBF3D8] text-[#7a5a00]";
}

export function AircraftNoiseCard({ lng, lat }: { lng: number; lat: number }) {
  const [noise, setNoise] = useState<AircraftNoise | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "none">("loading");

  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    setStatus("loading");
    fetchAircraftNoise([lng, lat], { signal: ctrl.signal }).then((n) => {
      if (!live) return;
      setNoise(n);
      setStatus(n ? "done" : "none");
    });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [lng, lat]);

  // Common case (outside every contour) + loading + failure: show nothing. This
  // card only appears when the pin is genuinely inside a mapped ANEF contour.
  if (status !== "done" || !noise) return null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-medium text-ink">Aircraft noise</h3>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tone(noise.anef)}`}>
          ANEF {noise.anef}+
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        This spot is inside the <b className="text-ink">ANEF {noise.anef}</b> aircraft-noise contour
        for <b className="text-ink">{noise.airport}</b>. ANEF 20-25 means noticeable aircraft noise
        through the day; ANEF 25+ areas face acoustic-insulation requirements and limits on new homes
        under state planning policy. Most of Melbourne sits outside these contours.{" "}
        <span className="text-ink-muted">
          &copy; State of Victoria (DTP) / airport master plans - ANEF contours (CC BY 4.0).
        </span>
      </p>
    </div>
  );
}
