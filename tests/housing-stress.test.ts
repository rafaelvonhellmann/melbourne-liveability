import { describe, it, expect } from "vitest";
import { summariseHousingStress } from "../lib/housing-stress";

const opts = { sourceId: "abs-census-community-2021", period: "2021" };

describe("summariseHousingStress", () => {
  it("passes ABS percentages through, rounded to one decimal", () => {
    const r = summariseHousingStress({ rentStress: 42.5, mortgageStress: 21 }, opts);
    expect(r.rentStressPct).toBe(42.5);
    expect(r.mortgageStressPct).toBe(21);
    expect(r.sourceId).toBe("abs-census-community-2021");
    expect(r.period).toBe("2021");
  });

  it("rounds to one decimal place", () => {
    const r = summariseHousingStress({ rentStress: 28.64, mortgageStress: 15.55 }, opts);
    expect(r.rentStressPct).toBe(28.6);
    expect(r.mortgageStressPct).toBe(15.6);
  });

  it("nulls non-finite / missing values rather than inventing zero", () => {
    const r = summariseHousingStress({ rentStress: null, mortgageStress: NaN }, opts);
    expect(r.rentStressPct).toBeNull();
    expect(r.mortgageStressPct).toBeNull();
  });

  it("clamps out-of-range noise into 0-100", () => {
    const r = summariseHousingStress({ rentStress: 120, mortgageStress: -5 }, opts);
    expect(r.rentStressPct).toBe(100);
    expect(r.mortgageStressPct).toBe(0);
  });
});
