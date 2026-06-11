"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Feature, Polygon, MultiPolygon, FeatureCollection } from "geojson";
import { usePlaces } from "@/lib/use-places";
import { pointInPolygon } from "@/lib/buyer-location";
import { computeWeightedScore } from "@/lib/scoring";
import { V1_SCORED_DOMAINS } from "@/lib/domains";
import type { ScoreWeights } from "@/lib/types";
import {
  fetchReachabilityIsochrone,
  REACH_MINUTES,
  type ReachMode,
} from "@/lib/reachability";

/**
 * "How far can you get" - reachability isochrone for the dropped pin (inspired by
 * isoportugal). Shows the street-network area reachable by car or on foot within
 * a time budget, plus which Melbourne suburbs fall inside and how they score on
 * our all-round liveability blend. Self-contained + lazy-loaded (dynamic import)
 * so MapLibre stays out of the report's initial bundle.
 */

type ReachStatus = "loading" | "ready" | "empty" | "error";

function geomBbox(geom: Polygon | MultiPolygon): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys)
    for (const ring of poly)
      for (const c of ring) {
        if (c[0] < minX) minX = c[0];
        if (c[1] < minY) minY = c[1];
        if (c[0] > maxX) maxX = c[0];
        if (c[1] > maxY) maxY = c[1];
      }
  return [minX, minY, maxX, maxY];
}

function scoreTone(score: number): string {
  if (score >= 67) return "bg-[#1a9850] text-white";
  if (score >= 34) return "bg-[#E6AB02] text-[#3a2c00]";
  return "bg-[#d73027] text-white";
}

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

export function ReachabilityCard({ lng, lat }: { lng: number; lat: number }) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layersReady = useRef(false);
  const { places } = usePlaces();

  const [mode, setMode] = useState<ReachMode>("drive");
  const [minutes, setMinutes] = useState(30);
  const [status, setStatus] = useState<ReachStatus>("loading");
  const [geom, setGeom] = useState<Polygon | MultiPolygon | null>(null);

  const equalWeights = useMemo(
    () => Object.fromEntries(V1_SCORED_DOMAINS.map((d) => [d, 1])) as ScoreWeights,
    []
  );

  // Suburbs whose centroid falls inside the reachable area, ranked by all-round
  // liveability (our honest stand-in for isoportugal's sale-price shading).
  const reachable = useMemo(() => {
    if (!geom || places.length === 0) return [];
    return places
      .filter((p) => !p.nonResidential && pointInPolygon(p.centroid, geom))
      .map((p) => ({ p, score: Math.round(computeWeightedScore(p, equalWeights).total) }))
      .sort((a, b) => b.score - a.score);
  }, [geom, places, equalWeights]);

  // One-time map setup (tile-free background - no basemap tile dependency).
  useEffect(() => {
    if (!mapEl.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#eef1ee" } }],
      },
      center: [lng, lat],
      zoom: 11,
      attributionControl: false,
    });
    mapRef.current = map;
    map.getCanvas().setAttribute("tabindex", "-1");
    map.getCanvas().setAttribute("aria-hidden", "true");
    new maplibregl.Marker({ color: "#D97757" }).setLngLat([lng, lat]).addTo(map);

    let tries = 0;
    const addLayers = () => {
      if (!mapRef.current) return;
      if (map.isStyleLoaded()) {
        if (!map.getSource("iso")) {
          map.addSource("iso", { type: "geojson", data: EMPTY_FC });
          map.addLayer({
            id: "iso-fill",
            type: "fill",
            source: "iso",
            paint: { "fill-color": "#2c7fb8", "fill-opacity": 0.18 },
          });
          map.addLayer({
            id: "iso-line",
            type: "line",
            source: "iso",
            paint: { "line-color": "#1f6aa6", "line-width": 2 },
          });
          map.addSource("reach-pts", { type: "geojson", data: EMPTY_FC });
          map.addLayer({
            id: "reach-dots",
            type: "circle",
            source: "reach-pts",
            paint: {
              "circle-radius": 3,
              "circle-color": "#1f6aa6",
              "circle-opacity": 0.65,
            },
          });
        }
        layersReady.current = true;
        return;
      }
      if (++tries > 50) return;
      setTimeout(addLayers, 120);
    };
    addLayers();
    map.on("error", (e) => console.warn("ReachabilityCard map:", e?.error?.message ?? e));

    return () => {
      layersReady.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [lng, lat]);

  // Fetch the isochrone whenever pin / mode / time changes. Abortable + guarded.
  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const r = await fetchReachabilityIsochrone([lng, lat], mode, minutes, { signal: ctrl.signal });
      if (cancelled) return;
      if (r.ok) {
        setGeom(r.geom);
        setStatus("ready");
      } else if (r.reason === "aborted") {
        // superseded by a newer request; leave state to the newer run
      } else {
        setGeom(null);
        setStatus(r.reason === "no-geometry" ? "empty" : "error");
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [lng, lat, mode, minutes]);

  // Push the isochrone + reachable centroids to the map once both are ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady.current) return;
    const iso = map.getSource("iso") as maplibregl.GeoJSONSource | undefined;
    const pts = map.getSource("reach-pts") as maplibregl.GeoJSONSource | undefined;
    if (!iso || !pts) return;
    if (geom) {
      iso.setData({ type: "Feature", geometry: geom, properties: {} } as Feature);
      pts.setData({
        type: "FeatureCollection",
        features: reachable.map(({ p }) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: p.centroid },
          properties: {},
        })),
      } as FeatureCollection);
      try {
        const [minX, minY, maxX, maxY] = geomBbox(geom);
        map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 24, duration: 350, maxZoom: 14 });
      } catch {
        /* ignore fit errors */
      }
    } else {
      iso.setData(EMPTY_FC);
      pts.setData(EMPTY_FC);
    }
  }, [geom, reachable, status]);

  const onMode = (m: ReachMode) => {
    if (m === mode) return;
    setMode(m);
    // Reset to the middle budget for the new mode if the current one isn't offered.
    if (!REACH_MINUTES[m].includes(minutes)) setMinutes(REACH_MINUTES[m][1]);
  };

  const topN = reachable.slice(0, 10);
  const moreCount = reachable.length - topN.length;

  return (
    <div className="overflow-hidden rounded-lg border border-surface-border">
      <div
        ref={mapEl}
        className="h-56 w-full bg-surface-sunken"
        role="img"
        aria-label={`Area reachable by ${mode} within ${minutes} minutes of the pin`}
      />
      <div className="space-y-3 border-t border-surface-border bg-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-full border border-surface-border p-0.5 text-[11px]">
            {(["drive", "walk"] as ReachMode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => onMode(m)}
                className={`rounded-full px-3 py-1 ${
                  mode === m ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
                }`}
              >
                {m === "drive" ? "Driving" : "Walking"}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {REACH_MINUTES[mode].map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={minutes === m}
                onClick={() => setMinutes(m)}
                className={`rounded-full px-2.5 py-1 text-[11px] ${
                  minutes === m
                    ? "bg-accent text-white"
                    : "border border-surface-border text-ink-muted hover:border-accent"
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>

        {status === "loading" && (
          <p className="text-xs text-ink-muted">Mapping how far you can get...</p>
        )}
        {status === "error" && (
          <p className="text-xs text-ink-muted">
            Couldn&apos;t map reachability just now. Try again in a moment.
          </p>
        )}
        {status === "empty" && (
          <p className="text-xs text-ink-muted">No reachable area came back for this spot.</p>
        )}
        {status === "ready" && (
          <>
            <p className="text-xs text-ink">
              {reachable.length > 0 ? (
                <>
                  You can reach <strong>{reachable.length}</strong> Melbourne suburb
                  {reachable.length === 1 ? "" : "s"} {mode === "drive" ? "driving" : "walking"} ~
                  {minutes} min from here.
                </>
              ) : (
                <>No mapped suburbs fall inside this {minutes}-minute area - try a longer time.</>
              )}
            </p>
            {reachable.length > 0 && (
              <p className="text-[11px] leading-snug text-ink-muted">
                On the map: the shaded blue area is how far you can get; each blue dot marks
                the centre of a suburb inside it.
              </p>
            )}

            {topN.length > 0 && (
              <ul className="space-y-1">
                {topN.map(({ p, score }) => (
                  <li
                    key={p.sa2Code}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate text-ink">
                      {p.name}
                      <span className="ml-1 text-ink-muted">- {p.lga}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${scoreTone(
                        score
                      )}`}
                      title="All-round liveability score (0-100, higher is better)"
                    >
                      {score}
                    </span>
                  </li>
                ))}
                {moreCount > 0 && (
                  <li className="pt-0.5 text-[11px] text-ink-muted">+{moreCount} more reachable</li>
                )}
              </ul>
            )}
          </>
        )}

        {/* Panel-glimpse rule: no source/licence citations here - provenance for
            the routing data lives in the full pin report. Keep the one practical
            honesty note buyers need (off-peak vs peak). */}
        <p className="text-[11px] leading-snug text-ink-muted">
          {mode === "drive" ? "Driving" : "Walking"} times are typical off-peak estimates -
          real peak-hour trips run longer. The score is our all-round liveability blend
          across all measured topics (higher = better).
        </p>
      </div>
    </div>
  );
}
