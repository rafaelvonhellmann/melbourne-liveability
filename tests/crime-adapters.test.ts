import { describe, it, expect } from "vitest";
import { crimeAdapterFor } from "../scripts/lib/crime-adapters";
import { getRegion, REGION_IDS } from "../lib/regions";

/**
 * Registry pins for the per-state crime adapters (Wave 2 item 1). The VIC
 * mapping is load-bearing for the Melbourne regression: its sourceId must stay
 * "vcsa-recorded-offences" or every baked safety indicator changes provenance.
 */
describe("crimeAdapterFor registry", () => {
  it("melbourne (VIC) gets the VCSA adapter, suburb-level", () => {
    const a = crimeAdapterFor(getRegion("melbourne"));
    expect(a).not.toBeNull();
    expect(a!.sourceId).toBe("vcsa-recorded-offences");
    expect(a!.geographyLevel).toBe("suburb");
    expect(typeof a!.fetch).toBe("function");
    expect(typeof a!.normalize).toBe("function");
  });

  it("canberra (ACT) gets the ACT Policing adapter, suburb-level", () => {
    const a = crimeAdapterFor(getRegion("canberra"));
    expect(a).not.toBeNull();
    expect(a!.sourceId).toBe("act-policing-crime-statistics");
    expect(a!.geographyLevel).toBe("suburb");
  });

  it("brisbane (QLD) gets the QPS LGA-rates adapter, lga-level", () => {
    const a = crimeAdapterFor(getRegion("brisbane"));
    expect(a).not.toBeNull();
    expect(a!.sourceId).toBe("qps-lga-offence-rates");
    expect(a!.geographyLevel).toBe("lga");
    expect(typeof a!.fetch).toBe("function");
    expect(typeof a!.normalize).toBe("function");
  });

  it("sydney (NSW) gets the BOCSAR adapter, suburb-level", () => {
    const a = crimeAdapterFor(getRegion("sydney"));
    expect(a).not.toBeNull();
    expect(a!.sourceId).toBe("bocsar-suburb-offences");
    expect(a!.geographyLevel).toBe("suburb");
    expect(typeof a!.fetch).toBe("function");
    expect(typeof a!.normalize).toBe("function");
  });

  it("perth (WA) gets the WA Police adapter, suburb-level", () => {
    const a = crimeAdapterFor(getRegion("perth"));
    expect(a).not.toBeNull();
    expect(a!.sourceId).toBe("wa-police-suburb-offences");
    expect(a!.geographyLevel).toBe("suburb");
    expect(typeof a!.fetch).toBe("function");
    expect(typeof a!.normalize).toBe("function");
  });

  it("adelaide (SA) gets the SAPOL adapter, suburb-level", () => {
    const a = crimeAdapterFor(getRegion("adelaide"));
    expect(a).not.toBeNull();
    expect(a!.sourceId).toBe("sapol-suburb-offences");
    expect(a!.geographyLevel).toBe("suburb");
    expect(typeof a!.fetch).toBe("function");
    expect(typeof a!.normalize).toBe("function");
  });

  it("states without an adapter resolve to null (safety unscored)", () => {
    for (const id of ["hobart", "darwin"] as const) {
      expect(crimeAdapterFor(getRegion(id))).toBeNull();
    }
  });

  it("every region resolves without throwing", () => {
    for (const id of REGION_IDS) {
      expect(() => crimeAdapterFor(getRegion(id))).not.toThrow();
    }
  });
});
