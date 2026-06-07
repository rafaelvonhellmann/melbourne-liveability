import { describe, it, expect, vi, afterEach } from "vitest";
import { geocodeAddress, stripUnitPrefix, rankGeocodeRows } from "../lib/geocode";

describe("stripUnitPrefix", () => {
  it("strips Australian unit prefixes, keeping the building", () => {
    expect(stripUnitPrefix("5/12 Smith St, Brunswick")).toBe("12 Smith St, Brunswick");
    expect(stripUnitPrefix("Unit 5, 12 Smith St")).toBe("12 Smith St");
    expect(stripUnitPrefix("Apt 5 12 Smith St")).toBe("12 Smith St");
    expect(stripUnitPrefix("Flat 5, 12 Smith Street")).toBe("12 Smith Street");
  });
  it("leaves a plain street address unchanged", () => {
    expect(stripUnitPrefix("12 Smith St, Carlton")).toBe("12 Smith St, Carlton");
    expect(stripUnitPrefix("Unley Road, Parkville")).toBe("Unley Road, Parkville");
  });
  it("falls back to the original when stripping leaves too little", () => {
    expect(stripUnitPrefix("5/12")).toBe("5/12");
  });
});

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

  it("returns the suburb-matching house result first (the Abbotsford bug)", async () => {
    // Nominatim order: a fuzzy Kew road match first, the real Abbotsford house second.
    mockFetch([
      {
        lat: "-37.81",
        lon: "145.10",
        type: "road",
        display_name: "Acacia Place, Kew East, Victoria, Australia",
        address: { road: "Acacia Place", suburb: "Kew East" },
      },
      {
        lat: "-37.8118",
        lon: "145.0142",
        type: "house",
        display_name: "6, Acacia Place, Abbotsford, Victoria, 3067, Australia",
        address: { house_number: "6", road: "Acacia Place", suburb: "Abbotsford" },
      },
    ]);
    const out = await geocodeAddress("6 Acacia Place, Abbotsford");
    expect(out[0].shortLabel).toContain("Abbotsford");
    expect(out[0].lat).toBeCloseTo(-37.8118);
  });
});

describe("rankGeocodeRows", () => {
  it("floats the named suburb + exact house number to the top", () => {
    const rows = [
      { type: "road", address: { road: "Acacia Place", suburb: "Kew East" } },
      { type: "house", address: { house_number: "6", road: "Acacia Place", suburb: "Abbotsford" } },
    ];
    expect(rankGeocodeRows(rows, "6 acacia place, abbotsford")[0].address?.suburb).toBe("Abbotsford");
  });

  it("is stable for equal scores (keeps Nominatim order)", () => {
    const rows = [
      { type: "road", address: { road: "A St" } },
      { type: "road", address: { road: "B St" } },
    ];
    expect(rankGeocodeRows(rows, "no suburb here").map((r) => r.address?.road)).toEqual(["A St", "B St"]);
  });
});
