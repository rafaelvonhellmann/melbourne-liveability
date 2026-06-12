/**
 * P4.1 Phase A - region registry: completeness of the eight GCCSA entries,
 * exact preservation of the Melbourne aliases (the pipeline must stay
 * byte-identical with no region arg), and region resolution defaults.
 */
import { describe, expect, it } from "vitest";
import REGIONS, {
  DEFAULT_REGION,
  REGION_IDS,
  getRegion,
  overpassBbox,
  resolveRegionId,
  type RegionId,
} from "../lib/regions";
import { GREATER_MELBOURNE_GCCSA } from "../lib/crosswalk-types";
import { inMelbourneBBox } from "../lib/share-url";
import { MEL_BBOX, PTV_GTFS_URL } from "../scripts/lib/gtfs-constants";
import {
  lgaRawName,
  regionIdFromArgs,
  sa2RawName,
  salRawName,
} from "../scripts/lib/pipeline-region";

const EXPECTED: Record<RegionId, { gccsa: string; state: string }> = {
  melbourne: { gccsa: "2GMEL", state: "VIC" },
  sydney: { gccsa: "1GSYD", state: "NSW" },
  brisbane: { gccsa: "3GBRI", state: "QLD" },
  adelaide: { gccsa: "4GADE", state: "SA" },
  perth: { gccsa: "5GPER", state: "WA" },
  hobart: { gccsa: "6GHOB", state: "TAS" },
  darwin: { gccsa: "7GDAR", state: "NT" },
  canberra: { gccsa: "8ACTE", state: "ACT" },
};

describe("registry completeness", () => {
  it("has exactly the eight greater capital regions", () => {
    expect([...REGION_IDS].sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(REGION_IDS).toHaveLength(8);
  });

  it("carries the correct ASGS Ed.3 GCCSA code and state per region", () => {
    for (const id of REGION_IDS) {
      const r = REGIONS[id];
      expect(r.id).toBe(id);
      expect(r.gccsa).toBe(EXPECTED[id].gccsa);
      expect(r.state).toBe(EXPECTED[id].state);
      // ABS convention: GCCSA code leads with the single-digit state code.
      expect(r.stateCode).toBe(r.gccsa[0]);
      expect(r.stateSlug).toBe(r.state.toLowerCase());
    }
  });

  it("has sane bboxes (west<east, south<north, inside Australia)", () => {
    for (const id of REGION_IDS) {
      const r = REGIONS[id];
      for (const box of [r.bbox, r.pinBbox]) {
        expect(box.west).toBeLessThan(box.east);
        expect(box.south).toBeLessThan(box.north);
        expect(box.west).toBeGreaterThan(110);
        expect(box.east).toBeLessThan(155);
        expect(box.south).toBeGreaterThan(-45);
        expect(box.north).toBeLessThan(-10);
      }
      // The generous pin envelope must contain the data extent.
      expect(r.pinBbox.west).toBeLessThanOrEqual(r.bbox.west);
      expect(r.pinBbox.east).toBeGreaterThanOrEqual(r.bbox.east);
      expect(r.pinBbox.south).toBeLessThanOrEqual(r.bbox.south);
      expect(r.pinBbox.north).toBeGreaterThanOrEqual(r.bbox.north);
      // maxBounds (panning) contains the pin envelope.
      const [[w, s], [e, n]] = r.maxBounds;
      expect(w).toBeLessThanOrEqual(r.pinBbox.west);
      expect(e).toBeGreaterThanOrEqual(r.pinBbox.east);
      expect(s).toBeLessThanOrEqual(r.pinBbox.south);
      expect(n).toBeGreaterThanOrEqual(r.pinBbox.north);
      // Map center sits inside the data extent.
      const [lng, lat] = r.mapCenter;
      expect(lng).toBeGreaterThan(r.bbox.west);
      expect(lng).toBeLessThan(r.bbox.east);
      expect(lat).toBeGreaterThan(r.bbox.south);
      expect(lat).toBeLessThan(r.bbox.north);
      expect(r.zoom).toBeGreaterThanOrEqual(8);
      expect(r.zoom).toBeLessThanOrEqual(12);
    }
  });

  it("flags Canberra as whole-of-territory with no councils", () => {
    expect(REGIONS.canberra.gccsa).toBe("8ACTE");
    expect(REGIONS.canberra.hasCouncils).toBe(false);
    for (const id of REGION_IDS) {
      if (id !== "canberra") expect(REGIONS[id].hasCouncils).toBe(true);
    }
  });
});

describe("Melbourne aliases (exact pre-registry values)", () => {
  it("GREATER_MELBOURNE_GCCSA is still 2GMEL", () => {
    expect(GREATER_MELBOURNE_GCCSA).toBe("2GMEL");
  });

  it("melbourne registry values are unchanged (ex lib/region.ts aliases)", () => {
    const m = REGIONS.melbourne;
    expect(m.mapCenter).toEqual([144.9631, -37.8136]);
    expect([
      [m.bbox.west, m.bbox.south],
      [m.bbox.east, m.bbox.north],
    ]).toEqual([
      [144.45, -38.35],
      [145.65, -37.45],
    ]);
    expect(m.maxBounds).toEqual([
      [141.0, -39.6],
      [148.8, -36.0],
    ]);
  });

  it("scripts/lib/gtfs-constants values are unchanged", () => {
    expect(MEL_BBOX).toEqual({
      south: -38.35,
      west: 144.45,
      north: -37.45,
      east: 145.65,
    });
    expect(PTV_GTFS_URL).toBe(
      "https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip"
    );
  });

  it("Overpass bbox clause matches the historical literal exactly", () => {
    expect(overpassBbox(REGIONS.melbourne)).toBe(
      "(-38.35,144.45,-37.45,145.65)"
    );
  });

  it("share-url pin validation keeps the generous 143..147 / -39.5..-36.5 box", () => {
    expect(inMelbourneBBox(144.9631, -37.8136)).toBe(true);
    // Exact boundary values are inclusive, just like the old literal box.
    expect(inMelbourneBBox(143.0, -39.5)).toBe(true);
    expect(inMelbourneBBox(147.0, -36.5)).toBe(true);
    // Just outside each edge.
    expect(inMelbourneBBox(142.99, -37.8)).toBe(false);
    expect(inMelbourneBBox(147.01, -37.8)).toBe(false);
    expect(inMelbourneBBox(144.9, -39.51)).toBe(false);
    expect(inMelbourneBBox(144.9, -36.49)).toBe(false);
    // Sydney is not Melbourne.
    expect(inMelbourneBBox(151.2093, -33.8688)).toBe(false);
  });

  it("raw filenames keep the historical melbourne/vic names by default", () => {
    expect(sa2RawName()).toBe("sa2-melbourne.geojson");
    expect(salRawName()).toBe("sal-vic.geojson");
    expect(lgaRawName()).toBe("lga-vic.geojson");
    // ...and parameterize for another region.
    expect(sa2RawName(REGIONS.canberra)).toBe("sa2-canberra.geojson");
    expect(salRawName(REGIONS.canberra)).toBe("sal-act.geojson");
    expect(lgaRawName(REGIONS.sydney)).toBe("lga-nsw.geojson");
  });
});

describe("region resolution", () => {
  it("defaults to melbourne", () => {
    expect(DEFAULT_REGION).toBe("melbourne");
    expect(resolveRegionId(undefined)).toBe("melbourne");
    expect(resolveRegionId(null)).toBe("melbourne");
    expect(resolveRegionId("")).toBe("melbourne");
    expect(resolveRegionId("  ")).toBe("melbourne");
  });

  it("resolves valid ids (case/whitespace tolerant)", () => {
    expect(resolveRegionId("sydney")).toBe("sydney");
    expect(resolveRegionId(" Canberra ")).toBe("canberra");
    expect(getRegion("perth").gccsa).toBe("5GPER");
  });

  it("throws loudly on unknown ids instead of silently defaulting", () => {
    expect(() => resolveRegionId("sydny")).toThrow(/Unknown region/);
    expect(() => getRegion("2GMEL")).toThrow(/Valid regions/);
  });

  it("extracts the region from CLI args or REGION env (arg wins)", () => {
    expect(regionIdFromArgs(["--region=sydney"], {})).toBe("sydney");
    expect(regionIdFromArgs(["--region", "perth"], {})).toBe("perth");
    expect(regionIdFromArgs([], { REGION: "hobart" })).toBe("hobart");
    expect(
      regionIdFromArgs(["--region=darwin"], { REGION: "hobart" })
    ).toBe("darwin");
    expect(regionIdFromArgs([], {})).toBeUndefined();
    // The vitest/tsx runner's own args must never be mistaken for a region.
    expect(regionIdFromArgs(["run", "tests/regions.test.ts"], {})).toBeUndefined();
  });
});
