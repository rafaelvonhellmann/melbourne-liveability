import { describe, it, expect } from "vitest";
import { projectedGrowth } from "../lib/vif";

describe("projectedGrowth", () => {
  it("computes 2021 -> 2036 growth % for population + dwellings", () => {
    const r = projectedGrowth({
      population: { "2021": 1000, "2036": 1200 },
      dwellings: { "2021": 400, "2036": 500 },
      sourceId: "vif2023-sa2",
      period: "2021-2036",
    });
    expect(r.populationGrowthPct).toBe(20);
    expect(r.dwellingGrowthPct).toBe(25);
  });
  it("rounds to one decimal place", () => {
    const r = projectedGrowth({
      population: { "2021": 3000, "2036": 3200 },
      dwellings: {},
      sourceId: "x",
      period: "y",
    });
    expect(r.populationGrowthPct).toBe(6.7); // 200/3000 = 6.67%
  });
  it("returns null when an endpoint is missing, zero-base, or absent", () => {
    expect(
      projectedGrowth({ population: { "2021": 1000 }, dwellings: {}, sourceId: "x", period: "y" })
    ).toEqual({ populationGrowthPct: null, dwellingGrowthPct: null });
    expect(projectedGrowth(null)).toEqual({
      populationGrowthPct: null,
      dwellingGrowthPct: null,
    });
  });
});
