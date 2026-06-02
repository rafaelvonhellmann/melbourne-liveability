import { afterEach, describe, expect, it, vi } from "vitest";
import type { Polygon, MultiPolygon } from "geojson";
import {
  parseOrsIsochrone,
  fetchWalkIsochrone,
  isPreciseWalkConfigured,
} from "@/lib/walk-isochrone";

// Unit square 0..1 with a hole 0.4..0.6 (same fixture style as buyer-location).
const square: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    [
      [0.4, 0.4],
      [0.4, 0.6],
      [0.6, 0.6],
      [0.6, 0.4],
      [0.4, 0.4],
    ],
  ],
};

describe("parseOrsIsochrone", () => {
  it("extracts a Polygon geometry from an ORS FeatureCollection", () => {
    const ors = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { value: 900, group_index: 0 },
          geometry: square,
        },
      ],
    };
    expect(parseOrsIsochrone(ors)).toEqual(square);
  });

  it("extracts a MultiPolygon too", () => {
    const mp: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [square.coordinates],
    };
    const ors = { type: "FeatureCollection", features: [{ geometry: mp }] };
    expect(parseOrsIsochrone(ors)?.type).toBe("MultiPolygon");
  });

  it("returns null for missing / empty / malformed shapes", () => {
    expect(parseOrsIsochrone(null)).toBeNull();
    expect(parseOrsIsochrone({})).toBeNull();
    expect(parseOrsIsochrone({ features: [] })).toBeNull();
    expect(parseOrsIsochrone({ features: [{ geometry: { type: "Point", coordinates: [0, 0] } }] })).toBeNull();
  });
});

describe("fetchWalkIsochrone", () => {
  const ORIG_KEY = process.env.NEXT_PUBLIC_ORS_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIG_KEY === undefined) delete process.env.NEXT_PUBLIC_ORS_API_KEY;
    else process.env.NEXT_PUBLIC_ORS_API_KEY = ORIG_KEY;
  });

  it("short-circuits without a key and never calls fetch", async () => {
    delete process.env.NEXT_PUBLIC_ORS_API_KEY;
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(isPreciseWalkConfigured()).toBe(false);
    const r = await fetchWalkIsochrone([144.96, -37.81]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not-configured");
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns the parsed geometry on a successful response", async () => {
    process.env.NEXT_PUBLIC_ORS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ type: "FeatureCollection", features: [{ geometry: square }] }),
      }))
    );
    const r = await fetchWalkIsochrone([144.96, -37.81], 15);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.geom).toEqual(square);
  });

  it("reports failure on a non-OK HTTP status", async () => {
    process.env.NEXT_PUBLIC_ORS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429 })));
    const r = await fetchWalkIsochrone([144.96, -37.81]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("HTTP 429");
  });

  it("reports failure when the response carries no polygon", async () => {
    process.env.NEXT_PUBLIC_ORS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }))
    );
    const r = await fetchWalkIsochrone([144.96, -37.81]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-geometry");
  });
});
