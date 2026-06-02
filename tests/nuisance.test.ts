import { describe, it, expect } from "vitest";
import {
  nearestNuisances,
  nuisanceFlags,
  nuisanceKindLabel,
  NUISANCE_THRESHOLDS_M,
  type NuisancePoint,
} from "../lib/nuisance";

const PIN: [number, number] = [144.97, -37.8];
const near = (kind: NuisancePoint["kind"], dLng = 0, dLat = 0): NuisancePoint => ({
  kind,
  coord: [144.97 + dLng, -37.8 + dLat],
});

describe("nearestNuisances", () => {
  it("measures ~0 m for a coincident point and keeps each kind independent", () => {
    const d = nearestNuisances(PIN, [near("industrial"), near("waste", 0.02)]);
    expect(d.industrial).toBeLessThanOrEqual(2);
    expect(d.waste).toBeGreaterThan(1500); // ~0.02 deg lng east
    expect(d.sewage).toBeNull();
    expect(d.quarry).toBeNull();
  });

  it("keeps the nearest of several same-kind points", () => {
    const d = nearestNuisances(PIN, [
      near("industrial", 0.01),
      near("industrial", 0.001),
    ]);
    expect(d.industrial).toBeLessThan(150); // the ~0.001 deg one
  });
});

describe("nuisanceFlags", () => {
  it("flags only kinds within their (kind-specific) threshold, closest first", () => {
    const flags = nuisanceFlags({ industrial: 250, waste: 900, sewage: 900, quarry: 5000 });
    // industrial 250<=300 yes; waste 900<=1000 yes; sewage 900<=800 NO; quarry no
    expect(flags.map((f) => f.kind)).toEqual(["industrial", "waste"]);
  });

  it("treats null as absent and honours the threshold constants", () => {
    expect(nuisanceFlags({ industrial: null, waste: null, sewage: null, quarry: null })).toEqual([]);
    expect(NUISANCE_THRESHOLDS_M.waste).toBe(1000);
  });
});

describe("nuisanceKindLabel", () => {
  it("gives plain-English labels", () => {
    expect(nuisanceKindLabel("waste")).toBe("waste / landfill site");
    expect(nuisanceKindLabel("sewage")).toBe("sewage / wastewater works");
  });
});
