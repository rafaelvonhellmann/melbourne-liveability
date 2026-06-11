import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadBuildingsNear, clearBuildingTileCache, SHADOW_RADIUS_M } from "./buildings";
import { lngLatToTile, tileBounds } from "./building-tiles";
import type { Polygon } from "geojson";

/**
 * Failure-mode contract tests for the baked-tile loader. The sun view's
 * honesty depends on these three outcomes never being conflated:
 *   loaded  - tiles fetched, buildings near the pin
 *   empty   - tiles fetched (incl. 404 = genuine gap), nothing near the pin
 *   failed  - ANY tile fetch error/timeout (connectivity, never "no buildings")
 */

// A pin at the exact centre of a Melbourne z14 tile: the 350 m radius then
// touches only that one tile, so fetch call counts are deterministic.
const T = lngLatToTile(144.9631, -37.8136);
const B = tileBounds(T.x, T.y);
const PIN = { lng: (B.west + B.east) / 2, lat: (B.south + B.north) / 2 };
// A pin tucked into the tile's NW corner: 4 tiles within the radius.
const CORNER_PIN = { lng: B.west + 0.0005, lat: B.north - 0.0005 };

/** Small square footprint (unclosed ring - decode must close it). */
function sq(clng: number, clat: number, d = 0.0001): [number, number][] {
  return [
    [clng - d, clat - d],
    [clng + d, clat - d],
    [clng + d, clat + d],
    [clng - d, clat + d],
  ];
}

// ~44 m east of the pin: inside the radius.
const NEAR = (pin = PIN) => ({ h: 12, g: sq(pin.lng + 0.0005, pin.lat) });
// ~880 m east: outside the 350 m radius.
const FAR = (pin = PIN) => ({ h: 30, g: sq(pin.lng + 0.01, pin.lat) });

function okTile(b: unknown[]): Response {
  return { ok: true, status: 200, json: async () => ({ b }) } as unknown as Response;
}
const notFound = { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
const serverError = { ok: false, status: 500, json: async () => ({}) } as unknown as Response;

/** fetch stub that hangs until its (per-call) signal aborts. */
function hangingFetch() {
  return vi.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const s = init?.signal;
        if (s?.aborted) {
          reject(new Error("aborted"));
          return;
        }
        s?.addEventListener("abort", () => reject(new Error("aborted")));
      })
  );
}

beforeEach(() => clearBuildingTileCache());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("loadBuildingsNear failure-mode contract", () => {
  it("loaded: tiles ok + a building near the pin (ring closed, height kept)", async () => {
    const fetchMock = vi.fn(async () => okTile([NEAR()]));
    vi.stubGlobal("fetch", fetchMock);
    const res = await loadBuildingsNear(PIN.lng, PIN.lat);
    expect(res.status).toBe("loaded");
    if (res.status !== "loaded") return;
    expect(res.buildings.features).toHaveLength(1);
    const f = res.buildings.features[0];
    expect((f.properties as { structure_extrusion?: number }).structure_extrusion).toBe(12);
    const ring = (f.geometry as Polygon).coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]); // decode closed the ring
    // Mid-tile pin + 350 m radius -> exactly one tile fetched (corner skip).
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("radius filter: buildings beyond ~350 m of the pin are dropped", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okTile([NEAR(), FAR()])));
    const res = await loadBuildingsNear(PIN.lng, PIN.lat);
    expect(res.status).toBe("loaded");
    if (res.status !== "loaded") return;
    expect(res.buildings.features).toHaveLength(1);
    expect(
      (res.buildings.features[0].properties as { structure_extrusion?: number })
        .structure_extrusion
    ).toBe(12); // the near one survived, the far one was dropped
  });

  it("empty: tiles ok but every building is outside the radius", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okTile([FAR()])));
    expect(await loadBuildingsNear(PIN.lng, PIN.lat)).toEqual({ status: "empty" });
  });

  it("empty: 404 tiles are genuine gaps (water/parkland), not failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => notFound));
    expect(await loadBuildingsNear(PIN.lng, PIN.lat)).toEqual({ status: "empty" });
  });

  it("failed: HTTP 500 on a tile", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => serverError));
    expect(await loadBuildingsNear(PIN.lng, PIN.lat)).toEqual({ status: "failed" });
  });

  it("failed: network error on a tile", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await loadBuildingsNear(PIN.lng, PIN.lat)).toEqual({ status: "failed" });
  });

  it("failed: one bad tile wins even when the others return buildings", async () => {
    // Corner pin -> 4 tiles; 3 succeed with data, 1 errors.
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++call === 2 ? Promise.reject(new Error("blip")) : okTile([NEAR(CORNER_PIN)])))
    );
    expect(await loadBuildingsNear(CORNER_PIN.lng, CORNER_PIN.lat)).toEqual({ status: "failed" });
  });

  it("failed: a stalled tile aborts via its PER-TILE 10 s timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const p = loadBuildingsNear(CORNER_PIN.lng, CORNER_PIN.lat);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await p).toEqual({ status: "failed" });
    // Each tile fetch got its OWN abort signal - no shared deadline.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    const signals = fetchMock.mock.calls.map((c) => (c[1] as RequestInit | undefined)?.signal);
    expect(new Set(signals).size).toBe(signals.length);
  });

  it("loaded: slow-but-healthy tiles (9 s each, parallel) beat the old shared 8 s budget", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown) =>
          new Promise<Response>((resolve) =>
            setTimeout(() => resolve(okTile([NEAR(CORNER_PIN)])), 9_000)
          )
      )
    );
    const p = loadBuildingsNear(CORNER_PIN.lng, CORNER_PIN.lat);
    await vi.advanceTimersByTimeAsync(9_001);
    const res = await p;
    expect(res.status).toBe("loaded");
  });

  it("failed: an already-aborted upstream signal (unmount) short-circuits", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const ctrl = new AbortController();
    ctrl.abort();
    expect(await loadBuildingsNear(PIN.lng, PIN.lat, ctrl.signal)).toEqual({ status: "failed" });
  });

  it("cache: a second load of the same pin decodes from cache, no refetch", async () => {
    const fetchMock = vi.fn(async () => okTile([NEAR()]));
    vi.stubGlobal("fetch", fetchMock);
    const first = await loadBuildingsNear(PIN.lng, PIN.lat);
    const second = await loadBuildingsNear(PIN.lng, PIN.lat);
    expect(first.status).toBe("loaded");
    expect(second.status).toBe("loaded");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cache: failures are NOT cached - a retry refetches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(serverError)
      .mockResolvedValue(okTile([NEAR()]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadBuildingsNear(PIN.lng, PIN.lat)).toEqual({ status: "failed" });
    const retry = await loadBuildingsNear(PIN.lng, PIN.lat);
    expect(retry.status).toBe("loaded");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exports the radius the view's shadow math is sized for", () => {
    expect(SHADOW_RADIUS_M).toBe(350);
  });
});
