"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { sunPosition } from "@/lib/sun";
import { timeoutSignal } from "@/lib/fetch-timeout";

/**
 * Sun & shadow check for a dropped pin - the Northlight differentiator.
 *
 * Renders the real building massing around the property (City of Melbourne
 * CC-BY 2020 building footprints, extruded by height) on a pitched MapLibre map,
 * AND projects each building's REAL cast shadow onto the ground for the chosen
 * date/time: shadow length = height / tan(sun altitude), direction = the
 * anti-solar bearing (lib/sun sunPosition). The pin is flagged in sun or in
 * shade. Geometry only (turf) - no 3D engine - so it is static-export safe.
 *
 * Coverage: building heights exist only for the City of Melbourne council area
 * (CBD, Southbank, Docklands, Carlton, Parkville, ...). Elsewhere we show the
 * sun-path summary + a deep-link to shademap.app. Loaded on demand (dynamic
 * import) so MapLibre + turf stay out of the report's initial bundle.
 */
const COM_BUILDINGS_API =
  "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/2020-building-footprints/exports/geojson";

function buildingsUrl(lng: number, lat: number, metres = 320): string {
  const where = `within_distance(geo_shape, geom'POINT(${lng} ${lat})', ${metres}m)`;
  return `${COM_BUILDINGS_API}?select=structure_extrusion&where=${encodeURIComponent(where)}`;
}

function shademapUrl(lng: number, lat: number): string {
  return `https://shademap.app/@${lat.toFixed(5)},${lng.toFixed(5)},17z`;
}

const RAD = Math.PI / 180;

/**
 * Project each building footprint to its cast-shadow polygon on flat ground at
 * the given sun position. The shadow of a vertical prism on the ground is the
 * convex hull of the footprint and the footprint translated by the shadow
 * vector (length = height/tan(altitude), bearing = anti-solar). Pure; returns an
 * empty collection when the sun is low/below the horizon (no meaningful shadow).
 */
function computeShadows(
  fc: FeatureCollection,
  azimuthDeg: number,
  altitudeDeg: number,
  refLat: number
): FeatureCollection {
  if (altitudeDeg <= 2) return turf.featureCollection([]);
  const ratio = Math.min(1 / Math.tan(altitudeDeg * RAD), 25); // shadow length per metre, capped
  const antiAz = (azimuthDeg + 180) % 360;
  const sinB = Math.sin(antiAz * RAD);
  const cosB = Math.cos(antiAz * RAD);
  const mPerDegLat = 110574;
  const mPerDegLng = 111320 * Math.cos(refLat * RAD);
  const out: Feature<Polygon>[] = [];
  for (const f of fc.features) {
    const h = Number((f.properties as { structure_extrusion?: number } | null)?.structure_extrusion) || 6;
    const L = h * ratio; // metres
    const dLat = (L * cosB) / mPerDegLat;
    const dLng = (L * sinB) / mPerDegLng;
    const g = f.geometry as Polygon | MultiPolygon | null;
    if (!g) continue;
    const rings: number[][][] =
      g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : [];
    for (const ring of rings) {
      if (!ring || ring.length < 3) continue;
      const pts = [];
      for (const c of ring) {
        pts.push(turf.point([c[0], c[1]]));
        pts.push(turf.point([c[0] + dLng, c[1] + dLat]));
      }
      const hull = turf.convex(turf.featureCollection(pts));
      if (hull) out.push(hull);
    }
  }
  return turf.featureCollection(out);
}

type Season = "summer" | "winter";

export function SunShadowView({ lng, lat }: { lng: number; lat: number }) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const buildingsRef = useRef<FeatureCollection | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no-buildings" | "error">("loading");
  const [hour, setHour] = useState(13);
  const [season, setSeason] = useState<Season>("summer");
  const [pinShaded, setPinShaded] = useState<boolean | null>(null);

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
      // Tile-free style: a plain background so the map "load" event fires
      // immediately (no basemap tiles to wait on / be CSP-blocked).
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#eceeea" } }],
      },
      center: [lng, lat],
      zoom: 16,
      pitch: 55,
      bearing: -20,
      attributionControl: false,
    });
    mapRef.current = map;
    // Decorative canvas: keep it out of the tab order + AT tree (WCAG 4.1.2).
    map.getCanvas().setAttribute("tabindex", "-1");
    map.getCanvas().setAttribute("aria-hidden", "true");
    new maplibregl.Marker({ color: "#D97757" }).setLngLat([lng, lat]).addTo(map);

    const addBuildings = (fc: FeatureCollection) => {
      if (map.getSource("blds")) return;
      buildingsRef.current = fc;
      // Ground-shadow fill, drawn under the buildings (data set by the sun effect).
      map.addSource("shadows", { type: "geojson", data: turf.featureCollection([]) });
      map.addSource("blds", { type: "geojson", data: fc });
      map.addLayer({
        id: "shadow-fill",
        type: "fill",
        source: "shadows",
        paint: { "fill-color": "#0f130d", "fill-opacity": 0.28 },
      });
      map.addLayer({
        id: "blds-3d",
        type: "fill-extrusion",
        source: "blds",
        paint: {
          "fill-extrusion-color": "#cfd6cd",
          "fill-extrusion-height": ["coalesce", ["get", "structure_extrusion"], 6],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.95,
        },
      });
    };
    // Fetch buildings immediately (not gated on the flaky "load" event); apply
    // once the style is parsed. Time-bounded + unmount-guarded.
    let cancelled = false;
    (async () => {
      // The CoM export API is a live endpoint with variable latency (≈1-12s),
      // not a static asset - give it a generous bound so a slow-but-fine
      // response isn't aborted as a false timeout.
      const t = timeoutSignal(20000);
      try {
        const res = await fetch(buildingsUrl(lng, lat), { signal: t.signal });
        const fc = (await res.json()) as FeatureCollection;
        if (cancelled) return;
        if (!(fc.features?.length)) {
          setStatus("no-buildings");
          return;
        }
        let tries = 0;
        const tryApply = () => {
          if (cancelled || !mapRef.current) return;
          if (map.isStyleLoaded()) {
            try {
              addBuildings(fc);
              setStatus("ready");
            } catch {
              setStatus("error");
            }
            return;
          }
          if (++tries > 50) {
            setStatus("error");
            return;
          }
          setTimeout(tryApply, 150);
        };
        tryApply();
      } catch {
        if (!cancelled) setStatus("error");
      } finally {
        t.clear();
      }
    })();
    map.on("error", (e) => console.warn("SunShadowView map:", e?.error?.message ?? e));

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, [lng, lat]);

  // Recompute cast shadows + the map light whenever the chosen time changes.
  // Debounced so dragging the slider stays smooth across ~hundreds of buildings.
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
      /* style not ready on the very first tick */
    }
    const handle = setTimeout(() => {
      if (!mapRef.current || !buildingsRef.current) return;
      const shadows = computeShadows(buildingsRef.current, sun.azimuthDeg, sun.altitudeDeg, lat);
      const src = map.getSource("shadows") as maplibregl.GeoJSONSource | undefined;
      src?.setData(shadows);
      const pt = turf.point([lng, lat]);
      setPinShaded(
        up && shadows.features.some((p) => turf.booleanPointInPolygon(pt, p as Feature<Polygon>))
      );
    }, 70);
    return () => clearTimeout(handle);
  }, [sun.altitudeDeg, sun.azimuthDeg, status, lng, lat]);

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
      <div
        ref={mapEl}
        className="h-64 w-full bg-surface-sunken"
        role="img"
        aria-label="Buildings around the pin with their cast shadows at the chosen time of day"
      />
      <div className="space-y-3 border-t border-surface-border bg-surface p-3">
        {status === "loading" && (
          <p className="text-xs text-ink-muted">Loading buildings + shadows (a few seconds)...</p>
        )}
        {status === "no-buildings" && (
          <p className="text-xs text-ink-muted">
            Building heights aren&apos;t available here (they cover the City of Melbourne council
            area). Use the shadow simulator below for this address.
          </p>
        )}
        {status === "error" && (
          <p className="text-xs text-ink-muted">
            Couldn&apos;t load the buildings just now. The shadow simulator below still works.
          </p>
        )}
        {status === "ready" && (
          <>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-ink">
                {sunUp
                  ? `Sun in the ${dirLabel}, ${Math.round(sun.altitudeDeg)}° up`
                  : "Sun below the horizon"}
              </span>
              <div className="flex gap-1">
                {(["summer", "winter"] as Season[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={season === s}
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

            {sunUp && pinShaded != null && (
              <div
                className={`rounded-md border px-3 py-2 text-xs font-medium ${
                  pinShaded
                    ? "border-[#9aa3b2]/40 bg-[#eef1f5] text-[#41506b]"
                    : "border-[#E6AB02]/40 bg-[#FBF3D8] text-[#7a5a00]"
                }`}
              >
                {pinShaded
                  ? `This spot is in shade at ${String(hour).padStart(2, "0")}:00 (${season}).`
                  : `This spot is in direct sun at ${String(hour).padStart(2, "0")}:00 (${season}).`}
              </div>
            )}

            <label className="block text-[11px] text-ink-muted" htmlFor="sun-hour">
              Time of day: {String(hour).padStart(2, "0")}:00
            </label>
            <input
              id="sun-hour"
              type="range"
              min={4}
              max={21}
              value={hour}
              aria-valuetext={`${String(hour).padStart(2, "0")}:00`}
              onChange={(e) => setHour(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </>
        )}
        <p className="text-[11px] leading-snug text-ink-muted">
          Real cast shadows projected from City of Melbourne building heights at the chosen time
          (CC BY 4.0). Shadows fall on flat ground - terrain + the building&apos;s own floors aren&apos;t
          modelled, so treat it as a strong guide.{" "}
          <a
            href={shademapUrl(lng, lat)}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent underline decoration-dotted underline-offset-2"
          >
            Open the full shadow simulator &rarr;
          </a>
        </p>
      </div>
    </div>
  );
}
