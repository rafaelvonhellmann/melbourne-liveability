import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import {
  countPopulatedFields,
  diffCoverage,
  PLACES_FIELD,
} from "../scripts/lib/coverage-diff";
import { classifyCarried } from "../scripts/lib/context-merge";
import { existsInHead } from "../scripts/verify-coverage-diff";

/** total places, the first `volunteerOn` of which carry volunteerPct. */
function placesWith(volunteerOn: number, total = 100) {
  return Array.from({ length: total }, (_, i) => ({
    sa2Code: String(i),
    context: {
      community: {
        renterPct: 30,
        ...(i < volunteerOn ? { volunteerPct: 20.5 } : {}),
      },
    },
  }));
}

describe("countPopulatedFields", () => {
  it("counts nested populated fields by dot-path plus total places", () => {
    const counts = countPopulatedFields(placesWith(75));
    expect(counts[PLACES_FIELD]).toBe(100);
    expect(counts["context.community.renterPct"]).toBe(100);
    expect(counts["context.community.volunteerPct"]).toBe(75);
  });

  it("ignores null/undefined and empty arrays, keeps falsy scalars", () => {
    const counts = countPopulatedFields([
      { a: null, b: undefined, c: [], d: [1], e: 0, f: false },
    ]);
    expect(counts.a).toBeUndefined();
    expect(counts.b).toBeUndefined();
    expect(counts.c).toBeUndefined();
    expect(counts.d).toBe(1);
    expect(counts.e).toBe(1);
    expect(counts.f).toBe(1);
  });
});

describe("diffCoverage", () => {
  it("passes when nothing changed", () => {
    const diff = diffCoverage(
      countPopulatedFields(placesWith(75)),
      countPopulatedFields(placesWith(75))
    );
    expect(diff.ok).toBe(true);
    expect(diff.rows.every((r) => r.status === "ok")).toBe(true);
  });

  it("fails when a field's populated-count drops beyond the tolerance", () => {
    const diff = diffCoverage(
      countPopulatedFields(placesWith(100)),
      countPopulatedFields(placesWith(90))
    );
    expect(diff.ok).toBe(false);
    expect(
      diff.rows.find((r) => r.field === "context.community.volunteerPct")?.status
    ).toBe("drop");
  });

  it("fails when a field disappears entirely", () => {
    const diff = diffCoverage(
      countPopulatedFields(placesWith(100)),
      countPopulatedFields(placesWith(0))
    );
    expect(diff.ok).toBe(false);
    expect(
      diff.rows.find((r) => r.field === "context.community.volunteerPct")?.status
    ).toBe("gone");
  });

  it("allows drops within the tolerance (2% default)", () => {
    const diff = diffCoverage(
      countPopulatedFields(placesWith(100)),
      countPopulatedFields(placesWith(99))
    );
    expect(diff.ok).toBe(true);
  });

  it("respects a custom tolerance", () => {
    const before = countPopulatedFields(placesWith(100));
    const after = countPopulatedFields(placesWith(95));
    expect(diffCoverage(before, after, 2).ok).toBe(false);
    expect(diffCoverage(before, after, 10).ok).toBe(true);
  });

  it("passes when a brand-new field appears", () => {
    const before = countPopulatedFields(placesWith(100));
    const after = countPopulatedFields(
      placesWith(100).map((p) => ({
        ...p,
        context: { ...p.context, schools: { government: 3 } },
      }))
    );
    const diff = diffCoverage(before, after);
    expect(diff.ok).toBe(true);
    expect(diff.rows.find((r) => r.field === "context.schools")?.status).toBe("new");
  });
});

describe("existsInHead (baseline lookup)", () => {
  it("finds the committed places.json baseline", () => {
    expect(existsInHead("data/generated/places.json")).toBe(true);
  });

  it("treats a path genuinely absent from HEAD as no-baseline (silent pass)", () => {
    expect(existsInHead("data/generated/definitely-not-a-real-file.json")).toBe(false);
  });

  it("rethrows on git failure instead of mistaking it for an absent baseline", () => {
    expect(() =>
      existsInHead(
        "data/generated/places.json",
        path.join(os.tmpdir(), "no-such-dir-coverage-gate")
      )
    ).toThrow();
  });
});

describe("classifyCarried (consecutive-carry gate)", () => {
  it("first-time carry is a warning, not a repeat", () => {
    const { firstCarry, repeatCarry } = classifyCarried({}, { "community.volunteerPct": 500 });
    expect(firstCarry).toEqual(["community.volunteerPct"]);
    expect(repeatCarry).toEqual([]);
  });

  it("a field carried in HEAD and again this run is a repeat (gate fails)", () => {
    const { firstCarry, repeatCarry } = classifyCarried(
      { "community.volunteerPct": 498 },
      { "community.volunteerPct": 500, schools: 3 }
    );
    expect(repeatCarry).toEqual(["community.volunteerPct"]);
    expect(firstCarry).toEqual(["schools"]);
  });

  it("a field carried last refresh but rebuilt fresh now is clean", () => {
    const { firstCarry, repeatCarry } = classifyCarried({ "community.volunteerPct": 498 }, {});
    expect(firstCarry).toEqual([]);
    expect(repeatCarry).toEqual([]);
  });
});
