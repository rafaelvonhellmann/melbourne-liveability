import { describe, it, expect } from "vitest";
import {
  validateSourceManifest,
  extractReferencedSourceIds,
  danglingReferences,
  type SourceRecord,
} from "../scripts/lib/source-verify";

describe("validateSourceManifest", () => {
  it("passes a well-formed source", () => {
    const ok: SourceRecord[] = [
      { id: "a", name: "Source A", url: "https://x.gov.au", licence: "CC BY 4.0", period: "2021", sha256: "abc" },
    ];
    expect(validateSourceManifest(ok)).toEqual([]);
  });
  it("flags missing name/url and a non-http url as errors", () => {
    const bad: SourceRecord[] = [
      { id: "a", licence: "x", period: "y", sha256: "h" },
      { id: "b", name: "B", url: "ftp://x", licence: "x", period: "y", sha256: "h" },
    ];
    const errs = validateSourceManifest(bad)
      .filter((i) => i.severity === "error")
      .map((i) => i.message);
    expect(errs.some((m) => /missing name/.test(m))).toBe(true);
    expect(errs.some((m) => /missing url/.test(m))).toBe(true);
    expect(errs.some((m) => /not http/.test(m))).toBe(true);
  });
  it("flags duplicate ids", () => {
    const dup: SourceRecord[] = [
      { id: "a", name: "A", url: "https://x", licence: "l", period: "p", sha256: "h" },
      { id: "a", name: "A2", url: "https://y", licence: "l", period: "p", sha256: "h" },
    ];
    expect(
      validateSourceManifest(dup).some((i) => i.severity === "error" && /duplicate/.test(i.message))
    ).toBe(true);
  });
  it("exempts derived sources from url/sha256 requirements", () => {
    const derived: SourceRecord[] = [
      { id: "ratio", name: "Derived ratio", licence: "CC BY 4.0", period: "2021", derived: true, sha256: "" },
    ];
    expect(validateSourceManifest(derived).filter((i) => i.severity === "error")).toEqual([]);
  });
  it("warns on a missing sha256 for a non-derived source", () => {
    const noHash: SourceRecord[] = [
      { id: "a", name: "A", url: "https://x", licence: "l", period: "p" },
    ];
    expect(
      validateSourceManifest(noHash).some((i) => i.severity === "warn" && /sha256/.test(i.message))
    ).toBe(true);
  });
  it("errors when a real baked source has a non-bakeable registry verdict", () => {
    const issues = validateSourceManifest([
      {
        id: "wa-police-suburb-offences",
        name: "WA Police",
        url: "https://www.wa.gov.au/",
        licence: "WA Government Terms of Use",
        period: "rolling",
        sha256: "abc123",
      },
    ]);
    expect(
      issues.some((i) => i.severity === "error" && /non-bakeable licence verdict/.test(i.message))
    ).toBe(true);
  });
});

describe("extractReferencedSourceIds", () => {
  it("pulls ids from getSourcesByIds + getSourceById", () => {
    const code = `
      const a = getSourcesByIds(["osm-amenities", "vic-planning-heritage"]);
      const b = getSourceById("vcsa-recorded-offences");
      const c = getSourcesByIds([ 'ptv-gtfs' ]);
      const d = registryId("vic-anef");
    `;
    expect(extractReferencedSourceIds(code).sort()).toEqual([
      "osm-amenities",
      "ptv-gtfs",
      "vcsa-recorded-offences",
      "vic-anef",
      "vic-planning-heritage",
    ]);
  });
  it("returns nothing when there are no citations", () => {
    expect(extractReferencedSourceIds("const x = 1;")).toEqual([]);
  });
});

describe("danglingReferences", () => {
  it("finds referenced ids missing from the manifest", () => {
    expect(danglingReferences(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
    expect(danglingReferences(["a"], ["a", "b"])).toEqual([]);
  });
});
