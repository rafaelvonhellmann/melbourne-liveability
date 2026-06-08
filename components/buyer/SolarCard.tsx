"use client";

import { MELBOURNE_SOLAR, estimateAnnualKwh, optimalTiltDeg } from "@/lib/solar";

/**
 * "Rooftop solar" card - a v2 lens. Presents the BoM Melbourne solar climatology
 * + a generation estimate, and is honest that it's a regional figure (near-
 * uniform across the metro) - the per-property variables (orientation + shading)
 * live in the Sun & shadow check. Pure/static (no fetch). Context only.
 */
export function SolarCard({ lat }: { lat: number }) {
  const annual = estimateAnnualKwh(6.6);
  const tilt = optimalTiltDeg(lat);
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-medium text-ink">Rooftop solar</h3>
        <span className="rounded-full border border-[#E6AB02]/40 bg-[#FBF3D8] px-2.5 py-0.5 text-[11px] font-semibold text-[#7a5a00]">
          ~{MELBOURNE_SOLAR.peakSunHours} sun-hrs/day
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        Melbourne gets about <b className="text-ink">{MELBOURNE_SOLAR.mjPerDay} MJ/m²/day</b> of sun
        a year (≈{MELBOURNE_SOLAR.peakSunHours} peak-sun-hours/day) - among the sunnier capitals for
        solar. A typical <b className="text-ink">6.6 kW</b> rooftop system here makes roughly{" "}
        <b className="text-ink">{annual.toLocaleString()} kWh/year</b> (north-facing, lightly shaded;
        ~{tilt}° tilt is about optimal at this latitude). This is a regional figure - it barely
        changes across the metro. What actually moves a roof&apos;s output is orientation (north is
        best) and shading - use the <b className="text-ink">Sun &amp; light</b> check above to see
        this exact spot&apos;s winter and summer sun.{" "}
        <span className="text-ink-muted">Solar exposure: Bureau of Meteorology.</span>
      </p>
    </div>
  );
}
