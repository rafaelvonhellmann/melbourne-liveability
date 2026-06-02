import { describe, it, expect } from "vitest";
import { evaluateFit, type BuyerProfile } from "../lib/buyer-fit";

const base: BuyerProfile = { mode: "buyer" };

describe("evaluateFit — deal-breakers", () => {
  it("flags a set deal-breaker only when the data is material", () => {
    const profile: BuyerProfile = { ...base, dealBreakers: ["flood"] };
    expect(evaluateFit(profile, { floodPct: 18 }).hits.map((h) => h.id)).toEqual(["flood"]);
    // present but below threshold -> not flagged
    expect(evaluateFit(profile, { floodPct: 3 }).hits).toHaveLength(0);
    // unknown data -> never flagged (no false pass/fail)
    expect(evaluateFit(profile, { floodPct: null }).hits).toHaveLength(0);
  });

  it("only flags deal-breakers the user actually set", () => {
    const r = evaluateFit({ ...base, dealBreakers: ["bushfire"] }, {
      floodPct: 50,
      bushfirePct: 40,
    });
    expect(r.hits.map((h) => h.id)).toEqual(["bushfire"]);
  });

  it("uses the heritage threshold and the noise flag", () => {
    const heritage = evaluateFit({ ...base, dealBreakers: ["heritage"] }, { heritagePct: 30 });
    expect(heritage.hits.map((h) => h.id)).toEqual(["heritage"]);
    expect(evaluateFit({ ...base, dealBreakers: ["heritage"] }, { heritagePct: 10 }).hits).toHaveLength(0);

    const noise = evaluateFit({ ...base, dealBreakers: ["noise"] }, { hasNoiseFlag: true });
    expect(noise.hits.map((h) => h.id)).toEqual(["noise"]);
    expect(evaluateFit({ ...base, dealBreakers: ["noise"] }, { hasNoiseFlag: false }).hits).toHaveLength(0);
  });

  it("flags weak transport only below the threshold", () => {
    const p: BuyerProfile = { ...base, dealBreakers: ["poor_transport"] };
    expect(evaluateFit(p, { transportPct: 20 }).hits).toHaveLength(1);
    expect(evaluateFit(p, { transportPct: 60 }).hits).toHaveLength(0);
  });

  it("every deal-breaker hit carries a label + detail", () => {
    const r = evaluateFit({ ...base, dealBreakers: ["flood", "noise"] }, {
      floodPct: 20,
      hasNoiseFlag: true,
    });
    expect(r.hits).toHaveLength(2);
    for (const h of r.hits) {
      expect(h.label.length).toBeGreaterThan(0);
      expect(h.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("evaluateFit — fit notes", () => {
  it("adds a transport note when the user cares about transport", () => {
    const r = evaluateFit({ ...base, transport: "high" }, { transportPct: 75 });
    expect(r.notes.join(" ")).toMatch(/transport/i);
  });

  it("warns a no-car user about weak transport", () => {
    const r = evaluateFit({ ...base, car: "no_car" }, { transportPct: 15 });
    expect(r.notes.join(" ")).toMatch(/don't drive|walk to stops/i);
  });

  it("returns empty for a null profile", () => {
    expect(evaluateFit(null, { floodPct: 90 })).toEqual({ hits: [], notes: [] });
  });
});
