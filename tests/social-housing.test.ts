import { describe, it, expect } from "vitest";
import { computeSocialHousing } from "../lib/social-housing";

const opts = { sourceId: "abs-census-community-2021", period: "2021" };

describe("computeSocialHousing", () => {
  it("sums public + community housing as a share of total dwellings", () => {
    const r = computeSocialHousing(
      { stateAuthority: 80, communityProvider: 20, totalDwellings: 1000 },
      opts
    );
    expect(r.statePct).toBe(8);
    expect(r.communityPct).toBe(2);
    expect(r.socialPct).toBe(10);
    expect(r.dwellings).toBe(100);
    expect(r.totalDwellings).toBe(1000);
    expect(r.sourceId).toBe("abs-census-community-2021");
  });

  it("rounds to one decimal place", () => {
    const r = computeSocialHousing(
      { stateAuthority: 7, communityProvider: 0, totalDwellings: 900 },
      opts
    );
    expect(r.statePct).toBe(0.8); // 7/900 = 0.777..
    expect(r.socialPct).toBe(0.8);
  });

  it("keeps a genuine zero (no social housing recorded) distinct from missing", () => {
    const r = computeSocialHousing(
      { stateAuthority: 0, communityProvider: 0, totalDwellings: 500 },
      opts
    );
    expect(r.socialPct).toBe(0);
    expect(r.dwellings).toBe(0);
  });

  it("returns null percentages when the total is zero or missing (never divides by zero)", () => {
    const zero = computeSocialHousing(
      { stateAuthority: 5, communityProvider: 5, totalDwellings: 0 },
      opts
    );
    expect(zero.socialPct).toBeNull();
    expect(zero.dwellings).toBe(10); // count still known
    expect(zero.totalDwellings).toBeNull();

    const noTotal = computeSocialHousing(
      { stateAuthority: 5, communityProvider: 5, totalDwellings: null },
      opts
    );
    expect(noTotal.socialPct).toBeNull();
  });

  it("treats absent counts as null, not zero", () => {
    const r = computeSocialHousing(
      { stateAuthority: null, communityProvider: null, totalDwellings: 1000 },
      opts
    );
    expect(r.dwellings).toBeNull();
    expect(r.socialPct).toBeNull();
    expect(r.statePct).toBeNull();
  });

  it("clamps negative noise to zero", () => {
    const r = computeSocialHousing(
      { stateAuthority: -3, communityProvider: 10, totalDwellings: 1000 },
      opts
    );
    expect(r.statePct).toBe(0);
    expect(r.communityPct).toBe(1);
    expect(r.dwellings).toBe(10);
  });
});
