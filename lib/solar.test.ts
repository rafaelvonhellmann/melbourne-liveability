import { describe, it, expect } from "vitest";
import { estimateAnnualKwh, optimalTiltDeg, MELBOURNE_SOLAR } from "./solar";

describe("solar", () => {
  it("estimates annual generation (~8.9 MWh for a 6.6 kW system)", () => {
    expect(estimateAnnualKwh(6.6)).toBe(8900);
    expect(estimateAnnualKwh(0)).toBe(0);
  });

  it("optimal tilt ~ the site latitude", () => {
    expect(optimalTiltDeg(-37.81)).toBe(38);
    expect(optimalTiltDeg(-37.4)).toBe(37);
  });

  it("carries the Melbourne BoM solar climatology", () => {
    expect(MELBOURNE_SOLAR.peakSunHours).toBeGreaterThan(3);
    expect(MELBOURNE_SOLAR.mjPerDay).toBeGreaterThan(10);
  });
});
