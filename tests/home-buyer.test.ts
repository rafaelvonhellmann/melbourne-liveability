import { describe, it, expect } from "vitest";
import type { DomainId, DomainScore, Place } from "../lib/types";
import {
  HOME_BUYER_FACTORS,
  computeHomeBuyerIndex,
  rankHomeBuyerPercentiles,
} from "../lib/home-buyer";

function domain(id: DomainId, percentile: number | null): DomainScore {
  return { domain: id, scored: true, percentile, subIndicators: {} };
}

function makePlace(
  slug: string,
  pcts: Partial<Record<DomainId, number | null>>,
  walkIndex?: number | null,
  nonResidential = false
): Place {
  const domains: Place["domains"] = {};
  for (const [k, v] of Object.entries(pcts)) {
    domains[k as DomainId] = domain(k as DomainId, v ?? null);
  }
  return {
    sa2Code: slug,
    slug,
    name: slug,
    lga: "Test",
    suburbAliases: [],
    centroid: [0, 0],
    nonResidential,
    domains,
    context:
      walkIndex == null
        ? undefined
        : {
            walkAccess: {
              thresholdKm: 1.2,
              categories: {},
              reachable: 0,
              total: 8,
              accessPct: 0,
              walkabilityIndex: walkIndex,
              sourceId: "osm-amenities",
              period: "current",
            },
          },
  };
}

describe("HOME_BUYER_FACTORS", () => {
  it("weights sum to 1", () => {
    const sum = HOME_BUYER_FACTORS.reduce((s, f) => s + f.weight, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe("computeHomeBuyerIndex", () => {
  it("blends all-100 inputs to 100", () => {
    const p = makePlace(
      "a",
      {
        affordability: 100,
        safety: 100,
        education: 100,
        transport: 100,
        hazards: 100,
      },
      100
    );
    const idx = computeHomeBuyerIndex(p);
    expect(idx.value).toBeCloseTo(100, 6);
    expect(idx.measured).toBe(6);
    // Contributions sum to the composite value.
    const sum = idx.factors.reduce((s, f) => s + f.contribution, 0);
    expect(sum).toBeCloseTo(idx.value ?? 0, 6);
  });

  it("renormalises present weights when factors are missing", () => {
    // Only affordability + safety present, both 80 → composite should be 80.
    const p = makePlace("b", { affordability: 80, safety: 80 });
    const idx = computeHomeBuyerIndex(p);
    expect(idx.value).toBeCloseTo(80, 6);
    expect(idx.measured).toBe(2);
    expect(idx.factors.find((f) => f.id === "transport")?.missing).toBe(true);
  });

  it("weights affordability above walk access", () => {
    // Same value everywhere except one factor; the affordability-only-high place
    // should out-score the walkAccess-only-high place.
    const highAfford = computeHomeBuyerIndex(
      makePlace("c", { affordability: 100, safety: 0, education: 0, transport: 0, hazards: 0 }, 0)
    ).value!;
    const highWalk = computeHomeBuyerIndex(
      makePlace("d", { affordability: 0, safety: 0, education: 0, transport: 0, hazards: 0 }, 100)
    ).value!;
    expect(highAfford).toBeGreaterThan(highWalk);
  });

  it("returns null when no inputs are present", () => {
    const idx = computeHomeBuyerIndex(makePlace("e", {}));
    expect(idx.value).toBeNull();
    expect(idx.measured).toBe(0);
  });
});

describe("rankHomeBuyerPercentiles", () => {
  it("ranks composites within Greater Melbourne and skips non-residential", () => {
    const places = [
      makePlace("low", { affordability: 10, safety: 10, education: 10, transport: 10, hazards: 10 }, 10),
      makePlace("mid", { affordability: 50, safety: 50, education: 50, transport: 50, hazards: 50 }, 50),
      makePlace("high", { affordability: 90, safety: 90, education: 90, transport: 90, hazards: 90 }, 90),
      makePlace("skip", { affordability: 99 }, 99, true),
    ];
    const ranks = rankHomeBuyerPercentiles(places);
    expect(ranks.has("skip")).toBe(false);
    expect(ranks.get("low")).toBe(0);
    expect(ranks.get("high")).toBe(100);
    expect(ranks.get("mid")).toBeCloseTo(50, 6);
  });
});
