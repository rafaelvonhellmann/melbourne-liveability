/**
 * P4.1 Phase B - per-region output emit: the shared filename helper
 * (lib/regions.ts), the pipeline path helpers (scripts/lib/pipeline-region.ts)
 * and the coverage gate's region-aware baseline paths. Melbourne must resolve
 * to the EXACT historical names/URLs (zero churn for the live site); every
 * other region gets its id inserted before the extension; unsafe names throw.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import REGIONS, { dataPath, regionDataFile, type RegionId } from "../lib/regions";
import {
  IS_DEFAULT_REGION,
  generatedOutPath,
  outName,
  publicOutPath,
  rawOutPath,
} from "../scripts/lib/pipeline-region";
import {
  CARRIED_REL_PATH,
  REL_PATH,
  existsInHead,
} from "../scripts/verify-coverage-diff";

describe("regionDataFile / dataPath (lib/regions)", () => {
  it("melbourne keeps the exact historical filenames (zero churn)", () => {
    expect(regionDataFile("melbourne", "places.json")).toBe("places.json");
    expect(regionDataFile("melbourne", "places.geojson")).toBe("places.geojson");
    expect(regionDataFile("melbourne", "pois.geojson")).toBe("pois.geojson");
    expect(regionDataFile("melbourne", "carried-fields.json")).toBe("carried-fields.json");
    expect(dataPath("melbourne", "places.json")).toBe("/data/places.json");
    expect(dataPath("melbourne", "timeseries.json")).toBe("/data/timeseries.json");
  });

  it("non-default regions get the id inserted before the extension", () => {
    expect(regionDataFile("canberra", "places.json")).toBe("places.canberra.json");
    expect(regionDataFile("canberra", "places.geojson")).toBe("places.canberra.geojson");
    expect(regionDataFile("canberra", "pois.geojson")).toBe("pois.canberra.geojson");
    expect(regionDataFile("sydney", "gtfs-transport.json")).toBe(
      "gtfs-transport.sydney.json"
    );
    expect(regionDataFile("canberra", "carried-fields.json")).toBe(
      "carried-fields.canberra.json"
    );
    expect(dataPath("canberra", "places.json")).toBe("/data/places.canberra.json");
  });

  it("suffixes extensionless names at the end", () => {
    expect(regionDataFile("canberra", "report-tiles")).toBe("report-tiles.canberra");
    expect(regionDataFile("melbourne", "report-tiles")).toBe("report-tiles");
  });

  it("rejects traversal and non-bare names loudly", () => {
    for (const bad of [
      "../places.json",
      "..\\places.json",
      "a/../b.json",
      "data/places.json",
      "data\\places.json",
      "places..json",
      ".places.json",
      "",
      " places.json",
    ]) {
      expect(() => regionDataFile("canberra", bad), bad).toThrow(/Unsafe data filename/);
      expect(() => regionDataFile("melbourne", bad), bad).toThrow(/Unsafe data filename/);
    }
  });

  it("rejects unknown region ids instead of silently defaulting", () => {
    expect(() => regionDataFile("sydny" as RegionId, "places.json")).toThrow(
      /Unknown region/
    );
  });
});

describe("pipeline output paths (scripts/lib/pipeline-region)", () => {
  it("defaults to the melbourne run (no REGION env in tests)", () => {
    expect(IS_DEFAULT_REGION).toBe(true);
    expect(outName("places.json")).toBe("places.json");
    expect(generatedOutPath("places.json").endsWith(path.join("data", "generated", "places.json"))).toBe(true);
    expect(publicOutPath("pois.geojson").endsWith(path.join("public", "data", "pois.geojson"))).toBe(true);
    expect(
      rawOutPath("places-pre-score-snapshot.json").endsWith(
        path.join("data", "raw", "places-pre-score-snapshot.json")
      )
    ).toBe(true);
  });

  it("suffixes for an explicit non-default region", () => {
    expect(outName("places.json", REGIONS.canberra)).toBe("places.canberra.json");
    expect(
      generatedOutPath("indicators-raw.json", REGIONS.canberra).endsWith(
        path.join("data", "generated", "indicators-raw.canberra.json")
      )
    ).toBe(true);
    expect(
      publicOutPath("places.geojson", REGIONS.canberra).endsWith(
        path.join("public", "data", "places.canberra.geojson")
      )
    ).toBe(true);
  });
});

describe("coverage gate region-awareness", () => {
  it("targets the melbourne artifact by default (unchanged rel paths)", () => {
    expect(REL_PATH).toBe("data/generated/places.json");
    expect(CARRIED_REL_PATH).toBe("data/generated/carried-fields.json");
  });

  it("a region with no committed baseline is a first-run pass (absent in HEAD)", () => {
    // Canberra has never been committed - the gate's existsInHead check must
    // report it absent so the first canberra refresh passes silently.
    expect(existsInHead("data/generated/places.canberra.json")).toBe(false);
    expect(existsInHead("data/generated/carried-fields.canberra.json")).toBe(false);
    // ...while the melbourne baseline is present (gate actually compares).
    expect(existsInHead("data/generated/places.json")).toBe(true);
  });
});
