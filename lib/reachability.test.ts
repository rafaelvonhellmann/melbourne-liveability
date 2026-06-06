import { describe, it, expect } from "vitest";
import {
  reachProfile,
  REACH_MINUTES,
  isReachabilityConfigured,
  fetchReachabilityIsochrone,
} from "./reachability";

describe("reachability", () => {
  it("maps each mode to its ORS profile", () => {
    expect(reachProfile("drive")).toBe("driving-car");
    expect(reachProfile("walk")).toBe("foot-walking");
  });

  it("offers sensible per-mode time budgets (walk tops out lower)", () => {
    expect(REACH_MINUTES.drive).toEqual([15, 30, 45]);
    expect(REACH_MINUTES.walk).toEqual([10, 20, 30]);
    expect(Math.max(...REACH_MINUTES.walk)).toBeLessThan(Math.max(...REACH_MINUTES.drive));
  });

  it("is gated off and returns not-configured without an API key", async () => {
    // No NEXT_PUBLIC_ORS_API_KEY in the test env.
    expect(isReachabilityConfigured()).toBe(false);
    const r = await fetchReachabilityIsochrone([144.96, -37.81], "drive", 30);
    expect(r).toEqual({ ok: false, reason: "not-configured" });
  });
});
