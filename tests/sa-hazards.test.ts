import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { getRegion, type RegionBbox } from "../lib/regions";
import type { HazardPlace } from "../scripts/lib/hazard-adapters";
import {
  SA_BUSHFIRE_LAYERS,
  SA_BUSHFIRE_PCT_CLASS_MAPPING,
  SA_BUSHFIRE_RAW_FILE,
  SA_BUSHFIRE_SOURCE_ID,
  SA_FLOOD_LAYERS,
  SA_FLOOD_RAW_FILE,
  SA_FLOOD_SOURCE_ID,
  SA_PLANSA_ATLAS_MAPSERVER,
  applySaHazardsToPlaces,
  fetchSaHazardLayerGeoJson,
  fetchSaHazardObjectIds,
  saHazardsAdapter,
  saHazardLayerUrl,
} from "../scripts/lib/sa-hazards";

function square(w: number, s: number, e: number, n: number): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}

function fc(...geoms: Polygon[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: geoms.map((geometry) => ({
      type: "Feature",
      properties: {},
      geometry,
    })),
  };
}

async function loadAdelaideSampleGeoms(): Promise<Map<string, Polygon | MultiPolygon>> {
  const file = path.join(process.cwd(), "public", "data", "places.adelaide.geojson");
  const geo = JSON.parse(await readFile(file, "utf8")) as FeatureCollection;
  const wanted = new Set(["401011001", "401021003", "401021004"]);
  const out = new Map<string, Polygon | MultiPolygon>();
  for (const f of geo.features) {
    const code = String(f.properties?.sa2Code ?? "");
    if (
      wanted.has(code) &&
      f.geometry &&
      (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
    ) {
      out.set(code, f.geometry);
    }
  }
  return out;
}

function samplePlaces(): HazardPlace[] {
  return [
    { sa2Code: "401011001", bushfirePct: null, floodPct: null }, // Adelaide
    { sa2Code: "401021003", bushfirePct: null, floodPct: null }, // Adelaide Hills
    { sa2Code: "401021004", bushfirePct: null, floodPct: null }, // Aldgate - Stirling
  ];
}

function bboxOf(geom: Polygon | MultiPolygon): RegionBbox {
  const rings =
    geom.type === "Polygon"
      ? geom.coordinates.flat(1)
      : geom.coordinates.flat(2);
  const xs = rings.map(([x]) => x);
  const ys = rings.map(([, y]) => y);
  return {
    west: Math.min(...xs),
    south: Math.min(...ys),
    east: Math.max(...xs),
    north: Math.max(...ys),
  };
}

describe("SA hazards adapter metadata", () => {
  it("exports a ready-to-register adapter and raw filenames", () => {
    expect(saHazardsAdapter.bushfireSourceId).toBe(SA_BUSHFIRE_SOURCE_ID);
    expect(saHazardsAdapter.floodSourceId).toBe(SA_FLOOD_SOURCE_ID);
    expect(SA_BUSHFIRE_RAW_FILE).toBe("sa-plansa-bushfire.geojson");
    expect(SA_FLOOD_RAW_FILE).toBe("sa-plansa-flood.geojson");
    expect(typeof saHazardsAdapter.fetch).toBe("function");
    expect(typeof saHazardsAdapter.normalize).toBe("function");
  });

  it("pins the SAPPA Planning and Design Code hazard sublayers", () => {
    expect(SA_PLANSA_ATLAS_MAPSERVER).toContain(
      "/SAPPA/PropertyPlanningAtlasV18/MapServer"
    );
    expect(SA_BUSHFIRE_LAYERS.map((l) => [l.id, l.name])).toEqual([
      [135, "Hazards (Bushfire - High Risk)"],
      [136, "Hazards (Bushfire - Medium Risk)"],
      [137, "Hazards (Bushfire - General Risk)"],
      [138, "Hazards (Bushfire - Outback)"],
      [139, "Hazards (Bushfire - Regional)"],
      [140, "Hazards (Bushfire - Urban Interface)"],
    ]);
    expect(SA_FLOOD_LAYERS.map((l) => [l.id, l.name])).toEqual([
      [141, "Hazards (Flooding High)"],
      [372, "Hazards (Flooding General)"],
      [403, "Hazards (Flooding Evidence Required)"],
    ]);
    expect(saHazardLayerUrl(SA_BUSHFIRE_LAYERS[0])).toBe(
      `${SA_PLANSA_ATLAS_MAPSERVER}/135`
    );
  });

  it("maps every SA bushfire class to QLD-style positive coverage pct semantics", () => {
    expect(SA_BUSHFIRE_PCT_CLASS_MAPPING).toEqual({
      "High Risk": "positive-coverage",
      "Medium Risk": "positive-coverage",
      "General Risk": "positive-coverage",
      Outback: "positive-coverage",
      Regional: "positive-coverage",
      "Urban Interface": "positive-coverage",
    });
    expect(
      SA_BUSHFIRE_LAYERS.every(
        (layer) => layer.pctClass === "positive-coverage"
      )
    ).toBe(true);
  });
});

describe("applySaHazardsToPlaces pct math", () => {
  const geoms = new Map<string, Polygon | MultiPolygon>([
    ["A", square(138.6, -35.0, 138.61, -34.99)],
    ["B", square(138.62, -35.0, 138.63, -34.99)],
    ["C", square(138.64, -35.0, 138.65, -34.99)],
  ]);
  const places = (): HazardPlace[] =>
    ["A", "B", "C"].map((sa2Code) => ({
      sa2Code,
      bushfirePct: null,
      floodPct: null,
    }));

  it("computes statewide-style area shares without LGA coverage gating", () => {
    const ps = places();
    const bushfire = fc(square(138.6, -35.0, 138.605, -34.99));
    const flood = fc(square(138.62, -35.0, 138.63, -34.99));
    const stats = applySaHazardsToPlaces(ps, geoms, bushfire, flood);

    expect(ps[0].bushfirePct!).toBeGreaterThan(49);
    expect(ps[0].bushfirePct!).toBeLessThan(51);
    expect(ps[0].floodPct).toBe(0);
    expect(ps[1].bushfirePct).toBe(0);
    expect(ps[1].floodPct).toBe(100);
    expect(ps[2].bushfirePct).toBe(0);
    expect(ps[2].floodPct).toBe(0);
    expect(stats).toEqual({ bushfireSa2: 3, floodSa2: 3 });
  });

  it("leaves missing raw layers as null per indicator", () => {
    const ps = places();
    applySaHazardsToPlaces(ps, geoms, null, fc(square(138.6, -35.0, 138.61, -34.99)));
    expect(ps.every((p) => p.bushfirePct === null)).toBe(true);
    expect(ps[0].floodPct).toBe(100);
  });
});

describe("SA hazards real clipped fetch", () => {
  it("fetches real PlanSA/SAPPA hazard features and applies them to three Adelaide SA2 samples", async () => {
    const adelaide = getRegion("adelaide");
    const geoms = await loadAdelaideSampleGeoms();
    expect(geoms.size).toBe(3);

    const sampleEnvelope = bboxOf(geoms.get("401021004")!);
    expect(sampleEnvelope.west).toBeGreaterThanOrEqual(adelaide.bbox.west);
    expect(sampleEnvelope.east).toBeLessThanOrEqual(adelaide.bbox.east);

    const bushfireLayer = SA_BUSHFIRE_LAYERS[0];
    const floodLayer = SA_FLOOD_LAYERS[0];
    const bushfireIds = await fetchSaHazardObjectIds(bushfireLayer, sampleEnvelope);
    const floodIds = await fetchSaHazardObjectIds(floodLayer, sampleEnvelope);
    expect(bushfireIds.length).toBeGreaterThan(0);
    expect(floodIds.length).toBeGreaterThan(0);

    const bushfire = await fetchSaHazardLayerGeoJson(bushfireLayer, sampleEnvelope, {
      where: `objectid in (${bushfireIds.slice(0, 3).join(",")})`,
      pageSize: 10,
      maxPages: 1,
      geometryPrecision: 5,
    });
    const flood = await fetchSaHazardLayerGeoJson(floodLayer, sampleEnvelope, {
      where: `objectid in (${floodIds.slice(0, 3).join(",")})`,
      pageSize: 10,
      maxPages: 1,
      geometryPrecision: 5,
    });

    expect(bushfire.features.length).toBeGreaterThan(0);
    expect(flood.features.length).toBeGreaterThan(0);
    expect(bushfire.features[0].properties).toMatchObject({
      sourceLayer: "Hazards (Bushfire - High Risk)",
      hazardKind: "bushfire",
      hazardClass: "High Risk",
      pctClass: "positive-coverage",
    });
    expect(flood.features[0].properties).toMatchObject({
      sourceLayer: "Hazards (Flooding High)",
      hazardKind: "flood",
      hazardClass: "High",
      pctClass: "positive-coverage",
    });

    const ps = samplePlaces();
    const stats = applySaHazardsToPlaces(ps, geoms, bushfire, flood);
    expect(stats).toEqual({ bushfireSa2: 3, floodSa2: 3 });
    expect(ps.some((p) => (p.bushfirePct ?? 0) > 0)).toBe(true);
    for (const p of ps) {
      expect(p.bushfirePct).not.toBeNull();
      expect(p.floodPct).not.toBeNull();
      expect(p.bushfirePct!).toBeGreaterThanOrEqual(0);
      expect(p.bushfirePct!).toBeLessThanOrEqual(100);
      expect(p.floodPct!).toBeGreaterThanOrEqual(0);
      expect(p.floodPct!).toBeLessThanOrEqual(100);
    }
  }, 60_000);
});
