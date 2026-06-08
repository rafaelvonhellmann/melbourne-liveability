import { describe, it, expect } from "vitest";
import { parseUrbanHeat } from "./urban-heat";

describe("parseUrbanHeat", () => {
  it("extracts uplift + SA2 name + band from an ArcGIS point query", () => {
    const r = parseUrbanHeat({
      features: [{ attributes: { UHI18_M: 9.8123, SA2_NAME16: "Melbourne" } }],
    });
    expect(r).toEqual({ uhiC: 9.8, band: "hot", sa2Name: "Melbourne" });
  });

  it("bands the uplift (cooler / moderate / hot / very hot)", () => {
    expect(parseUrbanHeat({ features: [{ attributes: { UHI18_M: 2 } }] })?.band).toBe("cooler");
    expect(parseUrbanHeat({ features: [{ attributes: { UHI18_M: 5.5 } }] })?.band).toBe("moderate");
    expect(parseUrbanHeat({ features: [{ attributes: { UHI18_M: 8 } }] })?.band).toBe("hot");
    expect(parseUrbanHeat({ features: [{ attributes: { UHI18_M: 11 } }] })?.band).toBe("very hot");
  });

  it("returns null for missing / empty / non-numeric shapes", () => {
    expect(parseUrbanHeat({})).toBeNull();
    expect(parseUrbanHeat({ features: [] })).toBeNull();
    expect(parseUrbanHeat({ features: [{ attributes: { UHI18_M: "n/a" } }] })).toBeNull();
  });
});
