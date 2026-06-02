import { describe, it, expect } from "vitest";
import {
  riskToColor,
  percentileToColor,
  percentileTextColor,
  percentileWord,
  getScoreRamp,
  SCORE_RAMP,
  SCORE_RAMP_CB,
  RISK_PALETTE,
  RISK_BANDS,
  NO_DATA_COLOR,
} from "../lib/colors";
import { riskFillColorByProp, choroplethFillColorByProp } from "../lib/map-expressions";

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

describe("colourblind-safe score ramp (RdYlBu)", () => {
  it("getScoreRamp picks RdYlBu when colourblind, RdYlGn otherwise", () => {
    expect(getScoreRamp(true)).toBe(SCORE_RAMP_CB);
    expect(getScoreRamp(false)).toBe(SCORE_RAMP);
    expect(getScoreRamp()).toBe(SCORE_RAMP); // default off
  });
  it("shares the red->yellow low/mid but swaps the good end to blue", () => {
    expect(percentileToColor(0, false, true)).toBe("#d7191c"); // worse still red
    expect(percentileToColor(50, false, true)).toBe("#ffffbf"); // mid still yellow
    expect(percentileToColor(100, false, true)).toBe("#2c7bb6"); // better = blue
    expect(percentileToColor(75, false, true)).toBe("#abd9e9"); // light blue
  });
  it("differs from the default ramp at the green end (the CVD-confounding hue)", () => {
    expect(percentileToColor(100, false, true)).not.toBe(percentileToColor(100));
    expect(percentileToColor(75, false, true)).not.toBe(percentileToColor(75));
  });
  it("still greys-out null / non-residential under the colourblind ramp", () => {
    expect(percentileToColor(null, false, true)).toBe(NO_DATA_COLOR);
    expect(percentileToColor(80, true, true)).toBe(NO_DATA_COLOR);
  });
  it("choroplethFillColorByProp embeds the chosen ramp's stops", () => {
    const def = JSON.stringify(choroplethFillColorByProp("pct_transport"));
    const cb = JSON.stringify(choroplethFillColorByProp("pct_transport", true));
    expect(def).toContain("#1a9641"); // green good-end
    expect(def).not.toContain("#2c7bb6");
    expect(cb).toContain("#2c7bb6"); // blue good-end
    expect(cb).not.toContain("#1a9641");
  });
});

describe("percentileTextColor (legible on either ramp)", () => {
  it("white ink on the dark ends, dark ink on the pale middle (default ramp)", () => {
    expect(percentileTextColor(0)).toBe("#ffffff"); // deep red
    expect(percentileTextColor(50)).toBe("#1A1A18"); // pale yellow
    expect(percentileTextColor(100)).toBe("#ffffff"); // dark green
  });
  it("white on the mid-blue good-end but dark on the light-blue (colourblind ramp)", () => {
    expect(percentileTextColor(100, true)).toBe("#ffffff"); // mid blue
    expect(percentileTextColor(75, true)).toBe("#1A1A18"); // light blue #abd9e9
    expect(percentileTextColor(50, true)).toBe("#1A1A18"); // pale yellow
  });
  it("falls back to dark ink for null", () => {
    expect(percentileTextColor(null)).toBe("#1A1A18");
  });
});

describe("percentileWord (plain-language bands)", () => {
  it("maps percentile to a plain word, worse->better", () => {
    expect(percentileWord(95)).toBe("Excellent");
    expect(percentileWord(70)).toBe("Strong");
    expect(percentileWord(50)).toBe("Average");
    expect(percentileWord(30)).toBe("Below average");
    expect(percentileWord(10)).toBe("Weak");
  });
  it("hits the band edges and handles null", () => {
    expect(percentileWord(80)).toBe("Excellent");
    expect(percentileWord(60)).toBe("Strong");
    expect(percentileWord(40)).toBe("Average");
    expect(percentileWord(20)).toBe("Below average");
    expect(percentileWord(null)).toBe("No data");
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
