"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { sunPosition } from "@/lib/sun";

/**
 * 3D sun/shadow context for a dropped pin. Renders the real building massing
 * around the property (City of Melbourne CC-BY 2020 building footprints,
 * extruded by their height) on a pitched MapLibre map, and lets the user drag
 * the time of day - the sun position (lib/sun) drives the map light so building
 * faces toward the sun are lit and the rest fall into shade, conveying which way
 * the sun comes from and what overshadows the spot.
 *
 * Honest scope: MapLibre shades faces by light direction; it does not cast true
 * ground shadows (that needs a dedicated engine). For an exact shadow simulation
 * at any date/time we deep-link to shademap.app. Buildings cover the City of
 * Melbourne council area (CBD, Southbank, Docklands, Carlton, Parkville, etc.);
 * outside it we show only the simulator link. Loaded only on demand (dynamic
 * import) so MapLibre stays out of the report's initial bundle.
 */
const COM_BUILDINGS_API =
  "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/2020-building-footprints/exports/geojson";

function buildingsUrl(lng: number, lat: number, metres = 350): string {
  const where = `within_distance(geo_shape, geom'POINT(${lng} ${lat})', ${metres}m)`;
  return `${COM_BUILDINGS_API}?select=structure_extrusion&where=${encodeURIComponent(where)}`;
}

function shademapUrl(lng: number, lat: number): string {
  return `https://shademap.app/@${lat.toFixed(5)},${lng.toFixed(5)},17z`;
}

type Season = "summer" | "winter";

export function SunShadowView({ lng, lat }: { lng: number; lat: number }) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no-buildings" | "error">("loading");
  const [hour, setHour] = useState(13);
  const [season, setSeason] = useState<Season>("summer");

  // Sun position for the chosen time, in the user's local clock (good enough for
  // a Melbourne property viewed locally; the linked simulator is exact).
  const now = useRef<{ year: number }>({ year: 0 });
  const sun = (() => {
    const year = now.current.year || 2026;
    const month = season === "summer" ? 11 : 5; // Dec (S-hemisphere summer) / Jun
    const date = new Date(year, month, 21, hour, 0, 0);
    return sunPosition(date, lat, lng);
  })();

  // One-time map setup + buildings fetch.
  useEffect(() => {
    now.current.year = new Date().getFullYear();
    if (!mapEl.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#e7eae6" } }],
        glyphs: undefined,
      },
      center: [lng, lat],
      zoom: 15.6,
      pitch: 58,
      bearing: -20,
      attributionControl: false,
    });
    mapRef.current = map;
    new maplibregl.Marker({ color: "#D97757" }).setLngLat([lng, lat]).addTo(map);

    map.on("load", async () => {
      try {
        const res = await fetch(buildingsUrl(lng, lat));
        const fc = (await res.json()) as FeatureCollection;
        const n = fc.features?.length ?? 0;
        if (!n) {
          setStatus("no-buildings");
          return;
        }
        map.addSource("blds", { type: "geojson", data: fc });
        map.addLayer({
          id: "blds-3d",
          type: "fill-extrusion",
          source: "blds",
          paint: {
            "fill-extrusion-color": "#c9d2c9",
            "fill-extrusion-height": ["coalesce", ["get", "structure_extrusion"], 6],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.92,
          },
        });
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    });
    map.on("error", () => setStatus((s) => (s === "ready" ? s : "error")));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lng, lat]);

  // Re-light the scene whenever the chosen time changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    const up = sun.altitudeDeg > 0;
    try {
      map.setLight({
        anchor: "map",
        color: up ? "#fff7e6" : "#9fa6b2",
        intensity: up ? Math.min(0.7, 0.25 + sun.altitudeDeg / 90) : 0.15,
        position: [1.15, sun.azimuthDeg, Math.max(2, 90 - sun.altitudeDeg)],
      });
    } catch {
      /* style may not be ready on the very first tick */
    }
  }, [sun.altitudeDeg, sun.azimuthDeg, status]);

  const sunUp = sun.altitudeDeg > 0;
  const dirLabel = ((): string => {
    const a = sun.azimuthDeg;
    if (a < 45 || a >= 315) return "north";
    if (a < 135) return "east";
    if (a < 225) return "south";
    return "west";
  })();

  return (
    <div className="overflow-hidden rounded-lg border border-surface-border">
      <div ref={mapEl} className="h-64 w-full bg-surface-sunken" aria-hidden />
      <div className="space-y-3 border-t border-surface-border bg-surface p-3">
        {status === "loading" && (
          <p className="text-xs text-ink-muted">Loading 3D buildings...</p>
        )}
        {status === "no-buildings" && (
          <p className="text-xs text-ink-muted">
            3D building heights aren&apos;t available here (they cover the City of Melbourne
            council area). Use the shadow simulator below for this address.
          </p>
        )}
        {status === "error" && (
          <p className="text-xs text-ink-muted">
            Couldn&apos;t load the 3D buildings just now. The shadow simulator below still works.
          </p>
        )}
        {status === "ready" && (
          <>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-ink">
                {sunUp
                  ? `Sun is in the ${dirLabel}, ${Math.round(sun.altitudeDeg)}° up`
                  : "Sun is below the horizon"}
              </span>
              <div className="flex gap-1">
                {(["summer", "winter"] as Season[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeason(s)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                      season === s
                        ? "bg-accent text-white"
                        : "border border-surface-border text-ink-muted hover:border-accent"
                    }`}
                  >
                    {s === "summer" ? "Summer" : "Winter"}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-[11px] text-ink-muted" htmlFor="sun-hour">
              Time of day: {String(hour).padStart(2, "0")}:00
            </label>
            <input
              id="sun-hour"
              type="range"
              min={4}
              max={21}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </>
        )}
        <p className="text-[11px] leading-snug text-ink-muted">
          3D massing shaded by sun direction (lit faces point at the sun) - it shows where the
          sun comes from and what blocks it, not exact cast shadows. Buildings &copy; City of
          Melbourne (CC BY 4.0).{" "}
          <a
            href={shademapUrl(lng, lat)}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent hover:underline"
          >
            Open the exact shadow simulator &rarr;
          </a>
        </p>
      </div>
    </div>
  );
}
