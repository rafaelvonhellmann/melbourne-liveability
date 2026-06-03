import { describe, it, expect } from "vitest";
import {
  roundOverlayPct,
  heritageCoverageBand,
  CONSERVATION_OVERLAY_META,
  CONSERVATION_OVERLAY_CODES,
  presentOverlays,
} from "../lib/planning-overlays";

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

describe("CONSERVATION_OVERLAY_META", () => {
  it("has complete metadata for every overlay code", () => {
    for (const code of CONSERVATION_OVERLAY_CODES) {
      const meta = CONSERVATION_OVERLAY_META[code];
      expect(meta).toBeTruthy();
      expect(meta.code).toBe(code);
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.buyerMeaning.length).toBeGreaterThan(0);
      expect(["high", "medium"]).toContain(meta.materiality);
    }
  });
  it("marks PAO and EAO as high materiality (the ones not to miss)", () => {
    expect(CONSERVATION_OVERLAY_META.PAO.materiality).toBe("high");
    expect(CONSERVATION_OVERLAY_META.EAO.materiality).toBe("high");
  });
});

describe("presentOverlays", () => {
  it("returns nothing for null/empty shares", () => {
    expect(presentOverlays(null)).toEqual([]);
    expect(presentOverlays(undefined)).toEqual([]);
    expect(presentOverlays({})).toEqual([]);
  });
  it("applies the 1% floor (parity with heritage)", () => {
    expect(presentOverlays({ VPO: 0.4 })).toEqual([]);
    expect(presentOverlays({ VPO: 1 }).map((o) => o.code)).toEqual(["VPO"]);
  });
  it("orders high-materiality overlays first, then by larger share", () => {
    const out = presentOverlays({ VPO: 40, ESO: 5, PAO: 2, EAO: 10 });
    expect(out.map((o) => o.code)).toEqual(["EAO", "PAO", "VPO", "ESO"]);
  });
  it("respects a custom minPct", () => {
    expect(presentOverlays({ ESO: 3 }, 5)).toEqual([]);
    expect(presentOverlays({ ESO: 6 }, 5).map((o) => o.code)).toEqual(["ESO"]);
  });
});
