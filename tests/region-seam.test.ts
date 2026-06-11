/**
 * Region seam (app wave, phase 1 - no UI): the ?region= URL param, the
 * region-aware pin envelope, per-region data resolution through dataPath, the
 * static-hosting availability probe and the melbourne fallback loader.
 *
 * The e2e-relevant invariant: melbourne (the default) must parse, serialize
 * and resolve BYTE-IDENTICALLY to the pre-region behaviour - the param never
 * appears in melbourne URLs and the melbourne artifact URLs are unchanged.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMapUrl,
  inMelbourneBBox,
  inRegionBBox,
  parseMapUrlState,
} from "../lib/share-url";
import REGIONS, {
  DEFAULT_REGION,
  REGION_IDS,
  getRegion,
  regionBounds,
  sanitizeRegionId,
} from "../lib/regions";
import { normalizeWeights } from "../lib/weights";

// ---- fetch stubbing -------------------------------------------------------
// lib/places-data caches per region at module level, so each test that touches
// it re-imports a fresh copy via vi.resetModules().

type StubRule = { ok: boolean; status?: number; body?: unknown } | Error;

function stubFetch(rule: (url: string, method: string) => StubRule) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      const r = rule(url, method);
      if (r instanceof Error) throw r;
      return {
        ok: r.ok,
        status: r.status ?? (r.ok ? 200 : 404),
        json: async () => r.body,
      } as unknown as Response;
    })
  );
  return calls;
}

const PLACES_BODY = {
  generatedAt: "2026-06-12T00:00:00Z",
  places: [{ slug: "test-area-000000000", name: "Test area" }],
};

async function freshPlacesData() {
  vi.resetModules();
  return import("../lib/places-data");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- ?region= URL param ----------------------------------------------------

describe("?region= parse", () => {
  it("defaults to melbourne when absent", () => {
    expect(parseMapUrlState("").region).toBe("melbourne");
    expect(parseMapUrlState("w=affordability:30&list=a,b").region).toBe(
      "melbourne"
    );
  });

  it("parses every valid region id (case/whitespace tolerant)", () => {
    for (const id of REGION_IDS) {
      expect(parseMapUrlState(`region=${id}`).region).toBe(id);
    }
    expect(parseMapUrlState("region=SYDNEY").region).toBe("sydney");
    expect(parseMapUrlState("region=%20Canberra%20").region).toBe("canberra");
  });

  it("sanitizes unknown values to melbourne and never throws", () => {
    expect(parseMapUrlState("region=atlantis").region).toBe("melbourne");
    expect(parseMapUrlState("region=2GMEL").region).toBe("melbourne");
    expect(parseMapUrlState("region=").region).toBe("melbourne");
    expect(parseMapUrlState("region=..%2F..").region).toBe("melbourne");
  });
});

describe("?region= serialize (melbourne-absent rule)", () => {
  it("omits the param for melbourne and for no region at all", () => {
    expect(buildMapUrl("/", {})).toBe("/");
    expect(buildMapUrl("/", { region: DEFAULT_REGION })).toBe("/");
  });

  it("keeps existing melbourne share URLs byte-identical", () => {
    const state = {
      weights: normalizeWeights({ affordability: 40, transport: 20 }),
      shortlist: ["carlton-123"],
      view: "rental" as const,
      buyer: true,
      pin: [144.9876, -37.8001] as [number, number],
    };
    expect(buildMapUrl("/", { ...state, region: DEFAULT_REGION })).toBe(
      buildMapUrl("/", state)
    );
  });

  it("serializes a non-default region", () => {
    expect(buildMapUrl("/", { region: "canberra" })).toBe("/?region=canberra");
  });

  it("round-trips region + an in-region buyer pin", () => {
    const url = buildMapUrl("/", {
      region: "canberra",
      buyer: true,
      pin: [149.131, -35.2802],
    });
    const state = parseMapUrlState(new URL(url, "http://localhost").search.slice(1));
    expect(state.region).toBe("canberra");
    expect(state.buyer).toBe(true);
    expect(state.pin?.[0]).toBeCloseTo(149.131, 3);
    expect(state.pin?.[1]).toBeCloseTo(-35.2802, 3);
  });
});

describe("region-aware pin envelope", () => {
  it("accepts a canberra pin only when the URL says region=canberra", () => {
    const canberra = "lat=-35.2802&lng=149.1310";
    expect(parseMapUrlState(canberra).pin).toBeNull(); // melbourne link
    expect(parseMapUrlState(`region=canberra&${canberra}`).pin).toEqual([
      149.131, -35.2802,
    ]);
  });

  it("rejects out-of-region pins against the URL's own region", () => {
    // A melbourne pin is junk on a canberra link...
    expect(
      parseMapUrlState("region=canberra&lat=-37.8136&lng=144.9631").pin
    ).toBeNull();
    // ...and the historical melbourne rejections are unchanged.
    expect(parseMapUrlState("lat=-33.8&lng=151.2").pin).toBeNull(); // sydney
    expect(parseMapUrlState("lat=0&lng=0").pin).toBeNull();
    expect(parseMapUrlState("region=canberra&lat=foo&lng=bar").pin).toBeNull();
  });
});

// ---- bounds helpers ---------------------------------------------------------

describe("region bounds helpers", () => {
  it("inRegionBBox defaults to melbourne and matches inMelbourneBBox", () => {
    for (const [lng, lat] of [
      [144.9631, -37.8136],
      [143.0, -39.5],
      [142.99, -37.8],
      [151.2093, -33.8688],
    ] as const) {
      expect(inRegionBBox(lng, lat)).toBe(inMelbourneBBox(lng, lat));
    }
  });

  it("accepts each region's own centre and rejects the others' (registry pinBbox)", () => {
    for (const id of REGION_IDS) {
      const [lng, lat] = REGIONS[id].mapCenter;
      expect(inRegionBBox(lng, lat, id), id).toBe(true);
    }
    expect(inRegionBBox(144.9631, -37.8136, "canberra")).toBe(false);
    expect(inRegionBBox(149.131, -35.2802, "melbourne")).toBe(false);
    expect(inRegionBBox(115.8605, -31.9523, "darwin")).toBe(false);
  });

  it("regionBounds frames the data extent as [[w,s],[e,n]]", () => {
    // Melbourne equals the historical MELBOURNE_BOUNDS literal exactly.
    expect(regionBounds(getRegion("melbourne"))).toEqual([
      [144.45, -38.35],
      [145.65, -37.45],
    ]);
    expect(regionBounds(getRegion("canberra"))).toEqual([
      [148.7, -35.95],
      [149.45, -35.1],
    ]);
  });

  it("sanitizeRegionId backs the URL seam (empty/unknown -> melbourne, no throw)", () => {
    expect(sanitizeRegionId(undefined)).toBe("melbourne");
    expect(sanitizeRegionId("")).toBe("melbourne");
    expect(sanitizeRegionId(" Canberra ")).toBe("canberra");
    expect(sanitizeRegionId("sydny")).toBe("melbourne");
  });
});

// ---- per-region data resolution ---------------------------------------------

describe("loadPlaces dataPath resolution", () => {
  it("melbourne fetches the exact historical URL", async () => {
    const mod = await freshPlacesData();
    const calls = stubFetch(() => ({ ok: true, body: PLACES_BODY }));
    const places = await mod.loadPlaces();
    expect(places).toHaveLength(1);
    expect(calls).toEqual([{ url: "/data/places.json", method: "GET" }]);
  });

  it("a non-default region fetches its suffixed artifact", async () => {
    const mod = await freshPlacesData();
    const calls = stubFetch(() => ({ ok: true, body: PLACES_BODY }));
    await mod.loadPlaces("canberra");
    expect(calls).toEqual([
      { url: "/data/places.canberra.json", method: "GET" },
    ]);
  });
});

describe("regionDataAvailable probe", () => {
  it("melbourne is always available without a request", async () => {
    const mod = await freshPlacesData();
    const calls = stubFetch(() => ({ ok: true }));
    await expect(mod.regionDataAvailable()).resolves.toBe(true);
    await expect(mod.regionDataAvailable("melbourne")).resolves.toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("HEADs the region's places artifact and caches a positive verdict", async () => {
    const mod = await freshPlacesData();
    const calls = stubFetch(() => ({ ok: true }));
    await expect(mod.regionDataAvailable("canberra")).resolves.toBe(true);
    await expect(mod.regionDataAvailable("canberra")).resolves.toBe(true);
    expect(calls).toEqual([
      { url: "/data/places.canberra.json", method: "HEAD" },
    ]);
  });

  it("caches a 404 verdict (static hosting: not baked yet)", async () => {
    const mod = await freshPlacesData();
    const calls = stubFetch(() => ({ ok: false, status: 404 }));
    await expect(mod.regionDataAvailable("hobart")).resolves.toBe(false);
    await expect(mod.regionDataAvailable("hobart")).resolves.toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("a thrown fetch (offline) resolves false but allows a re-probe", async () => {
    const mod = await freshPlacesData();
    const calls = stubFetch(() => new Error("network down"));
    await expect(mod.regionDataAvailable("perth")).resolves.toBe(false);
    await expect(mod.regionDataAvailable("perth")).resolves.toBe(false);
    expect(calls).toHaveLength(2); // transient errors are not cached
  });
});

describe("loadRegionPlaces melbourne fallback", () => {
  it("serves the region's own artifact when baked", async () => {
    const mod = await freshPlacesData();
    const calls = stubFetch(() => ({ ok: true, body: PLACES_BODY }));
    const r = await mod.loadRegionPlaces("canberra");
    expect(r.region).toBe("canberra");
    expect(r.fellBack).toBe(false);
    expect(r.places).toHaveLength(1);
    expect(calls.map((c) => c.url)).toEqual(["/data/places.canberra.json"]);
  });

  it("falls back to melbourne with a flag when the artifact 404s - never crashes", async () => {
    const mod = await freshPlacesData();
    const calls = stubFetch((url) =>
      url.includes(".canberra.")
        ? { ok: false, status: 404 }
        : { ok: true, body: PLACES_BODY }
    );
    const r = await mod.loadRegionPlaces("canberra");
    expect(r.fellBack).toBe(true);
    expect(r.region).toBe(DEFAULT_REGION);
    expect(r.places).toHaveLength(1);
    expect(calls.map((c) => c.url)).toEqual([
      "/data/places.canberra.json",
      "/data/places.json",
    ]);
  });

  it("melbourne itself never silently falls back - a real outage still rejects", async () => {
    const mod = await freshPlacesData();
    stubFetch(() => ({ ok: false, status: 404 }));
    await expect(mod.loadRegionPlaces()).rejects.toThrow(
      /Failed to load places\.json/
    );
  });

  it("the default region resolves through the same seam with no fallback flag", async () => {
    const mod = await freshPlacesData();
    const calls = stubFetch(() => ({ ok: true, body: PLACES_BODY }));
    const r = await mod.loadRegionPlaces();
    expect(r).toMatchObject({ region: "melbourne", fellBack: false });
    expect(calls.map((c) => c.url)).toEqual(["/data/places.json"]);
  });
});
