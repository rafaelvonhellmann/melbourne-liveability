"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { DomainId } from "@/lib/types";
import { MELBOURNE_BOUNDS, MELBOURNE_CENTER } from "@/lib/region";
import { choroplethFillColor, choroplethFillColorByProp } from "@/lib/map-expressions";
import { getDomain } from "@/lib/domains";
import { withBase } from "@/lib/asset-path";

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
};

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
}: MelbourneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

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

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
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
        paint: {
          "circle-radius": 4,
          "circle-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#D97757",
          "circle-opacity": 0.95,
        },
      });
    });

    map.on("click", "sa2-fill", (e) => {
      const f = e.features?.[0];
      if (!f?.properties || !onPlaceSelect) return;
      onPlaceSelect({
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- map init once
  }, [onPlaceSelect]);

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

    const cfg = getDomain(activeDomain);
    const allowed = (cfg?.pinTypes ?? []).filter((pin) => visiblePins[pin] !== false);
    if (allowed.length === 0) {
      map.setFilter("poi-circles", ["==", ["get", "pinType"], ""]);
      return;
    }
    map.setFilter("poi-circles", [
      "in",
      ["get", "pinType"],
      ["literal", allowed],
    ]);
  }, [activeDomain, visiblePins]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-full w-full"}
      role="application"
      aria-label="Greater Melbourne liveability map"
    />
  );
}
