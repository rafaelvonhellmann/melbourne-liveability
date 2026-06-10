import { describe, it, expect } from "vitest";
import { carryForwardContext, type PlaceLike } from "../scripts/lib/context-merge";

function prevPlace(): PlaceLike {
  return {
    sa2Code: "206041122",
    context: {
      community: { renterPct: 31, volunteerPct: 18.2, sourceId: "abs-census-community-2021" },
      schools: { government: 4, catholic: 1, independent: 0 },
      projections: null,
    },
  };
}

describe("carryForwardContext", () => {
  it("carries a sub-field (volunteerPct) into a rebuilt parent that lost it", () => {
    const rebuilt: PlaceLike[] = [
      {
        sa2Code: "206041122",
        context: { community: { renterPct: 32, sourceId: "abs-census-community-2021" } },
      },
    ];
    const carried = carryForwardContext([prevPlace()], rebuilt);
    expect((rebuilt[0].context!.community as Record<string, unknown>).volunteerPct).toBe(18.2);
    expect(carried["community.volunteerPct"]).toBe(1);
  });

  it("never overwrites freshly computed values", () => {
    const rebuilt: PlaceLike[] = [
      {
        sa2Code: "206041122",
        context: { community: { renterPct: 32, volunteerPct: 19.9 } },
      },
    ];
    carryForwardContext([prevPlace()], rebuilt);
    expect((rebuilt[0].context!.community as Record<string, unknown>).volunteerPct).toBe(19.9);
    expect((rebuilt[0].context!.community as Record<string, unknown>).renterPct).toBe(32);
  });

  it("carries whole missing top-level fields, skipping null prev values", () => {
    const rebuilt: PlaceLike[] = [{ sa2Code: "206041122", context: {} }];
    const carried = carryForwardContext([prevPlace()], rebuilt);
    expect(rebuilt[0].context!.schools).toEqual({ government: 4, catholic: 1, independent: 0 });
    expect("projections" in rebuilt[0].context!).toBe(false);
    expect(carried.schools).toBe(1);
    expect(carried.community).toBe(1);
  });

  it("respects retired keys at both levels", () => {
    const rebuilt: PlaceLike[] = [
      { sa2Code: "206041122", context: { community: { renterPct: 32 } } },
    ];
    carryForwardContext([prevPlace()], rebuilt, ["schools", "community.volunteerPct"]);
    expect(rebuilt[0].context!.schools).toBeUndefined();
    expect(
      (rebuilt[0].context!.community as Record<string, unknown>).volunteerPct
    ).toBeUndefined();
  });

  it("leaves places without a previous match untouched", () => {
    const rebuilt: PlaceLike[] = [{ sa2Code: "999999999", context: { community: { renterPct: 1 } } }];
    const carried = carryForwardContext([prevPlace()], rebuilt);
    expect(Object.keys(carried)).toHaveLength(0);
    expect(rebuilt[0].context).toEqual({ community: { renterPct: 1 } });
  });
});
