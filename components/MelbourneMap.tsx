"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { DomainId } from "@/lib/types";
import { MELBOURNE_BOUNDS, MELBOURNE_CENTER } from "@/lib/region";
import { choroplethFillColor, choroplethFillColorByProp } from "@/lib/map-expressions";
import { withBase } from "@/lib/asset-path";
import { poiCircleColorExpression } from "@/lib/poi-categories";

// Light basemap to sit under the warm-editorial chrome; the YlGnBu choropleth
// remains the independent data channel on top.
const BASEMAP =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

type MelbourneMapProps = {
  className?: string;
  activeDomain: DomainId;
  confidenceMode?: boolean;
  walkAccessMode?: boolean;
  cyclabilityMode?: boolean;
  visiblePins?: Record<string, boolean>;
  onPlaceSelect?: (props: { slug?: string; name?: string; sa2Code?: string }) => void;
  /**
   * In-app camera target used by the area search (pan/zoom to a result) — a
   * `nonce` lets the same place re-trigger a fly-to. Map *clicks* deliberately
   * do NOT set this, so selecting an area on the map preserves the view.
   */
  focusTarget?: { center: [number, number]; nonce: number } | null;
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
  confidenceMode: boolean,
  walkAccessMode: boolean,
  cyclabilityMode: boolean
): unknown[] {
  if (walkAccessMode) return choroplethFillColorByProp("pct_walkaccess");
  if (cyclabilityMode) return choroplethFillColorByProp("pct_cyclability");
  if (confidenceMode) return choroplethFillColorByProp("pct_confidence");
  return choroplethFillColor(activeDomain);
}

export function MelbourneMap({
  className,
  activeDomain,
  confidenceMode = false,
  walkAccessMode = false,
  cyclabilityMode = false,
  visiblePins = {},
  onPlaceSelect,
  focusTarget = null,
}: MelbourneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Keep the latest select handler in a ref so the map is initialised exactly
  // once. Putting `onPlaceSelect` in the init effect's deps caused the whole
  // map to be torn down and rebuilt on every parent re-render (the "everything
  // refreshes the map" bug), resetting the view and layers on every click.
  const onPlaceSelectRef = useRef(onPlaceSelect);
  useEffect(() => {
    onPlaceSelectRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP,
      center: MELBOURNE_CENTER,
      zoom: 9,
      maxBounds: [
        [MELBOURNE_BOUNDS[0][0] - 0.2, MELBOURNE_BOUNDS[0][1] - 0.2],
        [MELBOURNE_BOUNDS[1][0] + 0.2, MELBOURNE_BOUNDS[1][1] + 0.2],
      ],
    });

    // Nav (+/–) lives top-left so it never collides with the floating layer
    // control / legend card pinned to the top-right.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.fitBounds(MELBOURNE_BOUNDS, { padding: 40, duration: 0 });

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
            confidenceMode,
            walkAccessMode,
            cyclabilityMode
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

      map.addSource("pois", {
        type: "geojson",
        data: withBase("/data/pois.geojson"),
      });
      map.addLayer({
        id: "poi-circles",
        type: "circle",
        source: "pois",
        // Hidden until the user enables a category (all pins off by default).
        filter: ["==", ["get", "pinType"], "__none__"],
        paint: {
          "circle-radius": 4.5,
          // Categorical colour-by-category — independent of the YlGnBu data ramp.
          "circle-color": poiCircleColorExpression() as maplibregl.ExpressionSpecification,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.95,
        },
      });
    });

    map.on("click", "sa2-fill", (e) => {
      const f = e.features?.[0];
      if (!f?.properties) return;
      onPlaceSelectRef.current?.({
        slug: f.properties.slug as string | undefined,
        name: f.properties.name as string | undefined,
        sa2Code: f.properties.sa2Code as string | undefined,
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  // Initialise the map exactly once; the click handler reads the latest
  // callback from a ref (see above), so no init-time dependencies are needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- map init once
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("sa2-fill")) return;
    const color = fillColorFor(
      activeDomain,
      confidenceMode,
      walkAccessMode,
      cyclabilityMode
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
  }, [activeDomain, confidenceMode, walkAccessMode, cyclabilityMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("poi-circles")) return;

    // Pins are user-controlled per category and independent of the active
    // choropleth domain. Show only the categories explicitly enabled.
    const allowed = Object.keys(visiblePins).filter((k) => visiblePins[k]);
    const applyFilter = () => {
      if (!map.getLayer("poi-circles")) return;
      map.setFilter(
        "poi-circles",
        allowed.length === 0
          ? ["==", ["get", "pinType"], "__none__"]
          : ["in", ["get", "pinType"], ["literal", allowed]]
      );
    };
    if (!map.isStyleLoaded()) {
      map.once("idle", applyFilter);
      return;
    }
    applyFilter();
  }, [visiblePins]);

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
