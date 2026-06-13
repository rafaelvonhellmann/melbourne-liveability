import { describe, expect, it } from "vitest";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { HazardPlace } from "../scripts/lib/hazard-adapters";
import {
  NSW_BFPL_LAYER_URL,
  NSW_EPI_FLOOD_LAYER_URL,
  NSW_EPI_FLOOD_WHERE,
  applyNswHazardsToPlaces,
  nswHazardsAdapter,
} from "../scripts/lib/nsw-hazards";

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
    features: geoms.map((g) => ({
      type: "Feature",
      properties: {},
      geometry: g,
    })),
  };
}

const GEOMS = new Map<string, Polygon | MultiPolygon>([
  ["A", square(151.0, -34.0, 151.01, -33.99)],
  ["B", square(151.02, -34.0, 151.03, -33.99)],
]);

function places(): HazardPlace[] {
  return ["A", "B", "C"].map((sa2Code) => ({
    sa2Code,
    bushfirePct: null,
    floodPct: null,
  }));
}

describe("nswHazardsAdapter metadata", () => {
  it("exports the unregistered NSW adapter with stable source ids", () => {
    expect(nswHazardsAdapter.bushfireSourceId).toBe(
      "nsw-rfs-bush-fire-prone-land"
    );
    expect(nswHazardsAdapter.floodSourceId).toBe(
      "nsw-epi-flood-planning-area"
    );
    expect(typeof nswHazardsAdapter.fetch).toBe("function");
    expect(typeof nswHazardsAdapter.normalize).toBe("function");
  });

  it("pins the verified open ArcGIS layers", () => {
    expect(NSW_BFPL_LAYER_URL).toBe(
      "https://portal.spatial.nsw.gov.au/server/rest/services/Hosted/NSW_BushFire_Prone_Land/FeatureServer/0"
    );
    expect(NSW_EPI_FLOOD_LAYER_URL).toBe(
      "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/Planning_Portal_Hazard/MapServer/230"
    );
  });

  it("keeps the EPI flood query scoped to flood classes only", () => {
    expect(NSW_EPI_FLOOD_WHERE).toContain("'Flood Planning Area'");
    expect(NSW_EPI_FLOOD_WHERE).toContain(
      "'Flood Prone and Major Creeks Land'"
    );
    expect(NSW_EPI_FLOOD_WHERE).toContain(
      "'Level of Probable Maximum Flood'"
    );
    expect(NSW_EPI_FLOOD_WHERE).not.toContain("Cultural Heritage Landscape Area");
    expect(NSW_EPI_FLOOD_WHERE).not.toContain("Transitional Land");
  });
});

describe("applyNswHazardsToPlaces pct math", () => {
  const bfpl = fc(square(151.0, -34.0, 151.005, -33.99));
  const flood = fc(square(151.0, -34.0, 151.005, -33.99));

  it("computes area-weighted shares for every SA2 with geometry", () => {
    const ps = places();
    const stats = applyNswHazardsToPlaces(ps, GEOMS, bfpl, flood);

    const [a, b, c] = ps;
    expect(a.bushfirePct!).toBeGreaterThan(49);
    expect(a.bushfirePct!).toBeLessThan(51);
    expect(a.floodPct!).toBeGreaterThan(49);
    expect(a.floodPct!).toBeLessThan(51);

    expect(b.bushfirePct).toBe(0);
    expect(b.floodPct).toBe(0);

    expect(c.bushfirePct).toBeNull();
    expect(c.floodPct).toBeNull();
    expect(stats).toEqual({ bushfireSa2: 2, floodSa2: 2 });
  });

  it("missing flood file leaves floodPct null while bushfire still applies", () => {
    const ps = places();
    const stats = applyNswHazardsToPlaces(ps, GEOMS, bfpl, null);

    expect(ps[0].bushfirePct!).toBeGreaterThan(49);
    expect(ps[1].bushfirePct).toBe(0);
    expect(ps.every((p) => p.floodPct === null)).toBe(true);
    expect(stats).toEqual({ bushfireSa2: 2, floodSa2: 0 });
  });

  it("missing bushfire file leaves bushfirePct null while flood still applies", () => {
    const ps = places();
    const stats = applyNswHazardsToPlaces(ps, GEOMS, null, flood);

    expect(ps.every((p) => p.bushfirePct === null)).toBe(true);
    expect(ps[0].floodPct!).toBeGreaterThan(49);
    expect(ps[1].floodPct).toBe(0);
    expect(stats).toEqual({ bushfireSa2: 0, floodSa2: 2 });
  });
});
