import { describe, it, expect, vi, afterEach } from "vitest";
import { geocodeAddress } from "../lib/geocode";

function mockFetch(rows: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => rows,
  })) as unknown as typeof fetch;
  globalThis.fetch = fn;
  return fn as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("geocodeAddress", () => {
  it("short-circuits queries under 3 chars without a network call", async () => {
    const fn = mockFetch([]);
    expect(await geocodeAddress("hi")).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("restricts the search to Greater Melbourne / AU", async () => {
    const fn = mockFetch([]);
    await geocodeAddress("123 High St");
    const url = String(fn.mock.calls[0][0]);
    expect(url).toContain("https://nominatim.openstreetmap.org/search");
    expect(url).toContain("countrycodes=au");
    expect(url).toContain("bounded=1");
    expect(url).toContain("format=jsonv2");
    expect(url).toContain("viewbox=");
  });

  it("maps rows to a compact street + locality short label", async () => {
    mockFetch([
      {
        lat: "-37.77",
        lon: "144.97",
        display_name: "12, Smith Street, Brunswick East, Merri-bek, Victoria, Australia",
        address: { house_number: "12", road: "Smith Street", suburb: "Brunswick East" },
      },
    ]);
    const [r] = await geocodeAddress("12 Smith Street");
    expect(r.lat).toBeCloseTo(-37.77);
    expect(r.lng).toBeCloseTo(144.97);
    expect(r.shortLabel).toBe("12 Smith Street, Brunswick East");
    expect(r.label).toContain("Brunswick East");
  });

  it("falls back to display_name when address parts are absent", async () => {
    mockFetch([
      { lat: "-37.8", lon: "145.0", display_name: "Some Place, Melbourne, Australia" },
    ]);
    const [r] = await geocodeAddress("some place");
    expect(r.shortLabel).toBe("Some Place, Melbourne");
  });

  it("drops rows with non-numeric coordinates", async () => {
    mockFetch([
      { lat: "not-a-number", lon: "145.0", display_name: "Bad" },
      { lat: "-37.8", lon: "145.0", display_name: "Good, Melbourne" },
    ]);
    const out = await geocodeAddress("x y z");
    expect(out).toHaveLength(1);
    expect(out[0].shortLabel).toContain("Good");
  });

  it("throws on a non-2xx response so the caller can show an error", async () => {
    mockFetch(null, false, 429);
    await expect(geocodeAddress("rate limited")).rejects.toThrow(/429/);
  });
});
