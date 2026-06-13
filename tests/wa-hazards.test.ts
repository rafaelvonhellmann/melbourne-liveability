import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { getRegion } from "../lib/regions";
import type { HazardPlace } from "../scripts/lib/hazard-adapters";
import {
  WA_BPA_LAYER_URL,
  WA_BPA_RAW_FILE,
  WA_BUSHFIRE_SOURCE_ID,
  WA_FLOOD_LAYER_URL,
  WA_FLOOD_RAW_FILE,
  WA_FLOOD_SOURCE_ID,
  applyWaHazardsToPlaces,
  clipFeatureCollectionToBbox,
  fetchWaHazardOverlays,
  waHazardsAdapter,
} from "../scripts/lib/wa-hazards";

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
    features: geoms.map((g, i) => ({
      type: "Feature",
      id: i + 1,
      properties: { objectid: i + 1 },
      geometry: g,
    })),
  };
}

// Three real Greater Perth SA2 ids/names, with compact fixture squares near
// Perth so the pure area-weighted math stays deterministic and fast.
const GEOMS = new Map<string, Polygon | MultiPolygon>([
  ["503021295", square(115.86, -31.97, 115.87, -31.96)], // East Perth
  ["504011046", square(115.88, -31.94, 115.89, -31.93)], // Maylands
  ["503011030", square(115.75, -31.94, 115.76, -31.93)], // City Beach
]);

function samplePlaces(): (HazardPlace & { name: string })[] {
  return [
    { sa2Code: "503021295", name: "East Perth", bushfirePct: null, floodPct: null },
    { sa2Code: "504011046", name: "Maylands", bushfirePct: null, floodPct: null },
    { sa2Code: "503011030", name: "City Beach", bushfirePct: null, floodPct: null },
  ];
}

describe("waHazardsAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports the unregistered WA adapter with stable source ids", () => {
    expect(waHazardsAdapter.bushfireSourceId).toBe(WA_BUSHFIRE_SOURCE_ID);
    expect(waHazardsAdapter.floodSourceId).toBe(WA_FLOOD_SOURCE_ID);
    expect(typeof waHazardsAdapter.fetch).toBe("function");
    expect(typeof waHazardsAdapter.normalize).toBe("function");
  });

  it("computes area-weighted bushfire and flood shares for three Perth SA2 samples", () => {
    const ps = samplePlaces();
    const bpa = fc(
      square(115.86, -31.97, 115.865, -31.96),
      square(115.75, -31.94, 115.76, -31.93)
    );
    const flood = fc(
      square(115.86, -31.97, 115.87, -31.96),
      square(115.88, -31.94, 115.885, -31.93)
    );

    const stats = applyWaHazardsToPlaces(ps, GEOMS, bpa, flood);
    const eastPerth = ps.find((p) => p.name === "East Perth")!;
    const maylands = ps.find((p) => p.name === "Maylands")!;
    const cityBeach = ps.find((p) => p.name === "City Beach")!;

    expect(eastPerth.bushfirePct!).toBeGreaterThan(49);
    expect(eastPerth.bushfirePct!).toBeLessThan(51);
    expect(eastPerth.floodPct!).toBeGreaterThan(99);

    expect(maylands.bushfirePct).toBe(0);
    expect(maylands.floodPct!).toBeGreaterThan(49);
    expect(maylands.floodPct!).toBeLessThan(51);

    expect(cityBeach.bushfirePct!).toBeGreaterThan(99);
    expect(cityBeach.floodPct).toBe(0);

    expect(stats).toEqual({ bushfireSa2: 3, floodSa2: 3 });
  });

  it("leaves missing raw layers as null rather than fake zeroes", () => {
    const noFlood = samplePlaces();
    applyWaHazardsToPlaces(
      noFlood,
      GEOMS,
      fc(square(115.86, -31.97, 115.865, -31.96)),
      null
    );
    expect(noFlood.every((p) => p.floodPct === null)).toBe(true);
    expect(noFlood[0].bushfirePct!).toBeGreaterThan(49);

    const noBushfire = samplePlaces();
    applyWaHazardsToPlaces(
      noBushfire,
      GEOMS,
      null,
      fc(square(115.86, -31.97, 115.87, -31.96))
    );
    expect(noBushfire.every((p) => p.bushfirePct === null)).toBe(true);
    expect(noBushfire[0].floodPct!).toBeGreaterThan(99);
  });

  it("clips fetched geometries to the Perth bbox", () => {
    const perth = getRegion("perth");
    const clipped = clipFeatureCollectionToBbox(
      fc(square(115.0, -33.2, 116.8, -31.1)),
      perth.bbox
    );
    expect(clipped.features).toHaveLength(1);
    const coords = (clipped.features[0].geometry as Polygon).coordinates.flat();
    for (const [lon, lat] of coords) {
      expect(lon).toBeGreaterThanOrEqual(perth.bbox.west);
      expect(lon).toBeLessThanOrEqual(perth.bbox.east);
      expect(lat).toBeGreaterThanOrEqual(perth.bbox.south);
      expect(lat).toBeLessThanOrEqual(perth.bbox.north);
    }
  });

  it("fetches only the WA bushfire layer with the Perth bbox (flood dropped, CC-NC)", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        const layerFc = url.startsWith(WA_BPA_LAYER_URL)
          ? fc(square(115.0, -33.2, 116.8, -31.1))
          : fc(square(115.5, -32.0, 115.7, -31.8));
        return new Response(JSON.stringify(layerFc), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      })
    );

    const rawDir = await mkdtemp(path.join(process.cwd(), ".tmp-wa-hazards-"));
    try {
      const stats = await fetchWaHazardOverlays(getRegion("perth"), rawDir);
      // WA ships bushfire-only: the DWER 1% AEP flood layer is CC BY-NC and is
      // never fetched, so only the bushfire layer is requested/written.
      expect(stats).toEqual({ bushfireFeatures: 1, floodFeatures: 0 });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain(WA_BPA_LAYER_URL);
      expect(calls.some((u) => u.includes(WA_FLOOD_LAYER_URL))).toBe(false);
      for (const url of calls) {
        expect(url).toContain("geometry=115.4%2C-32.9%2C116.45%2C-31.4");
        expect(url).toContain("geometryPrecision=5");
        expect(url).toContain("f=geojson");
      }
      const bpa = JSON.parse(
        await readFile(path.join(rawDir, WA_BPA_RAW_FILE), "utf8")
      ) as FeatureCollection;
      expect(bpa.features).toHaveLength(1);
      // The CC-NC flood raw file must never be written to disk.
      await expect(
        readFile(path.join(rawDir, WA_FLOOD_RAW_FILE), "utf8")
      ).rejects.toThrow();
    } finally {
      await rm(rawDir, { recursive: true, force: true });
    }
  });
});
