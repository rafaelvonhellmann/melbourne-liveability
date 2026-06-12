/**
 * Wave 2 item 4 - per-region provenance manifests: the pure assembly
 * (scripts/lib/region-sources) and the frontend region-manifest loader
 * (lib/sources loadRegionSources) with its melbourne fallback.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRegionSourceEntries,
  collectSourceIds,
  type ManifestSource,
} from "../scripts/lib/region-sources";
import { GTFS_SOURCES } from "../scripts/lib/gtfs-constants";
import {
  __resetRegionSourcesCacheForTests,
  allSources,
  loadRegionSources,
} from "../lib/sources";

describe("collectSourceIds", () => {
  it("walks a nested places artifact and collects every sourceId string", () => {
    const places = {
      generatedAt: "2026-06-12",
      places: [
        {
          domains: {
            transport: {
              subIndicators: {
                stops800m: { sourceId: "translink-gtfs" },
                amPeakFreq: { sourceId: "translink-gtfs" },
              },
            },
            health: { subIndicators: { gpCount2km: { sourceId: "osm-health" } } },
          },
          context: { equity: { sourceId: "abs-seifa-2021" } },
        },
      ],
    };
    expect([...collectSourceIds(places)].sort()).toEqual([
      "abs-seifa-2021",
      "osm-health",
      "translink-gtfs",
    ]);
  });

  it("ignores non-string and empty sourceId values", () => {
    expect(
      [...collectSourceIds({ sourceId: 7, nested: [{ sourceId: "" }, { sourceId: null }] })]
    ).toEqual([]);
  });
});

describe("buildRegionSourceEntries", () => {
  const template: ManifestSource[] = [
    {
      id: "abs-erp-sa2",
      name: "ABS ERP by SA2",
      url: "https://example.test/erp",
      licence: "CC BY 4.0",
      sha256: "melbourne-hash",
      fetchedAt: "2026-01-02",
    },
    {
      id: "vcsa-recorded-offences",
      name: "VCSA recorded offences",
      url: "https://example.test/vcsa",
      licence: "CC BY 4.0",
    },
    { id: "osm-pt", name: "OSM PT stops", url: "https://example.test/osm", licence: "ODbL" },
  ];

  it("filters to referenced ids in template order and strips melbourne stamps", () => {
    const out = buildRegionSourceEntries(
      template,
      new Set(["osm-pt", "abs-erp-sa2"])
    );
    expect(out.map((s) => s.id)).toEqual(["abs-erp-sa2", "osm-pt"]);
    expect(out[0].sha256).toBeUndefined();
    expect(out[0].fetchedAt).toBeUndefined();
    // The template itself is never mutated (melbourne manifest stays intact).
    expect(template[0].sha256).toBe("melbourne-hash");
  });

  it("never carries unreferenced (VIC) sources into a region manifest", () => {
    const out = buildRegionSourceEntries(template, new Set(["osm-pt"]));
    expect(out.some((s) => s.id === "vcsa-recorded-offences")).toBe(false);
  });

  it("appends the region's GTFS entry with feed period and licence", () => {
    const out = buildRegionSourceEntries(template, new Set(["osm-pt"]), {
      meta: GTFS_SOURCES.brisbane,
      period: "2026-06 to 2026-09",
    });
    const g = out.find((s) => s.id === "translink-gtfs");
    expect(g?.name).toMatch(/Translink/);
    expect(g?.licence).toBe("CC BY 4.0");
    expect(g?.period).toBe("2026-06 to 2026-09");
  });

  it("does not duplicate a GTFS entry the template already provides", () => {
    const withGtfs: ManifestSource[] = [
      ...template,
      { id: "translink-gtfs", name: "Translink", url: "https://example.test/tl", licence: "CC BY 4.0" },
    ];
    const out = buildRegionSourceEntries(
      withGtfs,
      new Set(["translink-gtfs"]),
      { meta: GTFS_SOURCES.brisbane, period: "x" }
    );
    expect(out.filter((s) => s.id === "translink-gtfs")).toHaveLength(1);
  });
});

describe("loadRegionSources (frontend trust-drawer loader)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetRegionSourcesCacheForTests();
  });

  it("melbourne resolves synchronously to the bundled manifest, no fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const records = await loadRegionSources("melbourne");
    expect(records).toBe(allSources());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a baked region loads its sources.{region}.json", async () => {
    const regionManifest = [
      { id: "translink-gtfs", name: "Translink", url: "u", licence: "CC BY 4.0" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(String(url)).toContain("/data/sources.brisbane.json");
        return { ok: true, json: async () => regionManifest } as Response;
      })
    );
    const records = await loadRegionSources("brisbane");
    expect(records.map((r) => r.id)).toEqual(["translink-gtfs"]);
  });

  it("falls back to the melbourne manifest when the region manifest 404s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => null }) as unknown as Response)
    );
    const records = await loadRegionSources("darwin");
    expect(records).toBe(allSources());
  });

  it("falls back (uncached) when the fetch throws", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await loadRegionSources("perth")).toBe(allSources());
    // Transient failure was not cached - a second call re-probes.
    await loadRegionSources("perth");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
