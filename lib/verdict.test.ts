import { describe, expect, it } from "vitest";
import { bandFor, domainVerdict } from "./verdict";

describe("bandFor", () => {
  it.each([
    [0, "well-below"],
    [19, "well-below"],
    [20, "below"],
    [39, "below"],
    [40, "average"],
    [59, "average"],
    [60, "above"],
    [79, "above"],
    [80, "excellent"],
    [100, "excellent"],
  ] as const)("maps %s to %s", (pct, id) => {
    expect(bandFor(pct)?.id).toBe(id);
  });

  it("returns null for null", () => {
    expect(bandFor(null)).toBeNull();
  });
});

describe("domainVerdict", () => {
  it.each([
    [0, "well-below", "Safer than 0% of Greater Melbourne"],
    [19, "well-below", "Safer than 19% of Greater Melbourne"],
    [20, "below", "Safer than 20% of Greater Melbourne"],
    [39, "below", "Safer than 39% of Greater Melbourne"],
    [40, "average", "Around the Greater Melbourne average for safety"],
    [59, "average", "Around the Greater Melbourne average for safety"],
    [60, "above", "Safer than 60% of Greater Melbourne"],
    [79, "above", "Safer than 79% of Greater Melbourne"],
    [80, "excellent", "Safer than 80% of Greater Melbourne"],
    [100, "excellent", "Safer than 100% of Greater Melbourne"],
  ] as const)("maps safety %s to %s with a headline", (pct, id, headline) => {
    const verdict = domainVerdict("safety", pct, "Greater Melbourne");
    expect(verdict?.band.id).toBe(id);
    expect(verdict?.headline).toBe(headline);
  });

  it("uses domain-specific direction words", () => {
    expect(domainVerdict("affordability", 82, "Greater Melbourne")?.headline).toBe(
      "Lower rent burden than 82% of Greater Melbourne"
    );
    expect(domainVerdict("hazards", 18, "Greater Melbourne")?.headline).toBe(
      "Lower bushfire & flood exposure than 18% of Greater Melbourne"
    );
  });

  it("returns null for null", () => {
    expect(domainVerdict("health", null, "Greater Melbourne")).toBeNull();
  });
});
