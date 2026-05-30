import { describe, it, expect } from "vitest";
import {
  percentileRank,
  computeWeightedScore,
  rankPlaces,
} from "../lib/scoring";
import { V1_SCORED_DOMAINS } from "../lib/domains";
import {
  normalizeWeights,
  serializeWeights,
  parseWeightsFromSearchParams,
} from "../lib/weights";
import type { Place } from "../lib/types";

const fixture = (id: string, pct: number): Place => ({
  sa2Code: id,
  slug: id,
  name: id,
  lga: "Test",
  suburbAliases: [],
  centroid: [144.96, -37.81],
  domains: {
    affordability: {
      domain: "affordability",
      scored: true,
      percentile: pct,
      subIndicators: {},
    },
    transport: {
      domain: "transport",
      scored: true,
      percentile: pct + 5,
      subIndicators: {},
    },
    safety: {
      domain: "safety",
      scored: true,
      percentile: pct + 10,
      subIndicators: {},
    },
    health: {
      domain: "health",
      scored: true,
      percentile: pct + 15,
      subIndicators: {},
    },
    income: {
      domain: "income",
      scored: true,
      percentile: pct + 20,
      subIndicators: {},
    },
    hazards: {
      domain: "hazards",
      scored: true,
      percentile: pct + 22,
      subIndicators: {},
    },
    education: {
      domain: "education",
      scored: true,
      percentile: pct + 24,
      subIndicators: {},
    },
  },
});

describe("percentileRank", () => {
  it("ranks lowest to highest", () => {
    const m = percentileRank([
      { id: "a", value: 10 },
      { id: "b", value: 20 },
    ]);
    expect(m.get("a")).toBe(0);
    expect(m.get("b")).toBe(100);
  });
});

describe("weights URL round-trip", () => {
  it("serializes and parses", () => {
    const w = normalizeWeights({
      affordability: 30,
      transport: 18,
      safety: 14,
      health: 14,
      hazards: 8,
      education: 8,
      income: 8,
    });
    const s = serializeWeights(w);
    const p = parseWeightsFromSearchParams(`w=${s}`);
    expect(p?.affordability).toBe(30);
  });

  it("normalized weights sum to 100", () => {
    const w = normalizeWeights({
      affordability: 10,
      transport: 10,
      safety: 10,
      health: 10,
      income: 10,
    });
    const sum = V1_SCORED_DOMAINS.reduce((s, d) => s + (w[d] ?? 0), 0);
    expect(sum).toBe(100);
  });
});

describe("computeWeightedScore", () => {
  it("produces reproducible breakdown", () => {
    const p = fixture("carlton", 50);
    const b = computeWeightedScore(p, normalizeWeights({}));
    expect(b.total).toBeGreaterThan(0);
    expect(b.components.length).toBe(7);
  });
});

describe("rankPlaces", () => {
  it("excludes non-residential", () => {
    const places = [
      fixture("a", 80),
      { ...fixture("b", 20), nonResidential: true },
    ];
    const ranked = rankPlaces(places, normalizeWeights({}));
    expect(ranked).toHaveLength(1);
  });
});
