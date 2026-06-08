"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { sunPosition } from "@/lib/sun";
import { pointInPolygon } from "@/lib/buyer-location";
import { timeoutSignal } from "@/lib/fetch-timeout";

/**
 * Sun & shadow check for a dropped pin - the Northlight differentiator.
 *
 * Renders the real building massing around the property (City of Melbourne
 * CC-BY 2020 building footprints, extruded by height) on a pitched MapLibre map,
 * AND projects each building's REAL cast shadow onto the ground for the chosen
 * date/time: shadow length = height / tan(sun altitude), direction = the
 * anti-solar bearing (lib/sun sunPosition). The pin is flagged in sun or in
 * shade. Geometry only (hand-rolled convex hull, no turf, no 3D engine) so it
 * is static-export safe and never blocks the main thread.
 *
 * Coverage: City of Melbourne publishes SURVEYED heights (most accurate) for the
 * inner city; everywhere else we fall back to OSM building footprints with
 * heights ESTIMATED from tags (building:levels x storey height, else ~2 storeys),
 * so the feature works across Greater Melbourne. shademap.app deep-link for the
 * exact simulation. Loaded on demand (dynamic import) so MapLibre stays out of
 * the report's initial bundle.
 */
const COM_BUILDINGS_API =
  "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/2020-building-footprints/exports/geojson";

function buildingsUrl(lng: number, lat: number, metres = 180): string {
  const where = `within_distance(geo_shape, geom'POINT(${lng} ${lat})', ${metres}m)`;
  return `${COM_BUILDINGS_API}?select=structure_extrusion&where=${encodeURIComponent(where)}`;
}

function shademapUrl(lng: number, lat: number): string {
  return `https://shademap.app/@${lat.toFixed(5)},${lng.toFixed(5)},17z`;
}

// Keyless OSM Overpass building fallback so the sun view works BEYOND the City of
// Melbourne council area (whose surveyed-height dataset is inner-city only). OSM
// heights are sparse, so we estimate from building:levels x storey height.
//
// The public Overpass instances rate-limit / time out under load, which is what
// made the sun view "not work" outside the CBD. We rotate across mirrors with a
// short per-mirror timeout and take the first that answers - so a single slow or
// throttled endpoint no longer kills the feature.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

type OverpassJson = {
  elements?: { type?: string; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> }[];
};

async function overpassQuery(query: string, signal: AbortSignal): Promise<OverpassJson> {
  const body = "data=" + encodeURIComponent(query);
  let lastErr: unknown;
  for (const url of OVERPASS_MIRRORS) {
    if (signal.aborted) break;
    // Per-mirror timeout so one stalled endpoint fails fast and we try the next,
    // while still honouring the caller's overall abort (unmount / total budget).
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) throw new Error(`overpass ${res.status}`);
      return (await res.json()) as OverpassJson;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }
  throw lastErr ?? new Error("overpass: all mirrors failed");
}

function osmHeight(tags: Record<string, string> | undefined): number {
  const t = tags ?? {};
  const h = parseFloat(t.height ?? "");
  if (Number.isFinite(h) && h > 0) return h;
  const levels = parseFloat(t["building:levels"] ?? "");
  if (Number.isFinite(levels) && levels > 0) return levels * 3.2;
  return 6; // ~2 storeys when untagged - a reasonable suburban default
}

async function fetchOsmBuildings(
  lng: number,
  lat: number,
  signal: AbortSignal
): Promise<FeatureCollection> {
  const q = `[out:json][timeout:15];way["building"](around:180,${lat},${lng});out geom;`;
  const json = await overpassQuery(q, signal);
  const features: Feature<Polygon>[] = [];
  for (const el of json.elements ?? []) {
    if (el.type !== "way" || !Array.isArray(el.geometry) || el.geometry.length < 4) continue;
    const ring: number[][] = el.geometry.map((p) => [p.lon, p.lat]);
    const a = ring[0];
    const z = ring[ring.length - 1];
    if (a[0] !== z[0] || a[1] !== z[1]) ring.push(a);
    features.push({
      type: "Feature",
      properties: { structure_extrusion: osmHeight(el.tags) },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }
  return { type: "FeatureCollection", features };
}

const RAD = Math.PI / 180;
const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Andrew's monotone-chain convex hull. Pure + allocation-light + O(n log n).
 * Replaces turf.convex, whose per-call FeatureCollection allocation across
 * hundreds of buildings synchronously blocked the main thread (froze the UI).
 */
function convexHull(points: number[][]): number[][] {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: number[][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

const SHADOW_CAP = 150; // bound main-thread work: nearest N footprints only

function firstCoord(g: Polygon | MultiPolygon | null): number[] | null {
  if (!g) return null;
  if (g.type === "Polygon") return g.coordinates[0]?.[0] ?? null;
  if (g.type === "MultiPolygon") return g.coordinates[0]?.[0]?.[0] ?? null;
  return null;
}

/**
 * Project each building footprint to its ground cast-shadow polygon at the given
 * sun position: the convex hull of the footprint and the footprint translated by
 * the shadow vector (length = height/tan(altitude), bearing = anti-solar). Pure
 * + turf-free; empty when the sun is low/below the horizon.
 */
function computeShadows(
  fc: FeatureCollection,
  azimuthDeg: number,
  altitudeDeg: number,
  originLng: number,
  originLat: number
): FeatureCollection {
  if (altitudeDeg <= 2) return EMPTY_FC;
  const ratio = Math.min(1 / Math.tan(altitudeDeg * RAD), 25); // shadow length per metre, capped
  const antiAz = (azimuthDeg + 180) % 360;
  const sinB = Math.sin(antiAz * RAD);
  const cosB = Math.cos(antiAz * RAD);
  const mPerDegLat = 110574;
  const mPerDegLng = 111320 * Math.cos(originLat * RAD);
  // Only project the nearest footprints - distant shadows don't reach the pin.
  let feats = fc.features;
  if (feats.length > SHADOW_CAP) {
    const d2 = (f: Feature) => {
      const c = firstCoord(f.geometry as Polygon | MultiPolygon | null);
      if (!c) return Infinity;
      const dx = c[0] - originLng;
      const dy = c[1] - originLat;
      return dx * dx + dy * dy;
    };
    feats = [...feats].sort((a, b) => d2(a) - d2(b)).slice(0, SHADOW_CAP);
  }
  const out: Feature<Polygon>[] = [];
  for (const f of feats) {
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
      const pts: number[][] = [];
      for (const c of ring) {
        pts.push([c[0], c[1]]);
        pts.push([c[0] + dLng, c[1] + dLat]);
      }
      const hull = convexHull(pts);
      if (hull.length >= 3) {
        out.push({
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [[...hull, hull[0]]] },
        });
      }
    }
  }
  return { type: "FeatureCollection", features: out };
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
  const [source, setSource] = useState<"com" | "osm">("com");

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
      map.addSource("shadows", { type: "geojson", data: EMPTY_FC });
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
        // 1) City of Melbourne surveyed heights (most accurate). 2) Outside the
        // CoM council area, fall back to OSM building footprints with heights
        // estimated from tags - so the feature works across Melbourne, not just
        // the inner city.
        let fc: FeatureCollection | null = null;
        let src: "com" | "osm" = "com";
        try {
          const res = await fetch(buildingsUrl(lng, lat), { signal: t.signal });
          const com = (await res.json()) as FeatureCollection;
          if (com.features?.length) fc = com;
        } catch {
          /* CoM endpoint hiccup - fall through to OSM */
        }
        if (!fc && !cancelled) {
          const osm = await fetchOsmBuildings(lng, lat, t.signal).catch(() => null);
          if (osm && osm.features.length) {
            fc = osm;
            src = "osm";
          }
        }
        if (cancelled) return;
        if (!fc) {
          setStatus("no-buildings");
          return;
        }
        const ready = fc;
        setSource(src);
        let tries = 0;
        const tryApply = () => {
          if (cancelled || !mapRef.current) return;
          if (map.isStyleLoaded()) {
            try {
              addBuildings(ready);
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
      const shadows = computeShadows(buildingsRef.current, sun.azimuthDeg, sun.altitudeDeg, lng, lat);
      const src = map.getSource("shadows") as maplibregl.GeoJSONSource | undefined;
      src?.setData(shadows);
      setPinShaded(
        up && shadows.features.some((p) => pointInPolygon([lng, lat], p.geometry as Polygon))
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
            No mapped buildings here to cast shadows. Use the shadow simulator below for this
            address.
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
          {source === "com" ? (
            <>
              Real cast shadows from City of Melbourne surveyed building heights (CC BY 4.0).
            </>
          ) : (
            <>
              Cast shadows from OpenStreetMap building outlines, with heights estimated from
              tagged storeys (or ~2 storeys where untagged) - approximate. &copy; OpenStreetMap
              (ODbL).
            </>
          )}{" "}
          Shadows fall on flat ground - terrain + the building&apos;s own floors aren&apos;t
          modelled, so treat it as a guide.{" "}
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
