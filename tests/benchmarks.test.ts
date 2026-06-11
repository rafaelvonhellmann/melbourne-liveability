import { describe, it, expect } from "vitest";
import {
  quantileSorted,
  computeBenchmark,
  computeGmBenchmarks,
  computeGmContext,
} from "../lib/benchmarks";
import type { DomainId, DomainScore, IndicatorValue, Place } from "../lib/types";

function ind(raw: number | null): IndicatorValue {
  return {
    raw,
    percentile: null,
    method: "direct",
    sourceId: "test",
    missing: raw == null,
    stale: false,
  };
}

function domain(
  id: DomainId,
  subs: Record<string, IndicatorValue>
): DomainScore {
  return { domain: id, scored: true, percentile: null, subIndicators: subs };
}

function place(
  slug: string,
  rentToIncome: number | null,
  nonResidential = false
): Place {
  return {
    sa2Code: slug,
    slug,
    name: slug,
    lga: "Test",
    suburbAliases: [],
    centroid: [0, 0],
    nonResidential,
    domains: {
      affordability: domain("affordability", {
        rentToIncome: ind(rentToIncome),
      }),
    },
  };
}

describe("quantileSorted", () => {
  it("returns endpoints and median", () => {
    const s = [1, 2, 3, 4, 5];
    expect(quantileSorted(s, 0)).toBe(1);
    expect(quantileSorted(s, 1)).toBe(5);
    expect(quantileSorted(s, 0.5)).toBe(3);
  });

  it("interpolates linearly between points", () => {
    expect(quantileSorted([0, 10], 0.25)).toBeCloseTo(2.5, 6);
  });

  it("handles single-element and empty arrays", () => {
    expect(quantileSorted([42], 0.5)).toBe(42);
    expect(Number.isNaN(quantileSorted([], 0.5))).toBe(true);
  });
});

describe("computeBenchmark", () => {
  it("computes order statistics and mean", () => {
    const b = computeBenchmark([4, 1, 3, 2])!;
    expect(b.count).toBe(4);
    expect(b.min).toBe(1);
    expect(b.max).toBe(4);
    expect(b.median).toBeCloseTo(2.5, 6);
    expect(b.mean).toBeCloseTo(2.5, 6);
  });

  it("ignores non-finite values and returns null when empty", () => {
    expect(computeBenchmark([Number.NaN, Infinity])).toBeNull();
    const b = computeBenchmark([Number.NaN, 5])!;
    expect(b.count).toBe(1);
    expect(b.min).toBe(5);
  });
});

describe("computeGmBenchmarks", () => {
  it("aggregates raw values per catalogued indicator, excluding non-residential", () => {
    const places = [
      place("a", 0.2),
      place("b", 0.4),
      place("c", 0.6),
      place("skip", 0.99, true),
    ];
    const benchmarks = computeGmBenchmarks(places);
    const stats = benchmarks.affordability?.rentToIncome;
    expect(stats).toBeDefined();
    expect(stats!.count).toBe(3);
    expect(stats!.min).toBeCloseTo(0.2, 6);
    expect(stats!.max).toBeCloseTo(0.6, 6);
    expect(stats!.median).toBeCloseTo(0.4, 6);
  });

  it("omits indicators with no measured values", () => {
    const benchmarks = computeGmBenchmarks([place("a", null)]);
    expect(benchmarks.affordability?.rentToIncome).toBeUndefined();
  });
});

describe("computeGmContext", () => {
  function ctxPlace(slug: string, n: number, nonResidential = false): Place {
    return {
      ...place(slug, 0.2, nonResidential),
      context: {
        community: {
          renterPct: 20 + n,
          apartmentPct: null,
          firstNationsPct: null,
          sourceId: "test",
          period: "2021",
        },
        schools: {
          government: n,
          catholic: n + 1,
          independent: 0,
          sourceId: "test",
          period: "2025",
        },
        socialHousing: {
          socialPct: n,
          statePct: n / 2,
          communityPct: n / 4,
          dwellings: null,
          totalDwellings: null,
          sourceId: "test",
          period: "2021",
        },
        housingStress: {
          rentStressPct: 10 * n,
          mortgageStressPct: 5 * n,
          sourceId: "test",
          period: "2021",
        },
        planning: {
          heritageOverlayPct: n === 2 ? 4 : 0,
          sourceId: "test",
          period: "2024",
        },
      },
    };
  }

  it("computes medians for schools, social housing, stress and heritage blocks", () => {
    const gm = computeGmContext([
      ctxPlace("a", 1),
      ctxPlace("b", 2),
      ctxPlace("c", 3),
      ctxPlace("skip", 9, true), // non-residential: excluded from the baseline
    ]);
    expect(gm.renterPct).toBe(22);
    expect(gm.schoolsGovernment).toBe(2);
    expect(gm.schoolsCatholic).toBe(3);
    expect(gm.schoolsIndependent).toBe(0);
    expect(gm.socialPct).toBe(2);
    expect(gm.statePct).toBe(1);
    expect(gm.communityPct).toBe(0.5);
    expect(gm.rentStressPct).toBe(20);
    expect(gm.mortgageStressPct).toBe(10);
    // Median of [0, 4, 0] - the typical area has no heritage overlay.
    expect(gm.heritageOverlayPct).toBe(0);
  });

  it("leaves fields undefined when no place holds the block", () => {
    const gm = computeGmContext([place("a", 0.2)]);
    expect(gm.schoolsGovernment).toBeUndefined();
    expect(gm.socialPct).toBeUndefined();
    expect(gm.rentStressPct).toBeUndefined();
    expect(gm.heritageOverlayPct).toBeUndefined();
  });
});
