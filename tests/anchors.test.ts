import { describe, it, expect } from "vitest";
import {
  anchorDistances,
  distanceBand,
  bandLabel,
  anchorKindLabel,
  type BuyerAnchor,
  type DistanceBand,
} from "../lib/anchors";

const PIN: [number, number] = [144.9631, -37.8136]; // [lng, lat], Melbourne CBD

function anchor(partial: Partial<BuyerAnchor> & { lng: number; lat: number }): BuyerAnchor {
  return { id: "a", kind: "work", label: "Place", ...partial };
}

describe("distanceBand", () => {
  it("bands straight-line km conservatively", () => {
    expect(distanceBand(0.5)).toBe("very-close");
    expect(distanceBand(1.99)).toBe("very-close");
    expect(distanceBand(2)).toBe("close");
    expect(distanceBand(4.9)).toBe("close");
    expect(distanceBand(5)).toBe("moderate");
    expect(distanceBand(14.9)).toBe("moderate");
    expect(distanceBand(15)).toBe("far");
    expect(distanceBand(40)).toBe("far");
  });
  it("has a non-empty label for every band", () => {
    for (const b of ["very-close", "close", "moderate", "far"] as DistanceBand[]) {
      expect(bandLabel(b).length).toBeGreaterThan(0);
    }
  });
});

describe("anchorDistances", () => {
  it("returns empty for no anchors", () => {
    expect(anchorDistances(PIN, [])).toEqual([]);
    expect(anchorDistances(PIN, null)).toEqual([]);
    expect(anchorDistances(PIN, undefined)).toEqual([]);
  });
  it("computes, rounds to 1 dp, and sorts nearest-first", () => {
    const near = anchor({ id: "n", lng: 144.9631, lat: -37.8136, label: "Same spot" });
    const far = anchor({ id: "f", lng: 145.12, lat: -37.9, label: "South-east" });
    const out = anchorDistances(PIN, [far, near]);
    expect(out.map((d) => d.anchor.id)).toEqual(["n", "f"]); // nearest first
    expect(out[0].km).toBeLessThan(out[1].km);
    expect(out[0].km).toBe(Math.round(out[0].km * 10) / 10); // 1 dp
    expect(out[0].band).toBe("very-close");
    expect(out[1].band).toBe("far");
  });
  it("drops anchors with non-finite coordinates (never fabricates)", () => {
    const bad = anchor({ id: "bad", lng: NaN, lat: -37.8, label: "broken" });
    const ok = anchor({ id: "ok", lng: 144.97, lat: -37.81, label: "ok" });
    const out = anchorDistances(PIN, [bad, ok]);
    expect(out.map((d) => d.anchor.id)).toEqual(["ok"]);
  });
});

describe("anchorKindLabel", () => {
  it("labels each anchor kind", () => {
    expect(anchorKindLabel("work")).toBe("Work");
    expect(anchorKindLabel("school")).toMatch(/School/);
    expect(anchorKindLabel("family")).toMatch(/Family/);
    expect(anchorKindLabel("other")).toMatch(/Other/);
  });
});
