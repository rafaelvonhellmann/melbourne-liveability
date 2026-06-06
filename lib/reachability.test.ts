import { describe, it, expect } from "vitest";
import {
  reachProfile,
  valhallaCosting,
  REACH_MINUTES,
  isReachabilityConfigured,
} from "./reachability";

describe("reachability", () => {
  it("maps each mode to its ORS profile", () => {
    expect(reachProfile("drive")).toBe("driving-car");
    expect(reachProfile("walk")).toBe("foot-walking");
  });

  it("maps each mode to its Valhalla costing", () => {
    expect(valhallaCosting("drive")).toBe("auto");
    expect(valhallaCosting("walk")).toBe("pedestrian");
  });

  it("offers sensible per-mode time budgets (walk tops out lower)", () => {
    expect(REACH_MINUTES.drive).toEqual([15, 30, 45]);
    expect(REACH_MINUTES.walk).toEqual([10, 20, 30]);
    expect(Math.max(...REACH_MINUTES.walk)).toBeLessThan(Math.max(...REACH_MINUTES.drive));
  });

  it("is always available thanks to the keyless Valhalla default", () => {
    // No NEXT_PUBLIC_ORS_API_KEY in the test env, yet the feature is on.
    expect(isReachabilityConfigured()).toBe(true);
  });
});
