import { beforeEach, describe, expect, it, vi } from "vitest";
import { lngLatToTile } from "../lib/building-tiles";
import {
  REPORT_TILE_Z,
  clearReportTileCache,
  loadPoisNear,
  loadReportTilesNear,
  reportTilePath,
  ringTiles,
} from "../lib/report-tiles";

// A Melbourne CBD pin and its z14 tile - the loader fetches this tile + 8
// neighbours from /data/report-tiles/{kind}/14/{x}/{y}.json.
const LNG = 144.9631;
const LAT = -37.8136;
const { x: CX, y: CY } = lngLatToTile(LNG, LAT, REPORT_TILE_Z);

type Served = Record<string, unknown>;

/** lng/lat of a fractional z14 tile position (x, y may carry a fraction). */
function tileLngLat(x: number, y: number): [number, number] {
  const n = 2 ** REPORT_TILE_Z;
  const lng = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lng, lat];
}

/** Stub fetch that serves `tiles` (path -> body) and 404s everything else. */
function serveTiles(tiles: Served) {
  const fn = vi.fn(async (url: string) => {
    const body = tiles[String(url)];
    if (body === undefined) return { ok: false, status: 404 };
    return { ok: true, json: async () => body };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  clearReportTileCache();
  vi.unstubAllGlobals();
});

describe("ringTiles", () => {
  it("returns the centre for r=0 and 8r tiles for r>=1", () => {
    expect(ringTiles(5, 7, 0)).toEqual([{ x: 5, y: 7 }]);
    expect(ringTiles(5, 7, 1)).toHaveLength(8);
    expect(ringTiles(5, 7, 2)).toHaveLength(16);
    // Ring 2 contains no tile closer than Chebyshev distance 2.
    for (const t of ringTiles(5, 7, 2)) {
      expect(Math.max(Math.abs(t.x - 5), Math.abs(t.y - 7))).toBe(2);
    }
  });
});

describe("loadReportTilesNear", () => {
  it("merges the 3x3 neighbourhood and decodes noise tiles to NoiseLine[]", async () => {
    const rail = [
      [144.96, -37.81],
      [144.97, -37.82],
    ];
    const freeway = [
      [144.95, -37.8],
      [144.96, -37.8],
    ];
    const fn = serveTiles({
      [reportTilePath("noise", CX, CY)]: { n: { rail: [rail] } },
      [reportTilePath("noise", CX + 1, CY)]: { n: { freeway: [freeway] } },
    });
    const lines = await loadReportTilesNear(LNG, LAT, "noise");
    expect(lines).toEqual(
      expect.arrayContaining([
        { kind: "rail", coords: rail },
        { kind: "freeway", coords: freeway },
      ])
    );
    expect(lines).toHaveLength(2);
    expect(fn).toHaveBeenCalledTimes(9); // pin tile + 8 neighbours
  });

  it("decodes traffic tiles to the existing {r,v,h,c} segment shape", async () => {
    const seg = { r: "TOORAK ROAD", v: 19131, h: 2, c: [[145.04, -37.844], [145.041, -37.845]] };
    serveTiles({
      [reportTilePath("traffic", CX, CY)]: { t: [seg, { r: "BAD", v: 1, h: 0, c: [] }] },
    });
    const segs = await loadReportTilesNear(LNG, LAT, "traffic");
    expect(segs).toEqual([seg]); // empty-geometry entry filtered out
  });

  it("decodes bus tiles to [lng, lat, routeCount] stops", async () => {
    serveTiles({
      [reportTilePath("bus", CX, CY - 1)]: { s: [[144.962, -37.767, 3], [144.9]] },
    });
    expect(await loadReportTilesNear(LNG, LAT, "bus")).toEqual([[144.962, -37.767, 3]]);
  });

  it("decodes poi tiles to the exact Feature<Point> shape the report consumes", async () => {
    serveTiles({
      [reportTilePath("pois", CX, CY)]: {
        p: [
          [144.963101, -37.813601, "supermarket", "Queen Vic Market"],
          [144.9, -37.81, "cafe", ""],
        ],
      },
    });
    const pois = await loadReportTilesNear(LNG, LAT, "pois");
    expect(pois[0]).toEqual({
      type: "Feature",
      properties: { pinType: "supermarket", name: "Queen Vic Market" },
      geometry: { type: "Point", coordinates: [144.963101, -37.813601] },
    });
    expect(pois).toHaveLength(2);
  });

  it("caches per tileKey: a second load of the same neighbourhood refetches nothing", async () => {
    const fn = serveTiles({
      [reportTilePath("bus", CX, CY)]: { s: [[144.96, -37.81, 1]] },
    });
    await loadReportTilesNear(LNG, LAT, "bus");
    expect(fn).toHaveBeenCalledTimes(9);
    const again = await loadReportTilesNear(LNG, LAT, "bus");
    expect(fn).toHaveBeenCalledTimes(9); // all 9 (incl. the 404s) came from cache
    expect(again).toEqual([[144.96, -37.81, 1]]);
  });

  it("never throws: network failures resolve empty and are retried next load", async () => {
    const fn = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fn);
    await expect(loadReportTilesNear(LNG, LAT, "traffic")).resolves.toEqual([]);
    expect(fn).toHaveBeenCalledTimes(9);
    // Errors are NOT cached - the next pin load tries the tiles again.
    await loadReportTilesNear(LNG, LAT, "traffic");
    expect(fn).toHaveBeenCalledTimes(18);
  });

  it("resolves empty on malformed tile bodies", async () => {
    serveTiles({ [reportTilePath("noise", CX, CY)]: 42 });
    await expect(loadReportTilesNear(LNG, LAT, "noise")).resolves.toEqual([]);
  });

  it("caches empty ONLY on 404: a transient 503 is retried on the next load", async () => {
    let busCalls = 0;
    const fn = vi.fn(async (url: string) => {
      if (String(url) === reportTilePath("bus", CX, CY)) {
        busCalls++;
        if (busCalls === 1) return { ok: false, status: 503 };
        return { ok: true, json: async () => ({ s: [[144.96, -37.81, 1]] }) };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fn);
    // The 503 resolves empty for THIS load but must not blank the session.
    await expect(loadReportTilesNear(LNG, LAT, "bus")).resolves.toEqual([]);
    expect(fn).toHaveBeenCalledTimes(9);
    const again = await loadReportTilesNear(LNG, LAT, "bus");
    expect(again).toEqual([[144.96, -37.81, 1]]); // the 503 tile was retried...
    expect(fn).toHaveBeenCalledTimes(10); // ...while the 404s stayed cached
  });
});

describe("loadPoisNear (supermarket widening)", () => {
  it("stays at the 3x3 when a supermarket is present", async () => {
    const fn = serveTiles({
      [reportTilePath("pois", CX, CY)]: { p: [[144.96, -37.81, "supermarket", "IGA"]] },
    });
    const pois = await loadPoisNear(LNG, LAT);
    expect(pois).toHaveLength(1);
    expect(fn).toHaveBeenCalledTimes(9);
  });

  it("widens ring by ring until a supermarket is found (8 km report fallback)", async () => {
    const fn = serveTiles({
      [reportTilePath("pois", CX, CY)]: { p: [[144.96, -37.81, "cafe", "Cafe"]] },
      [reportTilePath("pois", CX + 2, CY)]: { p: [[145.0, -37.81, "supermarket", "Coles"]] },
    });
    const pois = await loadPoisNear(LNG, LAT);
    const types = pois.map((f) => (f.properties as { pinType: string }).pinType);
    expect(types).toContain("supermarket");
    expect(types).toContain("cafe");
    expect(fn).toHaveBeenCalledTimes(9 + 16); // 3x3, then ring 2 - stops there
  });

  it("keeps widening past the first supermarket ring when a closer one can sit one ring out", async () => {
    // Chebyshev rings are not distance-ordered: a ring-2 CORNER supermarket
    // (~5.9 km here) must not stop the search, because a ring-3 EDGE tile can
    // still hold a closer one (~4.9 km here). The search stops only once the
    // next ring's minimum possible distance exceeds the best found.
    const [farLng, farLat] = tileLngLat(CX + 2.5, CY + 2.5); // centre of ring-2 corner tile
    const [nearLng] = tileLngLat(CX - 2.1, CY); // east edge of ring-3 tile (CX-3, CY)
    const fn = serveTiles({
      [reportTilePath("pois", CX + 2, CY + 2)]: {
        p: [[farLng, farLat, "supermarket", "FarCorner"]],
      },
      [reportTilePath("pois", CX - 3, CY)]: { p: [[nearLng, LAT, "supermarket", "NearEdge"]] },
    });
    const pois = await loadPoisNear(LNG, LAT);
    const names = pois.map((f) => (f.properties as { name: string }).name);
    expect(names).toContain("FarCorner");
    expect(names).toContain("NearEdge"); // the true nearest - one ring further out
    // 3x3 (9) + ring 2 (16) + ring 3 (24); ring 4 cannot beat ~4.9 km, so skipped.
    expect(fn).toHaveBeenCalledTimes(49);
  });

  it("gives up after ring 4 when no supermarket exists nearby", async () => {
    const fn = serveTiles({
      [reportTilePath("pois", CX, CY)]: { p: [[144.96, -37.81, "park", ""]] },
    });
    const pois = await loadPoisNear(LNG, LAT);
    expect(pois).toHaveLength(1);
    // rings 0+1 (9) + ring 2 (16) + ring 3 (24) + ring 4 (32)
    expect(fn).toHaveBeenCalledTimes(81);
  });
});
