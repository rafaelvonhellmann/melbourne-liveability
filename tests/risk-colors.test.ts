import { describe, it, expect } from "vitest";
import {
  riskToColor,
  percentileToColor,
  RISK_PALETTE,
  RISK_BANDS,
  NO_DATA_COLOR,
} from "../lib/colors";
import { riskFillColorByProp } from "../lib/map-expressions";

describe("percentileToColor (score ramp)", () => {
  it("hits the red->green ramp endpoints and interpolates the middle", () => {
    expect(percentileToColor(0)).toBe("#d7191c"); // worse = red
    expect(percentileToColor(100)).toBe("#1a9641"); // better = green
    expect(percentileToColor(50)).toBe("#ffffbf"); // mid = yellow
    const mid = percentileToColor(12.5); // halfway red->orange
    expect(mid).not.toBe("#d7191c");
    expect(mid).not.toBe("#fdae61");
  });
  it("returns the no-data grey for null / non-residential", () => {
    expect(percentileToColor(null)).toBe(NO_DATA_COLOR);
    expect(percentileToColor(80, true)).toBe(NO_DATA_COLOR);
  });
});

describe("riskToColor", () => {
  it("uses the palest band at/below the first threshold", () => {
    expect(riskToColor(0)).toBe(RISK_PALETTE[0]);
    expect(riskToColor(RISK_BANDS[0] - 0.1)).toBe(RISK_PALETTE[0]);
  });

  it("deepens through the bands by overlay share", () => {
    expect(riskToColor(RISK_BANDS[0])).toBe(RISK_PALETTE[1]); // 2%
    expect(riskToColor(RISK_BANDS[1])).toBe(RISK_PALETTE[2]); // 10%
    expect(riskToColor(RISK_BANDS[2])).toBe(RISK_PALETTE[3]); // 25%
    expect(riskToColor(RISK_BANDS[3])).toBe(RISK_PALETTE[4]); // 50%
    expect(riskToColor(100)).toBe(RISK_PALETTE[4]);
  });

  it("returns the no-data grey for null or non-residential, never a risk colour", () => {
    expect(riskToColor(null)).toBe(NO_DATA_COLOR);
    expect(riskToColor(80, true)).toBe(NO_DATA_COLOR);
  });
});

describe("riskFillColorByProp", () => {
  it("builds a case expression that guards null + non-residential, keyed on the prop", () => {
    const expr = riskFillColorByProp("bushfire_share");
    const json = JSON.stringify(expr);
    expect(expr[0]).toBe("case");
    expect(json).toContain("bushfire_share");
    expect(json).toContain("nonResidential");
    expect(json).toContain(RISK_PALETTE[0]);
    expect(json).toContain(RISK_PALETTE[4]);
  });
});
