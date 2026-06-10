import { describe, it, expect, vi, afterEach } from "vitest";
import {
  directionalFlip,
  lookupSuburb,
  nearestSuburb,
  loadPriceContext,
  resolvePriceContext,
  yearTrend,
  latestQuarter,
  formatPriceShort,
  formatRentWeekly,
  trendChangePct,
  type PriceContextFile,
} from "./price-context";

const SOURCE = {
  id: "x",
  name: "x",
  url: "https://example.org",
  licence: "CC BY 4.0",
  period: "2024",
};

const FIXTURE: PriceContextFile = {
  generatedAt: "2026-06-10",
  sources: { house: SOURCE, unit: SOURCE, rent: SOURCE },
  suburbs: {
    abbotsford: {
      suburb: "Abbotsford",
      lng: 144.998,
      lat: -37.802,
      houseMedianByYear: {
        "2017": 1280000,
        "2018": 1192500,
        "2019": 1050000,
        "2020": 1200000,
        "2021": 1365000,
        "2022": 1346000,
        "2023": 1250000,
      },
      unitMedianByYear: { "2023": 530000, "2024": 512500 },
      rentMedianByQuarter: { "Jun 2025": 545, "Sep 2025": 550, "Mar 2025": 540 },
      rentArea: "Collingwood-Abbotsford",
    },
    "st kilda east": {
      suburb: "St Kilda East",
      lng: 144.996,
      lat: -37.87,
      houseMedianByYear: { "2023": 1500000 },
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("directionalFlip", () => {
  it("flips leading and trailing compass words", () => {
    expect(directionalFlip("east st kilda")).toBe("st kilda east");
    expect(directionalFlip("brunswick east")).toBe("east brunswick");
    expect(directionalFlip("abbotsford")).toBeNull();
  });
});

describe("lookupSuburb", () => {
  it("matches a plain suburb name case-insensitively", () => {
    expect(lookupSuburb(FIXTURE, "ABBOTSFORD")?.suburb).toBe("Abbotsford");
  });

  it("matches a DFFH-style directional alias via flip", () => {
    expect(lookupSuburb(FIXTURE, "East St Kilda")?.suburb).toBe("St Kilda East");
  });

  it("matches a compound SA2 name part by part", () => {
    expect(lookupSuburb(FIXTURE, "Abbotsford - Cremorne")?.suburb).toBe("Abbotsford");
  });

  it("returns null for unknown or empty names", () => {
    expect(lookupSuburb(FIXTURE, "Atlantis")).toBeNull();
    expect(lookupSuburb(FIXTURE, "")).toBeNull();
  });
});

describe("nearestSuburb", () => {
  it("finds the nearest centroid within range", () => {
    const hit = nearestSuburb(FIXTURE, [144.99, -37.8]);
    expect(hit?.entry.suburb).toBe("Abbotsford");
    expect(hit?.distanceKm).toBeLessThan(2);
  });

  it("returns null when nothing is within maxKm", () => {
    expect(nearestSuburb(FIXTURE, [146.5, -36.0])).toBeNull();
  });
});

describe("loadPriceContext / resolvePriceContext", () => {
  it("returns null (never throws) when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(loadPriceContext()).resolves.toBeNull();
    await expect(resolvePriceContext([144.99, -37.8], "Abbotsford")).resolves.toBeNull();
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false } as Response));
    await expect(loadPriceContext()).resolves.toBeNull();
  });

  it("resolves by name first, then nearest centroid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE,
      } as unknown as Response)
    );
    const byName = await resolvePriceContext([144.99, -37.87], "Abbotsford");
    expect(byName?.matchedBy).toBe("name");
    expect(byName?.entry.suburb).toBe("Abbotsford");

    const nearest = await resolvePriceContext([144.99, -37.87], "Atlantis");
    expect(nearest?.matchedBy).toBe("nearest");
    expect(nearest?.entry.suburb).toBe("St Kilda East");
    expect(nearest?.distanceKm).toBeDefined();
  });
});

describe("series helpers", () => {
  it("yearTrend sorts, trims to last N and drops junk", () => {
    const trend = yearTrend(
      { "2020": 100, "2018": 80, junk: 50, "2019": Number.NaN, "2021": 110, "2022": 120, "2023": 130 },
      5
    );
    expect(trend.map((p) => p.period)).toEqual(["2018", "2020", "2021", "2022", "2023"]);
    expect(yearTrend(undefined)).toEqual([]);
  });

  it("latestQuarter picks the chronologically last quarter", () => {
    const q = latestQuarter(FIXTURE.suburbs.abbotsford.rentMedianByQuarter);
    expect(q).toEqual({ period: "Sep 2025", value: 550 });
    expect(latestQuarter({ "Dec 2024": 500, "Mar 2025": 510 })?.period).toBe("Mar 2025");
    expect(latestQuarter(undefined)).toBeNull();
    expect(latestQuarter({ nonsense: 5 })).toBeNull();
  });

  it("trendChangePct computes first->last percent change", () => {
    expect(
      trendChangePct([
        { period: "2019", value: 1000000 },
        { period: "2023", value: 1190000 },
      ])
    ).toBe(19);
    expect(trendChangePct([{ period: "2023", value: 1 }])).toBeNull();
  });
});

describe("formatters", () => {
  it("formats prices compactly", () => {
    expect(formatPriceShort(1250000)).toBe("$1.25m");
    expect(formatPriceShort(1200000)).toBe("$1.2m");
    expect(formatPriceShort(1000000)).toBe("$1m");
    expect(formatPriceShort(925000)).toBe("$925k");
    expect(formatPriceShort(Number.NaN)).toBe("-");
    expect(formatPriceShort(-5)).toBe("-");
  });

  it("formats weekly rents", () => {
    expect(formatRentWeekly(550)).toBe("$550/wk");
    expect(formatRentWeekly(0)).toBe("-");
  });
});
