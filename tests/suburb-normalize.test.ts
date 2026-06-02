import { describe, it, expect } from "vitest";
import {
  normalizeLgaName,
  suburbLgaKey,
  normalizeSuburbName,
} from "../lib/suburb-normalize";

describe("normalizeLgaName", () => {
  it("lowercases, trims and drops a trailing ' City'", () => {
    expect(normalizeLgaName("Melbourne City")).toBe("melbourne");
    expect(normalizeLgaName("  Yarra  ")).toBe("yarra");
  });

  it("collapses the Moreland -> Merri-bek council rename to one key", () => {
    // ABS boundaries still say Moreland; VCSA crime uses the post-2022 name.
    // Both must resolve to the same key or the join silently drops the council.
    expect(normalizeLgaName("Moreland")).toBe(normalizeLgaName("Merri-bek"));
    expect(normalizeLgaName("Merri-bek")).toBe("moreland");
    expect(normalizeLgaName("Merribek")).toBe("moreland");
  });

  it("leaves other councils untouched", () => {
    expect(normalizeLgaName("Banyule")).toBe("banyule");
    expect(normalizeLgaName("Greater Dandenong")).toBe("greater dandenong");
  });
});

describe("suburbLgaKey", () => {
  it("matches a suburb across the Moreland/Merri-bek rename", () => {
    // The crime suburb table keys by the new LGA name; our crosswalk by the old.
    expect(suburbLgaKey("Brunswick East", "Moreland")).toBe(
      suburbLgaKey("Brunswick East", "Merri-bek")
    );
  });

  it("normalizes the suburb half (parens / case / spacing)", () => {
    expect(normalizeSuburbName("Brunswick East (Vic.)")).toBe("brunswick east");
    expect(suburbLgaKey("BRUNSWICK  EAST", "Moreland")).toBe(
      "brunswick east|moreland"
    );
  });
});
