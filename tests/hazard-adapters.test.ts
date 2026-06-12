import { describe, it, expect } from "vitest";
import type { Polygon, MultiPolygon, FeatureCollection } from "geojson";
import {
  hazardAdapterFor,
  applyQldHazardsToPlaces,
  sa2InFloodCoveredLga,
  type HazardPlace,
} from "../scripts/lib/hazard-adapters";
import { getRegion, REGION_IDS } from "../lib/regions";
import type { CrosswalkFile, SuburbOverlap } from "../lib/crosswalk-types";

/**
 * Registry pins for the per-state hazard adapters. The VIC mapping is
 * load-bearing for the Melbourne regression: its sourceIds must stay
 * "vic-planning-bpa" / "vic-planning-flood" or every baked hazards indicator
 * changes provenance. Canberra is pinned to null: the ACT has a CRIME adapter
 * but no hazard adapter - the two registries must not be conflated.
 */
describe("hazardAdapterFor registry", () => {
  it("melbourne (VIC) gets the Vicmap adapter with the historical sourceIds", () => {
    const a = hazardAdapterFor(getRegion("melbourne"));
    expect(a).not.toBeNull();
    expect(a!.bushfireSourceId).toBe("vic-planning-bpa");
    expect(a!.floodSourceId).toBe("vic-planning-flood");
    expect(typeof a!.fetch).toBe("function");
    expect(typeof a!.normalize).toBe("function");
  });

  it("brisbane (QLD) gets the QFES SPP + BCC flood adapter", () => {
    const a = hazardAdapterFor(getRegion("brisbane"));
    expect(a).not.toBeNull();
    expect(a!.bushfireSourceId).toBe("qld-spp-bushfire-prone-area");
    expect(a!.floodSourceId).toBe("bcc-cityplan-flood-overlay");
    expect(typeof a!.fetch).toBe("function");
    expect(typeof a!.normalize).toBe("function");
  });

  it("states without an adapter resolve to null (hazards unscored) - incl. the ACT", () => {
    for (const id of [
      "sydney",
      "adelaide",
      "perth",
      "hobart",
      "darwin",
      "canberra",
    ] as const) {
      expect(hazardAdapterFor(getRegion(id))).toBeNull();
    }
  });

  it("every region resolves without throwing", () => {
    for (const id of REGION_IDS) {
      expect(() => hazardAdapterFor(getRegion(id))).not.toThrow();
    }
  });
});

/* ----------------------- QLD pct-math fixtures ------------------------- */

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
    features: geoms.map((g) => ({ type: "Feature", properties: {}, geometry: g })),
  };
}

function ov(suburb: string, lga: string, weight: number): SuburbOverlap {
  return { suburb, salCode: suburb, lga, weight, method: "population-weighted" };
}

/** A: fully Brisbane. B: fully Logan (flood NOT covered). C: Brisbane-majority
 * split with the QPS-style council suffix (exercises normalizeQldLgaName). */
function cwFixture(): CrosswalkFile {
  return {
    region: "brisbane",
    generatedAt: "2026-01-01",
    sa2ToSuburb: {
      A: { sa2Code: "A", sa2Name: "Alpha", suburbs: [ov("Alpha", "Brisbane", 1)] },
      B: { sa2Code: "B", sa2Name: "Beta", suburbs: [ov("Beta", "Logan", 1)] },
      C: {
        sa2Code: "C",
        sa2Name: "Gamma",
        suburbs: [
          ov("Gamma", "Brisbane City Council", 0.6),
          ov("Gamma West", "Ipswich", 0.4),
        ],
      },
    },
    suburbToSa2: {},
    suburbAliases: {},
  };
}

// Three disjoint ~1.1 km squares near Brisbane.
const GEOMS = new Map<string, Polygon | MultiPolygon>([
  ["A", square(153.0, -27.5, 153.01, -27.49)],
  ["B", square(153.02, -27.5, 153.03, -27.49)],
  ["C", square(153.04, -27.5, 153.05, -27.49)],
]);

function places(): (HazardPlace & { sa2Code: string })[] {
  return ["A", "B", "C"].map((sa2Code) => ({
    sa2Code,
    bushfirePct: null,
    floodPct: null,
  }));
}

describe("sa2InFloodCoveredLga", () => {
  const cw = cwFixture();
  it("full-Brisbane SA2 is covered", () => {
    expect(sa2InFloodCoveredLga(cw, "A")).toBe(true);
  });
  it("Logan SA2 is not covered", () => {
    expect(sa2InFloodCoveredLga(cw, "B")).toBe(false);
  });
  it("Brisbane-majority SA2 is covered (council suffix normalized)", () => {
    expect(sa2InFloodCoveredLga(cw, "C")).toBe(true);
  });
  it("SA2 missing from the crosswalk is not covered", () => {
    expect(sa2InFloodCoveredLga(cw, "ZZZ")).toBe(false);
  });
});

describe("applyQldHazardsToPlaces pct math", () => {
  // BPA covers the western half of A; flood covers the western half of A and
  // ALL of B (which must still stay null - Logan is unmapped).
  const bpa = fc(square(153.0, -27.5, 153.005, -27.49));
  const flood = fc(
    square(153.0, -27.5, 153.005, -27.49),
    square(153.02, -27.5, 153.03, -27.49)
  );

  it("computes area-weighted shares; unmapped councils stay null, mapped no-overlap is 0", () => {
    const ps = places();
    const stats = applyQldHazardsToPlaces(ps, cwFixture(), GEOMS, bpa, flood);

    const [a, b, c] = ps;
    // A: half-covered by both overlays.
    expect(a.bushfirePct).not.toBeNull();
    expect(a.bushfirePct!).toBeGreaterThan(49);
    expect(a.bushfirePct!).toBeLessThan(51);
    expect(a.floodPct!).toBeGreaterThan(49);
    expect(a.floodPct!).toBeLessThan(51);

    // B: bushfire is statewide so 0 is honest; flood is MISSING (Logan), even
    // though a flood polygon physically covers B - no fake data outside the
    // mapped council.
    expect(b.bushfirePct).toBe(0);
    expect(b.floodPct).toBeNull();

    // C: mapped council, no overlap with either overlay -> real zeroes.
    expect(c.bushfirePct).toBe(0);
    expect(c.floodPct).toBe(0);

    expect(stats.bushfireSa2).toBe(3);
    expect(stats.floodSa2).toBe(2); // A + C
    expect(stats.floodSkipped).toBe(1); // B
  });

  it("missing flood file leaves floodPct null everywhere (bushfire still applies)", () => {
    const ps = places();
    const stats = applyQldHazardsToPlaces(ps, cwFixture(), GEOMS, bpa, null);
    expect(ps.every((p) => p.floodPct === null)).toBe(true);
    expect(ps[0].bushfirePct!).toBeGreaterThan(49);
    expect(stats.floodSa2).toBe(0);
  });

  it("missing bushfire file leaves bushfirePct null (flood still applies)", () => {
    const ps = places();
    applyQldHazardsToPlaces(ps, cwFixture(), GEOMS, null, flood);
    expect(ps.every((p) => p.bushfirePct === null)).toBe(true);
    expect(ps[0].floodPct!).toBeGreaterThan(49);
  });
});
