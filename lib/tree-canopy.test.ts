import { describe, it, expect } from "vitest";
import { parseTreeCanopy } from "./tree-canopy";

describe("parseTreeCanopy", () => {
  it("extracts canopy % + SA2 name + band from an ArcGIS point query", () => {
    const r = parseTreeCanopy({
      features: [{ attributes: { PERANYTREE: 22.47, SA2_NAME16: "Brunswick" } }],
    });
    expect(r).toEqual({ canopyPct: 22.5, band: "leafy", sa2Name: "Brunswick" });
  });

  it("bands canopy cover (sparse / moderate / leafy / very leafy)", () => {
    expect(parseTreeCanopy({ features: [{ attributes: { PERANYTREE: 0.28 } }] })?.band).toBe("sparse");
    expect(parseTreeCanopy({ features: [{ attributes: { PERANYTREE: 12 } }] })?.band).toBe("moderate");
    expect(parseTreeCanopy({ features: [{ attributes: { PERANYTREE: 25 } }] })?.band).toBe("leafy");
    expect(parseTreeCanopy({ features: [{ attributes: { PERANYTREE: 40 } }] })?.band).toBe("very leafy");
  });

  it("returns null for missing / empty / non-numeric shapes", () => {
    expect(parseTreeCanopy({})).toBeNull();
    expect(parseTreeCanopy({ features: [] })).toBeNull();
    expect(parseTreeCanopy({ features: [{ attributes: { PERANYTREE: "n/a" } }] })).toBeNull();
  });
});
