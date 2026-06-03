import { describe, it, expect } from "vitest";
import {
  hasCoastalExposure,
  worstCoastalScenario,
  COASTAL_SCENARIOS,
} from "../lib/coastal";

describe("COASTAL_SCENARIOS", () => {
  it("lists the SLR scenarios near-term first with layer ids", () => {
    expect(COASTAL_SCENARIOS.map((s) => s.key)).toEqual(["2040", "2070", "2100"]);
    for (const s of COASTAL_SCENARIOS) {
      expect(typeof s.layerId).toBe("number");
      expect(s.slr).toMatch(/m$/);
    }
  });
});

describe("hasCoastalExposure", () => {
  it("is false for null / empty / sub-threshold", () => {
    expect(hasCoastalExposure(null)).toBe(false);
    expect(hasCoastalExposure({})).toBe(false);
    expect(hasCoastalExposure({ "2100": 0.4 })).toBe(false);
  });
  it("is true when any scenario is >= 1%", () => {
    expect(hasCoastalExposure({ "2100": 1 })).toBe(true);
    expect(hasCoastalExposure({ "2040": 5 })).toBe(true);
  });
});

describe("worstCoastalScenario", () => {
  it("returns null when nothing is material", () => {
    expect(worstCoastalScenario({ "2040": 0.2 })).toBeNull();
    expect(worstCoastalScenario(null)).toBeNull();
  });
  it("picks the longest-horizon material scenario (largest share)", () => {
    const w = worstCoastalScenario({ "2040": 2, "2070": 5, "2100": 9 });
    expect(w?.label).toBe("2100");
    expect(w?.pct).toBe(9);
  });
  it("falls back to a nearer horizon if only it is material", () => {
    const w = worstCoastalScenario({ "2040": 3 });
    expect(w?.label).toBe("2040");
  });
});
