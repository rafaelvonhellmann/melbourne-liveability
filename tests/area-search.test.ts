import { describe, it, expect } from "vitest";
import { parseQuery, rankAreas } from "../lib/area-search";
import type { Place } from "../lib/types";

describe("parseQuery", () => {
  it("maps plain-language wants to domains + reports the matches", () => {
    const r = parseQuery("somewhere safe and affordable, near a train station with good schools");
    expect(r.domains.sort()).toEqual(["affordability", "education", "safety", "transport"].sort());
    expect(r.matched.map((m) => m.domain).sort()).toEqual(["affordability", "education", "safety", "transport"].sort());
    expect(r.unmatched).toEqual([]); // all content words mapped or are stopwords
  });

  it("flags words it cannot map, and maps none when nothing matches", () => {
    const r = parseQuery("beachfront quokkas");
    expect(r.domains).toEqual([]);
    expect(r.unmatched).toContain("beachfront");
    expect(r.unmatched).toContain("quokkas");
  });

  it("dedupes a domain hit by multiple synonyms", () => {
    const r = parseQuery("cheap and affordable budget rent");
    expect(r.domains).toEqual(["affordability"]);
    expect(r.matched.filter((m) => m.domain === "affordability")).toHaveLength(1);
  });
});

function place(slug: string, domains: Record<string, number>, nonResidential = false): Place {
  return {
    sa2Code: slug,
    slug,
    name: slug,
    lga: "Testville",
    suburbAliases: [],
    centroid: [145, -37],
    nonResidential,
    domains: Object.fromEntries(Object.entries(domains).map(([k, v]) => [k, { percentile: v }])) as Place["domains"],
  };
}

describe("rankAreas", () => {
  const places = [
    place("high", { safety: 90, affordability: 80 }),
    place("mid", { safety: 60, affordability: 60 }),
    place("low", { safety: 20, affordability: 30 }),
    place("nonres", { safety: 99, affordability: 99 }, true),
  ];

  it("ranks by mean percentile across the requested domains, dropping non-residential", () => {
    const r = rankAreas(["safety", "affordability"], places);
    expect(r.map((m) => m.slug)).toEqual(["high", "mid", "low"]);
    expect(r[0].score).toBe(85); // (90+80)/2
    expect(r[0].perDomain).toHaveLength(2);
  });

  it("averages only the domains an area has", () => {
    const r = rankAreas(["safety", "health"], [place("x", { safety: 80 })]);
    expect(r[0].score).toBe(80); // health missing -> averaged over the one present
    expect(r[0].perDomain).toHaveLength(1);
  });

  it("returns [] when no domains requested", () => {
    expect(rankAreas([], places)).toEqual([]);
  });
});
