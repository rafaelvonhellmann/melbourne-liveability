import { describe, it, expect } from "vitest";
import { roundOverlayPct, heritageCoverageBand } from "../lib/planning-overlays";

describe("roundOverlayPct", () => {
  it("rounds to one decimal and clamps to 0-100", () => {
    expect(roundOverlayPct(12.34)).toBe(12.3);
    expect(roundOverlayPct(120)).toBe(100);
    expect(roundOverlayPct(-3)).toBe(0);
  });
  it("nulls non-finite / missing", () => {
    expect(roundOverlayPct(null)).toBeNull();
    expect(roundOverlayPct(NaN)).toBeNull();
  });
});

describe("heritageCoverageBand", () => {
  it("bands coverage conservatively", () => {
    expect(heritageCoverageBand(null)).toBe("unknown");
    expect(heritageCoverageBand(0)).toBe("minimal");
    expect(heritageCoverageBand(0.9)).toBe("minimal");
    expect(heritageCoverageBand(1)).toBe("partial");
    expect(heritageCoverageBand(24.9)).toBe("partial");
    expect(heritageCoverageBand(25)).toBe("extensive");
    expect(heritageCoverageBand(80)).toBe("extensive");
  });
});
