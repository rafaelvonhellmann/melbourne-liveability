"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { DomainId } from "@/lib/types";
import type { BuyerAnchor } from "@/lib/anchors";
import type { NoiseLine } from "@/lib/noise";
import { MAJOR_PROJECTS } from "@/lib/major-projects";
import { MELBOURNE_BOUNDS, MELBOURNE_CENTER, MELBOURNE_MAX_BOUNDS } from "@/lib/region";
import {
  choroplethFillColor,
  choroplethFillColorByProp,
  riskFillColorByProp,
  socialFillColorByProp,
} from "@/lib/map-expressions";
import { withBase } from "@/lib/asset-path";
import { poiCircleColorExpression } from "@/lib/poi-categories";
import { buildPoiPopupHtml, escapeHtml, safeHttpUrl, type PoiFeatureProps } from "@/lib/poi-feature";
import { WALK_THRESHOLD_KM } from "@/lib/walk-access";
import { CYCLE_THRESHOLD_KM } from "@/lib/cyclability";

/** Approximate a geographic circle (radius km) around [lng, lat] as a Polygon. */
function circlePolygon(
  center: [number, number],
  radiusKm: number,
  steps = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const [lng, lat] = center;
  const latR = radiusKm / 110.574;
  const lngR = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([lng + lngR * Math.cos(t), lat + latR * Math.sin(t)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}

// Lazily add the POI source + circle layer. The full pin set (pois.geojson) is
// ~7.5MB, and all categories are OFF by default, so we defer the fetch+parse
// until the user first enables a category instead of paying it on every map
// open. Idempotent. Layer starts hidden; the visiblePins effect sets the filter.
function addPoiLayer(map: maplibregl.Map): void {
  if (map.getSource("pois")) return;
  map.addSource("pois", { type: "geojson", data: withBase("/data/pois.geojson") });
  map.addLayer({
    id: "poi-circles",
    type: "circle",
    source: "pois",
    filter: ["==", ["get", "pinType"], "__none__"],
    paint: {
      "circle-radius": 5.5,
      "circle-color": poiCircleColorExpression() as maplibregl.ExpressionSpecification,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.95,
    },
  });
}

// Light basemap to sit under the warm-editorial chrome; the YlGnBu choropleth
// remains the independent data channel on top.
const BASEMAP =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Big Build flagship projects as a static GeoJSON point set (curated; see
// lib/major-projects). Drawn as an opt-in buyer-mode layer.
const MAJOR_PROJECTS_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: MAJOR_PROJECTS.map((p) => ({
    type: "Feature",
    properties: { name: p.name, label: p.label, status: p.status, sourceUrl: p.sourceUrl },
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
  })),
};

type MelbourneMapProps = {
  className?: string;
  activeDomain: DomainId;
  confidenceMode?: boolean;
  walkAccessMode?: boolean;
  cyclabilityMode?: boolean;
  /** Social-housing supply choropleth (% of dwellings that are social housing). */
  socialHousingMode?: boolean;
  /** Colourblind-safe score ramp (RdYlBu) instead of the default RdYlGn. */
  colorblind?: boolean;
  /** Optional hazard overlay-share choropleth (Reds ramp), or null for none. */
  hazardLayer?: "bushfire" | "flood" | null;
  /** "No layer": paint the areas transparent (basemap + outlines only). */
  noLayer?: boolean;
  visiblePins?: Record<string, boolean>;
  onPlaceSelect?: (props: { slug?: string; name?: string; sa2Code?: string }) => void;
  /**
   * In-app camera target used by the area search (pan/zoom to a result) - a
   * `nonce` lets the same place re-trigger a fly-to. Map *clicks* deliberately
   * do NOT set this, so selecting an area on the map preserves the view.
   */
  focusTarget?: { center: [number, number]; nonce: number } | null;
  /** Slug of the currently-selected SA2 - drawn with a highlight outline. */
  selectedSlug?: string | null;
  /** Feature property currently painted on the choropleth (e.g. "pct_affordability"). */
  hoverProp?: string;
  /** Human label for the painted layer, used in the hover tooltip. */
  hoverLabel?: string;
  /** Buyer "Location Check": a map click drops a pin instead of selecting an SA2. */
  buyerMode?: boolean;
  /** Coordinates of the dropped buyer pin to render ([lng, lat]). */
  buyerPin?: [number, number] | null;
  /**
   * Pin known at FIRST mount (parsed from the shared ?pin= URL). When set, the
   * map initialises centred on it instead of flashing the whole-metro view and
   * then flying in - so a shared link / "open buyer check" lands at the spot.
   */
  initialBuyerPin?: [number, number] | null;
  /** Draw the ~15-min bike reach ring around the buyer pin (off by default). */
  showCycleRadius?: boolean;
  /** The buyer's saved life-anchors (work/school/family) to plot + line to the pin. */
  anchorPoints?: BuyerAnchor[];
  /** Rail + tram lines (OSM) to draw near the buyer pin, coloured by mode. */
  transitLines?: NoiseLine[];
  /** Called with the dropped pin + the SA2 it falls in (from the fill layer). */
  onPinDrop?: (
    lngLat: [number, number],
    sa2: { slug?: string; name?: string; sa2Code?: string } | null
  ) => void;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function fillColorFor(
  activeDomain: DomainId,
  noLayer: boolean,
  confidenceMode: boolean,
  walkAccessMode: boolean,
  cyclabilityMode: boolean,
  socialHousingMode: boolean,
  hazardLayer: "bushfire" | "flood" | null,
  colorblind: boolean
): unknown {
  // "No layer": paint the areas transparent so only the basemap + outlines show,
  // while keeping the fill clickable (pin drop / area select still work).
  if (noLayer) return "rgba(0,0,0,0)";
  if (hazardLayer) return riskFillColorByProp(`${hazardLayer}_share`);
  if (socialHousingMode) return socialFillColorByProp("social_share");
  if (walkAccessMode) return choroplethFillColorByProp("pct_walkaccess", colorblind);
  if (cyclabilityMode) return choroplethFillColorByProp("pct_cyclability", colorblind);
  if (confidenceMode) return choroplethFillColorByProp("pct_confidence", colorblind);
  return choroplethFillColor(activeDomain, colorblind);
}

export function MelbourneMap({
  className,
  activeDomain,
  confidenceMode = false,
  walkAccessMode = false,
  cyclabilityMode = false,
  socialHousingMode = false,
  colorblind = false,
  hazardLayer = null,
  noLayer = false,
  visiblePins = {},
  onPlaceSelect,
  focusTarget = null,
  selectedSlug = null,
  hoverProp,
  hoverLabel,
  buyerMode = false,
  buyerPin = null,
  initialBuyerPin = null,
  showCycleRadius = false,
  anchorPoints = [],
  transitLines = [],
  onPinDrop,
}: MelbourneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const poiPopupRef = useRef<maplibregl.Popup | null>(null);
  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Buyer-mode handlers via refs so the map still initialises exactly once.
  const buyerModeRef = useRef(buyerMode);
  const onPinDropRef = useRef(onPinDrop);
  useEffect(() => {
    buyerModeRef.current = buyerMode;
    onPinDropRef.current = onPinDrop;
  }, [buyerMode, onPinDrop]);

  // Keep the latest select handler in a ref so the map is initialised exactly
  // once. Putting `onPlaceSelect` in the init effect's deps caused the whole
  // map to be torn down and rebuilt on every parent re-render (the "everything
  // refreshes the map" bug), resetting the view and layers on every click.
  const onPlaceSelectRef = useRef(onPlaceSelect);
  useEffect(() => {
    onPlaceSelectRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

  // Hover-tooltip inputs read through a ref so the map still initialises once.
  const hoverInfoRef = useRef<{ prop?: string; label?: string }>({
    prop: hoverProp,
    label: hoverLabel,
  });
  useEffect(() => {
    hoverInfoRef.current = { prop: hoverProp, label: hoverLabel };
  }, [hoverProp, hoverLabel]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP,
      center: MELBOURNE_CENTER,
      zoom: 9,
      // Generous envelope (see region.ts) so panning is free in every
      // direction; the initial fitBounds below still frames Greater Melbourne.
      maxBounds: MELBOURNE_MAX_BOUNDS,
    });

    // Nav (+/–) lives top-left so it never collides with the floating layer
    // control / legend card pinned to the top-right.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    // Land directly on the shared pin (no whole-metro flash) if one is in the URL;
    // otherwise frame Greater Melbourne.
    if (initialBuyerPin) {
      map.jumpTo({ center: initialBuyerPin, zoom: 14.5 });
    } else {
      map.fitBounds(MELBOURNE_BOUNDS, { padding: 40, duration: 0 });
    }

    map.on("load", () => {
      map.addSource("sa2", {
        type: "geojson",
        data: withBase("/data/places.geojson"),
      });
      map.addLayer({
        id: "sa2-fill",
        type: "fill",
        source: "sa2",
        paint: {
          "fill-color": fillColorFor(
            activeDomain,
            noLayer,
            confidenceMode,
            walkAccessMode,
            cyclabilityMode,
            socialHousingMode,
            hazardLayer,
            colorblind
          ) as maplibregl.ExpressionSpecification,
          "fill-opacity": 0.72,
        },
      });
      map.addLayer({
        id: "sa2-line",
        type: "line",
        source: "sa2",
        paint: {
          "line-color": "#9a948a",
          "line-width": 0.5,
        },
      });

      // Highlight outline for the selected SA2 - a distinct warm accent line,
      // wider than the base mesh, so the active area is obvious over the
      // YlGnBu choropleth. Filter starts matching nothing; the selectedSlug
      // effect below sets it.
      map.addLayer({
        id: "sa2-selected",
        type: "line",
        source: "sa2",
        filter: ["==", ["get", "slug"], "__none__"],
        paint: {
          "line-color": "#9C4221",
          "line-width": 3.5,
          "line-opacity": 0.95,
        },
      });

      // Zoom-revealed SA2 labels: hidden until zoomed in, then crisp (opaque ink +
      // solid white halo) so names stay readable over the choropleth.
      map.addLayer({
        id: "sa2-labels",
        type: "symbol",
        source: "sa2",
        layout: {
          "text-field": ["coalesce", ["get", "name"], ""],
          "text-font": ["Open Sans Bold", "Open Sans Regular", "Noto Sans Bold"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            10,
            12,
            11,
            14,
            13,
            16,
            14,
          ],
          "text-max-width": 8,
          "text-padding": 4,
          "text-allow-overlap": false,
          "text-transform": "none",
          "symbol-placement": "point",
        },
        paint: {
          "text-color": "#1a1a18",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2.5,
          "text-halo-blur": 0,
          "text-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0,
            11.5,
            0.55,
            13,
            0.9,
            15,
            1,
          ],
        },
      });

      // ~15-min bike reach ring (straight-line) around the buyer pin. Added
      // BEFORE the walk radius so the smaller coral walk ring draws on top of it.
      // A cool teal, distinct from the coral walk ring; off until toggled.
      map.addSource("cycle-radius", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "cycle-radius-fill",
        type: "fill",
        source: "cycle-radius",
        paint: { "fill-color": "#0E7C86", "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: "cycle-radius-line",
        type: "line",
        source: "cycle-radius",
        paint: {
          "line-color": "#0E7C86",
          "line-width": 2,
          "line-opacity": 0.9,
          "line-dasharray": [1, 2],
        },
      });

      // 15-min-walk radius around the buyer pin (straight-line ~1.2 km). Drawn
      // under the POI pins so amenities sit on top of the shaded reach.
      map.addSource("buyer-radius", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "buyer-radius-fill",
        type: "fill",
        source: "buyer-radius",
        paint: { "fill-color": "#2052CC", "fill-opacity": 0.16 },
      });
      // White casing under the dashed ring so it stays legible on dark / satellite
      // basemaps as well as light ones (the 0.1-opacity ring was too faint - user feedback).
      map.addLayer({
        id: "buyer-radius-casing",
        type: "line",
        source: "buyer-radius",
        paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.6 },
      });
      map.addLayer({
        id: "buyer-radius-line",
        type: "line",
        source: "buyer-radius",
        paint: {
          "line-color": "#9A3D1E",
          "line-width": 3,
          "line-opacity": 1,
          "line-dasharray": [3, 2],
        },
      });

      // Nearby rail + tram lines around the buyer pin (context). Coloured by mode
      // (train vs tram) and clipped near the pin so it shows the local network,
      // not the whole city. Bus (GTFS shapes) is a heavier follow-up.
      map.addSource("transit-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "transit-lines",
        type: "line",
        source: "transit-lines",
        paint: {
          "line-color": [
            "match",
            ["get", "kind"],
            "rail",
            "#2C6FB3",
            "tram",
            "#1B9E77",
            "#888888",
          ] as maplibregl.ExpressionSpecification,
          "line-width": 3,
          "line-opacity": 0.8,
        },
      });

      // POI source/layer (pois.geojson, ~7.5MB) is NOT added here - it is created
      // lazily by addPoiLayer() the first time the user enables a pin category
      // (see the visiblePins effect), so a default no-pins session never pays it.

      // Social anchors (work/school/family) + a dashed line from the buyer pin to
      // each. Context only - straight-line, never scored. Purple to stay distinct
      // from the coral buyer pin and the categorical POI palette.
      map.addSource("anchor-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "anchor-lines",
        type: "line",
        source: "anchor-lines",
        paint: {
          "line-color": "#5B3A8A",
          "line-width": 1.5,
          "line-opacity": 0.7,
          "line-dasharray": [2, 1.5],
        },
      });
      map.addSource("anchors", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "anchor-points",
        type: "circle",
        source: "anchors",
        paint: {
          "circle-radius": 6,
          "circle-color": "#5B3A8A",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.95,
        },
      });

      // Big Build flagship projects (Metro Tunnel + SRL East) - few, city-shaping
      // points, hidden until buyer mode (see the visibility effect). Click for the
      // official link. Curated + Nominatim-resolved (lib/major-projects).
      map.addSource("major-projects", {
        type: "geojson",
        data: MAJOR_PROJECTS_FC,
      });
      map.addLayer({
        id: "major-projects",
        type: "circle",
        source: "major-projects",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": 6,
          "circle-color": "#D95F02",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.95,
        },
      });
    });

    const closePoiPopup = () => {
      poiPopupRef.current?.remove();
      poiPopupRef.current = null;
    };

    const showPoiPopup = (
      lngLat: maplibregl.LngLatLike,
      props: PoiFeatureProps
    ) => {
      closePoiPopup();
      const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "280px",
        className: "poi-popup-container",
      })
        .setLngLat(lngLat)
        .setHTML(buildPoiPopupHtml(props))
        .addTo(map);
      poiPopupRef.current = popup;
    };

    map.on("click", "poi-circles", (e) => {
      const f = e.features?.[0];
      if (!f?.properties) return;
      const pinType = String(f.properties.pinType ?? "");
      const name = String(f.properties.name ?? pinType);
      const url = f.properties.url ? String(f.properties.url) : undefined;
      const osmUrl = f.properties.osmUrl
        ? String(f.properties.osmUrl)
        : undefined;
      showPoiPopup(e.lngLat, { pinType, name, url, osmUrl });
    });

    map.on("click", "major-projects", (e) => {
      const f = e.features?.[0];
      if (!f?.properties) return;
      const name = escapeHtml(String(f.properties.name ?? "Project"));
      const label = escapeHtml(String(f.properties.label ?? ""));
      const status = escapeHtml(String(f.properties.status ?? ""));
      // Scheme-allowlist the URL (http/https only) like the POI popup, so a bad
      // sourceUrl can never become a javascript: link in this innerHTML sink.
      const url = f.properties.sourceUrl ? safeHttpUrl(String(f.properties.sourceUrl)) : null;
      const link = url
        ? `<br/><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Official project page</a>`
        : "";
      closePoiPopup();
      poiPopupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "260px",
        className: "poi-popup-container",
      })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:13px;line-height:1.45"><strong>${name}</strong><br/>${label}<br/><span style="color:#6b6256">${status}</span>${link}</div>`
        )
        .addTo(map);
    });
    map.on("mouseenter", "major-projects", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "major-projects", () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", "sa2-fill", (e) => {
      // POI pins are small and draw above the choropleth. Test a BUFFERED box
      // around the click (not just the exact pixel) so clicking on - or near - an
      // amenity pin opens ITS popup instead of dropping/moving the buyer pin.
      // This is what makes the schools/groceries pins usable inside a selected
      // area (previously a near-miss fell through and re-dropped the pin).
      if (map.getLayer("poi-circles")) {
        const r = 10;
        const near = map.queryRenderedFeatures(
          [
            [e.point.x - r, e.point.y - r],
            [e.point.x + r, e.point.y + r],
          ],
          { layers: ["poi-circles"] }
        );
        const hit = near[0];
        if (hit?.properties && hit.geometry?.type === "Point") {
          const pinType = String(hit.properties.pinType ?? "");
          const coords = hit.geometry.coordinates as [number, number];
          showPoiPopup(coords, {
            pinType,
            name: String(hit.properties.name ?? pinType),
            url: hit.properties.url ? String(hit.properties.url) : undefined,
            osmUrl: hit.properties.osmUrl ? String(hit.properties.osmUrl) : undefined,
          });
          return;
        }
      }
      closePoiPopup();
      const f = e.features?.[0];
      // Buyer-first: a map click drops the location pin + opens the deep-dive
      // report (the page auto-enters buyer mode). No separate toggle needed.
      onPinDropRef.current?.(
        [e.lngLat.lng, e.lngLat.lat],
        f?.properties
          ? {
              slug: f.properties.slug as string | undefined,
              name: f.properties.name as string | undefined,
              sa2Code: f.properties.sa2Code as string | undefined,
            }
          : null
      );
    });

    map.on("mouseenter", "poi-circles", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "poi-circles", () => {
      map.getCanvas().style.cursor = "";
    });

    // Lightweight hover preview (desktop pointers only - touch never fires
    // mousemove). Shows the area name and the value of whatever layer is
    // currently painted, so users can scan the choropleth without clicking.
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 8,
      className: "mlv-hover-popup",
    });
    hoverPopupRef.current = popup;

    map.on("mousemove", "sa2-fill", (e) => {
      const f = e.features?.[0];
      if (!f?.properties) return;
      map.getCanvas().style.cursor = "pointer";
      const name = (f.properties.name as string | undefined) ?? "Area";
      const { prop, label } = hoverInfoRef.current;
      const raw = prop != null ? f.properties[prop] : null;
      const valueText =
        raw == null || raw === ""
          ? "No / low resident data"
          : `${Math.round(Number(raw))}/100`;
      const labelText = label ? escapeHtml(label) : "Value";
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="mlv-hover-name">${escapeHtml(name)}</div>` +
            `<div class="mlv-hover-meta">${labelText}: <span class="num">${escapeHtml(
              valueText
            )}</span></div>`
        )
        .addTo(map);
    });

    map.on("mouseleave", "sa2-fill", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });

    mapRef.current = map;
    return () => {
      closePoiPopup();
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
      pinMarkerRef.current?.remove();
      pinMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  // Initialise the map exactly once; the click handler reads the latest
  // callback from a ref (see above), so no init-time dependencies are needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- map init once
  }, []);

  // Buyer pin marker - add / move / remove a coral marker at the dropped point.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const radiusSrc = map.getSource("buyer-radius") as maplibregl.GeoJSONSource | undefined;
    radiusSrc?.setData({
      type: "FeatureCollection",
      features: buyerPin ? [circlePolygon(buyerPin, WALK_THRESHOLD_KM)] : [],
    });
    if (!buyerPin) {
      pinMarkerRef.current?.remove();
      pinMarkerRef.current = null;
      return;
    }
    if (!pinMarkerRef.current) {
      pinMarkerRef.current = new maplibregl.Marker({ color: "#2052CC" })
        .setLngLat(buyerPin)
        .addTo(map);
    } else {
      pinMarkerRef.current.setLngLat(buyerPin);
    }
    // Deep-dive: ease into the area at neighbourhood zoom (never zoom back out
    // if the user is already closer). But if the pin is already framed on-screen
    // at a close zoom (the user is refining it within a selected area), DON'T
    // replay the fly-to - re-animating on every small move is jarring.
    const alreadyFramed =
      map.getZoom() >= 14.5 && map.getBounds().contains(buyerPin as [number, number]);
    if (!alreadyFramed) {
      map.flyTo({
        center: buyerPin,
        zoom: Math.max(map.getZoom(), 14.5),
        duration: prefersReducedMotion() ? 0 : 550,
      });
    }
  }, [buyerPin]);

  // ~15-min bike reach ring - independent toggle, only shown with a pin down.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("cycle-radius") as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features:
        buyerPin && showCycleRadius ? [circlePolygon(buyerPin, CYCLE_THRESHOLD_KM)] : [],
    });
  }, [buyerPin, showCycleRadius]);

  // Social anchors + dashed connector lines from the buyer pin to each anchor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pointsSrc = map.getSource("anchors") as maplibregl.GeoJSONSource | undefined;
    const linesSrc = map.getSource("anchor-lines") as maplibregl.GeoJSONSource | undefined;
    const list = anchorPoints ?? [];
    pointsSrc?.setData({
      type: "FeatureCollection",
      features: list.map((a) => ({
        type: "Feature" as const,
        properties: { label: a.label, kind: a.kind },
        geometry: { type: "Point" as const, coordinates: [a.lng, a.lat] },
      })),
    });
    linesSrc?.setData({
      type: "FeatureCollection",
      features:
        buyerPin && list.length > 0
          ? list.map((a) => ({
              type: "Feature" as const,
              properties: {},
              geometry: {
                type: "LineString" as const,
                coordinates: [buyerPin, [a.lng, a.lat]],
              },
            }))
          : [],
    });
  }, [anchorPoints, buyerPin]);

  // Nearby rail/tram lines - clipped to ~2.7 km of the pin (cheap vertex check)
  // so the local network shows without painting every line in Melbourne.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("transit-lines") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const NEAR_DEG = 0.025; // ~2.7 km
    const feats =
      buyerPin && transitLines.length > 0
        ? transitLines
            .filter((l) =>
              l.coords.some(
                ([lng, lat]) =>
                  Math.abs(lng - buyerPin[0]) < NEAR_DEG &&
                  Math.abs(lat - buyerPin[1]) < NEAR_DEG
              )
            )
            .map((l) => ({
              type: "Feature" as const,
              properties: { kind: l.kind },
              geometry: { type: "LineString" as const, coordinates: l.coords },
            }))
        : [];
    src.setData({ type: "FeatureCollection", features: feats });
  }, [transitLines, buyerPin]);

  // Big Build pins show only in buyer mode (city-shaping context for a purchase).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("major-projects")) return;
    map.setLayoutProperty("major-projects", "visibility", buyerMode ? "visible" : "none");
  }, [buyerMode]);

  // Crosshair cursor in buyer mode to signal "click to drop a pin".
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = buyerMode ? "crosshair" : "";
  }, [buyerMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("sa2-fill")) return;
    const color = fillColorFor(
      activeDomain,
      noLayer,
      confidenceMode,
      walkAccessMode,
      cyclabilityMode,
      socialHousingMode,
      hazardLayer,
      colorblind
    ) as maplibregl.ExpressionSpecification;
    if (!map.isStyleLoaded()) {
      map.once("idle", () => {
        if (map.getLayer("sa2-fill")) {
          map.setPaintProperty("sa2-fill", "fill-color", color);
        }
      });
      return;
    }
    map.setPaintProperty("sa2-fill", "fill-color", color);
  }, [
    activeDomain,
    noLayer,
    confidenceMode,
    walkAccessMode,
    cyclabilityMode,
    socialHousingMode,
    hazardLayer,
    colorblind,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Pins are user-controlled per category and independent of the active
    // choropleth domain. Show only the categories explicitly enabled.
    const allowed = Object.keys(visiblePins).filter((k) => visiblePins[k]);
    const pin = buyerPin;
    const applyFilter = () => {
      if (allowed.length === 0) {
        // Nothing enabled. If the POI layer was created on an earlier enable,
        // hide it; if it was never created (the default), there's nothing to do.
        if (map.getLayer("poi-circles")) {
          map.setFilter("poi-circles", ["==", ["get", "pinType"], "__none__"]);
        }
        return;
      }
      // First enable: lazily fetch + add the (heavy) POI source/layer.
      addPoiLayer(map);
      if (!map.getLayer("poi-circles")) return;
      const catFilter: unknown[] = ["in", ["get", "pinType"], ["literal", allowed]];
      // In buyer mode, clip amenity pins to the ~15-min walk circle around the
      // pin so they show what is actually nearby, not scattered citywide (founder
      // feedback). `within` is a supported MapLibre filter expression. In explore
      // mode (no pin) pins stay citywide, which is correct for browsing.
      const filter: unknown[] =
        buyerMode && pin
          ? ["all", catFilter, ["within", circlePolygon(pin, WALK_THRESHOLD_KM).geometry]]
          : catFilter;
      map.setFilter("poi-circles", filter as maplibregl.FilterSpecification);
    };
    if (!map.isStyleLoaded()) {
      map.once("idle", applyFilter);
      return;
    }
    applyFilter();
  }, [visiblePins, buyerMode, buyerPin]);

  // Highlight the selected SA2 by filtering the dedicated outline layer to its
  // slug. Updating a filter (not re-adding sources/layers) keeps the map view,
  // choropleth, and pins fully intact - selecting never reloads the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyFilter = () => {
      if (!map.getLayer("sa2-selected")) return;
      map.setFilter("sa2-selected", [
        "==",
        ["get", "slug"],
        selectedSlug ?? "__none__",
      ]);
    };
    if (!map.isStyleLoaded()) {
      map.once("idle", applyFilter);
      return;
    }
    applyFilter();
  }, [selectedSlug]);

  // Area search drives an in-app pan/zoom (no reload). Triggered only via the
  // `focusTarget` nonce; map clicks never set it, so clicking preserves view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget) return;
    map.flyTo({
      center: focusTarget.center,
      zoom: Math.max(map.getZoom(), 12),
      duration: prefersReducedMotion() ? 0 : 900,
      essential: true,
    });
    // Re-run when the nonce changes (same place can be searched twice).
  }, [focusTarget]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-full w-full"}
      role="application"
      aria-label="Greater Melbourne liveability map"
    />
  );
}
