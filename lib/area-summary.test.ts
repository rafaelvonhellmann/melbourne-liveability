import { describe, it, expect } from "vitest";
import { buildAreaSummary } from "./area-summary";
import type { Place } from "./types";

// Minimal fixtures: buildAreaSummary only reads name/lga/domains[].percentile and
// a couple of context fields, so cast a partial rather than a full Place.
function mk(partial: unknown): Place {
  return partial as Place;
}

describe("buildAreaSummary", () => {
  it("returns null without enough scored domains", () => {
    expect(buildAreaSummary(mk({ name: "X", domains: {} }))).toBeNull();
    expect(
      buildAreaSummary(
        mk({ name: "X", domains: { transport: { percentile: 80 } } })
      )
    ).toBeNull();
  });

  it("summarises character, strengths/weaknesses and rental mix", () => {
    const place = mk({
      name: "Testville",
      lga: "Yarra",
      domains: {
        transport: { percentile: 92 },
        health: { percentile: 80 },
        education: { percentile: 70 },
        safety: { percentile: 20 },
        affordability: { percentile: 15 },
        hazards: { percentile: 55 },
        income: { percentile: 50 },
      },
      context: {
        population: { densityPerKm2: 5200 },
        community: { renterPct: 62 },
      },
    });
    const s = buildAreaSummary(place);
    expect(s).not.toBeNull();
    expect(s).toContain("Testville, in Yarra,");
    expect(s).toContain("dense, urban");
    expect(s).toMatch(/ranks strongly for .*public transport/);
    expect(s).toContain("rates lower for");
    expect(s).toContain("rental market");
    expect(s).toContain("not advice");
  });

  it("uses direction-aware wording for hazards as a strength", () => {
    const place = mk({
      name: "Safeville",
      lga: "Boroondara",
      domains: {
        hazards: { percentile: 95 },
        safety: { percentile: 90 },
        health: { percentile: 80 },
        transport: { percentile: 20 },
        affordability: { percentile: 25 },
      },
      context: { population: { densityPerKm2: 1200 } },
    });
    const s = buildAreaSummary(place) ?? "";
    expect(s).toContain("low hazard exposure");
    expect(s).toContain("lower-density");
  });
});
