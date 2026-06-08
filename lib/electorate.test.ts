import { describe, it, expect } from "vitest";
import { titleCase, partyLabel } from "./electorate";

describe("electorate helpers", () => {
  it("title-cases ALL-CAPS Vicmap names", () => {
    expect(titleCase("NORTHERN METROPOLITAN")).toBe("Northern Metropolitan");
    expect(titleCase("MELBOURNE")).toBe("Melbourne");
  });

  it("maps party abbreviations to readable names, falling back to the abbreviation", () => {
    expect(partyLabel("ALP")).toBe("Labor");
    expect(partyLabel("LP")).toBe("Liberal");
    expect(partyLabel("GRN")).toBe("Greens");
    expect(partyLabel("IND")).toBe("Independent");
    expect(partyLabel("XYZ")).toBe("XYZ");
    expect(partyLabel(undefined)).toBe("");
  });
});
