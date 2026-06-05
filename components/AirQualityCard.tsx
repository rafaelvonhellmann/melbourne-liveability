"use client";

import { useEffect, useState } from "react";
import { withBase } from "@/lib/asset-path";
import { nearestAirSite, type EpaAirSite, type NearestAirSite } from "@/lib/epa-air";

/**
 * Air quality on the area profile: the nearest EPA Victoria monitor to the area
 * centre + its last health-advice band. The AirWatch network is sparse and
 * readings are hourly while this site is static, so it's shown as a DATED
 * snapshot that always points to live AirWatch. Context only, never scored.
 * Loads the shipped sites file client-side (same file the map's Buyer Check uses).
 */
const BAND_DOT: Record<string, string> = {
  good: "#117733",
  "very good": "#117733",
  fair: "#E6AB02",
  moderate: "#E6AB02",
  poor: "#E31A1C",
  "very poor": "#8E1B16",
  hazardous: "#8E1B16",
};

export function AirQualityCard({ centroid }: { centroid: [number, number] }) {
  const [near, setNear] = useState<NearestAirSite | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(withBase("/data/epa-air-sites.json"))
      .then((r) => r.json())
      .then((j: { sites?: EpaAirSite[] }) => {
        if (!alive) return;
        setNear(nearestAirSite(centroid, j.sites));
        setDone(true);
      })
      .catch(() => {
        if (alive) setDone(true);
      });
    return () => {
      alive = false;
    };
  }, [centroid]);

  if (!done || !near) return null; // silent if the file is unavailable

  const km = near.distanceMeters / 1000;
  const dot = near.band ? BAND_DOT[near.band.toLowerCase()] ?? "#6B6862" : "#6B6862";
  const since = near.since ? near.since.slice(0, 10) : null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Air quality
        </h3>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-surface-border bg-surface-sunken px-2.5 py-0.5 text-[10px] text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-muted" aria-hidden />
          context only · not in score
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-b border-surface-border py-1.5 text-sm">
        <span className="text-ink-muted">Last reading</span>
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dot }} aria-hidden />
          {near.band ?? "no recent reading"}
          {near.param ? <span className="text-ink-muted">· {near.param}</span> : null}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        Nearest EPA monitor: <b className="text-ink">{near.name}</b>, about{" "}
        {km < 1 ? `${near.distanceMeters} m` : `${km.toFixed(1)} km`} away
        {since ? ` (read ${since})` : ""}. Air quality changes hour to hour - check live at{" "}
        <a
          href="https://www.airquality.epa.vic.gov.au/"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline decoration-dotted underline-offset-2"
        >
          EPA AirWatch
        </a>
        . The monitor can be several km away, so treat it as the regional reading, not this
        exact street.
      </p>
    </div>
  );
}
