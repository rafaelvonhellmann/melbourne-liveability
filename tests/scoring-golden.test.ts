import { describe, it, expect } from "vitest";
import { percentileRank, computeWeightedScore, rankPlaces } from "../lib/scoring";
import { V1_SCORED_DOMAINS } from "../lib/domains";
import { getDefaultWeights } from "../lib/weights";
import type { DomainId, Place, ScoreWeights } from "../lib/types";

/**
 * GOLDEN-VALUE scoring tests - the money path. Every expectation here is a
 * hand-computed number, so a wrong weight, a wrong renormalisation or a wrong
 * sort order FAILS (the older smoke tests only asserted total > 0). If one of
 * these breaks, the score the whole product ranks on has changed - that must be
 * a deliberate, reviewed decision, never a drive-by edit.
 */

/** The ULTRAPLAN section-1 weights this product ships with (sum 100). */
const SPEC_WEIGHTS: ScoreWeights = {
  affordability: 30,
  transport: 18,
  safety: 14,
  health: 14,
  hazards: 8,
  education: 8,
  income: 8,
};

/** Build a Place whose domain percentiles are exactly `pcts` (null = missing). */
function makePlace(
  slug: string,
  pcts: Partial<Record<DomainId, number | null>>,
  extra: Partial<Place> = {}
): Place {
  const domains: Place["domains"] = {};
  for (const d of V1_SCORED_DOMAINS) {
    if (!(d in pcts)) continue;
    domains[d] = {
      domain: d,
      scored: true,
      percentile: pcts[d] ?? null,
      subIndicators: {},
    };
  }
  return {
    sa2Code: slug,
    slug,
    name: slug,
    lga: "Test",
    suburbAliases: [],
    centroid: [144.96, -37.81],
    domains,
    ...extra,
  };
}

describe("default weights (registry pin)", () => {
  it("ships exactly the spec weights 30/18/14/14/8/8/8", () => {
    expect(getDefaultWeights()).toEqual(SPEC_WEIGHTS);
  });

  it("scored-domain order is the spec order", () => {
    expect(V1_SCORED_DOMAINS).toEqual([
      "affordability",
      "transport",
      "safety",
      "health",
      "hazards",
      "education",
      "income",
    ]);
  });
});

describe("computeWeightedScore golden values", () => {
  // alpha: full data. Hand computation with spec weights (presentWeight 100):
  //   affordability 30 * 50/100  = 15
  //   transport     18 * 100/100 = 18
  //   safety        14 * 0/100   =  0
  //   health        14 * 50/100  =  7
  //   hazards        8 * 100/100 =  8
  //   education      8 * 25/100  =  2
  //   income         8 * 75/100  =  6
  //   total                      = 56
  const alpha = makePlace("alpha", {
    affordability: 50,
    transport: 100,
    safety: 0,
    health: 50,
    hazards: 100,
    education: 25,
    income: 75,
  });

  it("full-data place scores exactly the hand-computed weighted total", () => {
    const b = computeWeightedScore(alpha, SPEC_WEIGHTS);
    expect(b.total).toBeCloseTo(56, 10);
    expect(b.components).toHaveLength(7);
    // Components come back in the registry's scored-domain order.
    expect(b.components.map((c) => c.domain)).toEqual([
      "affordability",
      "transport",
      "safety",
      "health",
      "hazards",
      "education",
      "income",
    ]);
    const expected: Record<string, number> = {
      affordability: 15,
      transport: 18,
      safety: 0,
      health: 7,
      hazards: 8,
      education: 2,
      income: 6,
    };
    for (const c of b.components) {
      expect(c.missing).toBe(false);
      expect(c.weight).toBe(SPEC_WEIGHTS[c.domain]);
      expect(c.contribution).toBeCloseTo(expected[c.domain], 10);
    }
  });

  it("default weights give the same golden total (defaults == spec)", () => {
    const b = computeWeightedScore(alpha, getDefaultWeights());
    expect(b.total).toBeCloseTo(56, 10);
  });

  it("a deliberately wrong weight changes the total (mutant guard)", () => {
    // transport 18 -> 19, safety 14 -> 13 (still sums to 100). If the golden
    // assertions above could not tell these apart they would be worthless.
    const wrong = { ...SPEC_WEIGHTS, transport: 19, safety: 13 };
    const b = computeWeightedScore(alpha, wrong);
    // 15 + 19 + 0 + 7 + 8 + 2 + 6 = 57, not 56.
    expect(b.total).toBeCloseTo(57, 10);
    expect(Math.abs(b.total - 56)).toBeGreaterThan(0.5);
  });

  it("missing domain renormalises over the PRESENT weight only", () => {
    // bravo: affordability missing -> presentWeight = 70. Hand computation:
    //   transport 18 * 100/70 = 1800/70
    //   safety    14 * 50/70  =  700/70
    //   health    14 * 0/70   =    0
    //   hazards    8 * 100/70 =  800/70
    //   education  8 * 50/70  =  400/70
    //   income     8 * 0/70   =    0
    //   total = 3700/70 = 52.857142857...
    const bravo = makePlace("bravo", {
      affordability: null,
      transport: 100,
      safety: 50,
      health: 0,
      hazards: 100,
      education: 50,
      income: 0,
    });
    const b = computeWeightedScore(bravo, SPEC_WEIGHTS);
    expect(b.total).toBeCloseTo(3700 / 70, 10);
    const aff = b.components.find((c) => c.domain === "affordability")!;
    expect(aff.missing).toBe(true);
    expect(aff.percentile).toBeNull();
    expect(aff.contribution).toBe(0);
    expect(aff.weight).toBe(30);
    const transport = b.components.find((c) => c.domain === "transport")!;
    expect(transport.contribution).toBeCloseTo(1800 / 70, 10);
    const hazards = b.components.find((c) => c.domain === "hazards")!;
    expect(hazards.contribution).toBeCloseTo(800 / 70, 10);
  });

  it("zero-weight domains are excluded; power-of-two weights are exact", () => {
    // charlie: only transport/safety/income weighted (2:1:1, presentWeight 4).
    //   transport 2/4 * 80 = 40
    //   safety    1/4 * 60 = 15
    //   income    1/4 * 20 =  5   -> total 60, exact in binary floating point.
    const charlie = makePlace("charlie", {
      affordability: 90,
      transport: 80,
      safety: 60,
      health: 90,
      hazards: 90,
      education: 90,
      income: 20,
    });
    const b = computeWeightedScore(charlie, {
      affordability: 0,
      transport: 2,
      safety: 1,
      health: 0,
      hazards: 0,
      education: 0,
      income: 1,
    });
    expect(b.components.map((c) => c.domain)).toEqual(["transport", "safety", "income"]);
    expect(b.total).toBe(60);
    expect(b.components.map((c) => c.contribution)).toEqual([40, 15, 5]);
  });

  it("a place with no scored data totals exactly 0, all components missing", () => {
    const empty = makePlace("empty", {});
    const b = computeWeightedScore(empty, SPEC_WEIGHTS);
    expect(b.total).toBe(0);
    expect(b.components).toHaveLength(7);
    for (const c of b.components) {
      expect(c.missing).toBe(true);
      expect(c.contribution).toBe(0);
    }
  });

  it("single present domain scores that percentile outright (renormalisation edge)", () => {
    // Only affordability present at 100 -> presentWeight 30, contribution
    // (30/30)*100 = 100. Documents that sparse places can hit a perfect total.
    const solo = makePlace("solo", { affordability: 100 });
    const b = computeWeightedScore(solo, SPEC_WEIGHTS);
    expect(b.total).toBe(100);
  });
});

describe("rankPlaces golden ordering", () => {
  it("orders by exact totals, keeps ties stable, drops non-residential", () => {
    const midA = makePlace("mid-a", {
      affordability: 50, transport: 50, safety: 50, health: 50,
      hazards: 50, education: 50, income: 50,
    });
    const low = makePlace("low", {
      affordability: 10, transport: 10, safety: 10, health: 10,
      hazards: 10, education: 10, income: 10,
    });
    const high = makePlace("high", {
      affordability: 90, transport: 90, safety: 90, health: 90,
      hazards: 90, education: 90, income: 90,
    });
    const midB = makePlace("mid-b", {
      affordability: 50, transport: 50, safety: 50, health: 50,
      hazards: 50, education: 50, income: 50,
    });
    const nonRes = makePlace(
      "industrial",
      {
        affordability: 95, transport: 95, safety: 95, health: 95,
        hazards: 95, education: 95, income: 95,
      },
      { nonResidential: true }
    );
    // Sparse data + renormalisation -> a perfect single-domain place tops the list.
    const solo = makePlace("solo-top", { affordability: 100 });

    const ranked = rankPlaces([midA, low, high, midB, nonRes, solo], SPEC_WEIGHTS);

    expect(ranked.map((p) => p.slug)).toEqual([
      "solo-top", // 100 (only domain present)
      "high",     // 90
      "mid-a",    // 50 - tie resolved by stable sort: input order preserved
      "mid-b",    // 50
      "low",      // 10
    ]);
    expect(ranked.map((p) => p.slug)).not.toContain("industrial");
    expect(ranked[0].breakdown.total).toBe(100);
    expect(ranked[1].breakdown.total).toBeCloseTo(90, 10);
    expect(ranked[2].breakdown.total).toBeCloseTo(50, 10);
    expect(ranked[3].breakdown.total).toBeCloseTo(50, 10);
    expect(ranked[4].breakdown.total).toBeCloseTo(10, 10);
  });
});

describe("percentileRank golden values", () => {
  it("spreads evenly over 0..100 regardless of input order", () => {
    const m = percentileRank([
      { id: "c", value: 30 },
      { id: "a", value: 10 },
      { id: "d", value: 40 },
      { id: "b", value: 20 },
    ]);
    expect(m.get("a")).toBe(0);
    expect(m.get("b")).toBeCloseTo(100 / 3, 12);
    expect(m.get("c")).toBeCloseTo(200 / 3, 12);
    expect(m.get("d")).toBe(100);
  });

  it("invert flips the scale exactly", () => {
    const m = percentileRank(
      [
        { id: "lowest", value: 1 },
        { id: "mid", value: 2 },
        { id: "highest", value: 3 },
      ],
      true
    );
    expect(m.get("lowest")).toBe(100);
    expect(m.get("mid")).toBe(50);
    expect(m.get("highest")).toBe(0);
  });

  it("single value pins to 50; empty input yields an empty map", () => {
    expect(percentileRank([{ id: "only", value: 7 }]).get("only")).toBe(50);
    expect(percentileRank([]).size).toBe(0);
  });
});
