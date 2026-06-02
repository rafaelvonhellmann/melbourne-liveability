import { describe, it, expect } from "vitest";
import { findSimilarAreas } from "../lib/similar-areas";
import type { DomainId, Place } from "../lib/types";

/** Build a place from a per-domain percentile map (null = indicator missing). */
const place = (
  slug: string,
  pct: Partial<Record<DomainId, number | null>>,
  extra: Partial<Place> = {}
): Place => ({
  sa2Code: slug,
  slug,
  name: slug,
  lga: "Test",
  suburbAliases: [],
  centroid: [144.96, -37.81],
  domains: Object.fromEntries(
    Object.entries(pct).map(([id, p]) => [
      id,
      { domain: id as DomainId, scored: p != null, percentile: p ?? null, subIndicators: {} },
    ])
  ) as Place["domains"],
  ...extra,
});

const REF = place("ref", {
  transport: 80,
  health: 70,
  safety: 60,
  education: 50,
  affordability: 40,
});

describe("findSimilarAreas", () => {
  it("scores an identical area at 100 across all shared domains", () => {
    const twin = place("twin", {
      transport: 80,
      health: 70,
      safety: 60,
      education: 50,
      affordability: 40,
    });
    const [m] = findSimilarAreas(REF, [twin]);
    expect(m.similarity).toBe(100);
    expect(m.sharedDomains).toHaveLength(5);
  });

  it("ranks a closer area above a farther one", () => {
    const near = place("near", {
      transport: 85,
      health: 75,
      safety: 65,
      education: 55,
      affordability: 45,
    }); // +5 each -> meanGap 5 -> 95
    const far = place("far", {
      transport: 60,
      health: 50,
      safety: 40,
      education: 30,
      affordability: 20,
    }); // -20 each -> meanGap 20 -> 80
    const res = findSimilarAreas(REF, [far, near]);
    expect(res.map((m) => m.place.slug)).toEqual(["near", "far"]);
    expect(res[0].similarity).toBe(95);
    expect(res[1].similarity).toBe(80);
  });

  it("excludes the reference itself and non-residential areas", () => {
    const self = place("ref", { transport: 80, health: 70, safety: 60, education: 50 });
    const nonres = place(
      "park",
      { transport: 80, health: 70, safety: 60, education: 50 },
      { nonResidential: true }
    );
    const ok = place("ok", { transport: 80, health: 70, safety: 60, education: 50 });
    const res = findSimilarAreas(REF, [self, nonres, ok]);
    expect(res.map((m) => m.place.slug)).toEqual(["ok"]);
  });

  it("compares only domains present in both — a missing indicator is never imputed", () => {
    // Candidate matches the 4 domains it shares; the extra domain the reference
    // lacks (population) must not count against it.
    const cand = place("cand", {
      transport: 80,
      health: 70,
      safety: 60,
      education: 50,
      population: 0,
    });
    const [m] = findSimilarAreas(REF, [cand]);
    expect(m.similarity).toBe(100);
    expect(m.sharedDomains).not.toContain("population");
    expect(m.sharedDomains).not.toContain("affordability"); // cand lacks it
  });

  it("drops candidates below the minimum shared-domain count", () => {
    const thin = place("thin", { transport: 80, health: 70 }); // only 2 shared, default min 4
    expect(findSimilarAreas(REF, [thin])).toHaveLength(0);
  });

  it("clamps the minimum to a data-poor reference so it still finds peers", () => {
    const sparseRef = place("sparse", { transport: 80, health: 70, safety: 60 });
    const peer = place("peer", { transport: 80, health: 70, safety: 60 });
    const [m] = findSimilarAreas(sparseRef, [peer]); // 3 shared, min clamps 4 -> 3
    expect(m.similarity).toBe(100);
  });

  it("surfaces shared strengths (both upper-half and close), top-3 by rank", () => {
    const cand = place("cand", {
      transport: 80,
      health: 70,
      safety: 60,
      education: 50, // both < 55 -> not a strength
      affordability: 40,
    });
    const [m] = findSimilarAreas(REF, [cand]);
    expect(m.sharedStrengths).toEqual(["transport", "health", "safety"]);
  });

  it("honours the limit", () => {
    const cands = Array.from({ length: 10 }, (_, i) =>
      place(`c${i}`, {
        transport: 80 - i,
        health: 70,
        safety: 60,
        education: 50,
        affordability: 40,
      })
    );
    expect(findSimilarAreas(REF, cands, { limit: 3 })).toHaveLength(3);
  });

  it("returns nothing when the reference has no scored domains", () => {
    const empty = place("empty", {});
    const cand = place("cand", { transport: 80, health: 70, safety: 60, education: 50 });
    expect(findSimilarAreas(empty, [cand])).toEqual([]);
  });
});
