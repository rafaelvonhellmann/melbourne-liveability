import { describe, it, expect } from "vitest";
import { populationContext } from "../lib/population";

const opts = { sourceId: "abs-erp-sa2", period: "2023" };

describe("populationContext", () => {
  it("computes integer density from count / area", () => {
    const r = populationContext(15000, 2.17, opts);
    expect(r.count).toBe(15000);
    expect(r.areaKm2).toBe(2.17);
    expect(r.densityPerKm2).toBe(Math.round(15000 / 2.17)); // 6912
    expect(r.sourceId).toBe("abs-erp-sa2");
  });

  it("rounds area to 2dp and density to a whole number", () => {
    const r = populationContext(1000, 3.14159, opts);
    expect(r.areaKm2).toBe(3.14);
    expect(r.densityPerKm2).toBe(Math.round(1000 / 3.14159));
  });

  it("returns null density when area is zero or missing (no divide-by-zero)", () => {
    expect(populationContext(1000, 0, opts).densityPerKm2).toBeNull();
    expect(populationContext(1000, null, opts).densityPerKm2).toBeNull();
    expect(populationContext(1000, 0, opts).areaKm2).toBeNull();
  });

  it("returns null count for missing/negative population", () => {
    expect(populationContext(null, 5, opts).count).toBeNull();
    expect(populationContext(-3, 5, opts).count).toBeNull();
    expect(populationContext(null, 5, opts).densityPerKm2).toBeNull();
  });
});
