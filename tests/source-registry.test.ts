import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertBakeable,
  REGISTRY_BY_ID,
} from "../scripts/lib/source-registry";
import {
  buildMelbourneManifestFromRegistry,
  serializeManifest,
  type ManifestSource,
} from "../scripts/lib/region-sources";
import { SOURCE_FILES } from "../scripts/lib/source-files";

const SOURCES_PATH = path.join(process.cwd(), "data/generated/sources.json");

function stampedMelbourneManifest(committed: ManifestSource[]): ManifestSource[] {
  const committedById = new Map(committed.map((source) => [source.id, source]));
  return buildMelbourneManifestFromRegistry().map((source) => {
    const existing = committedById.get(source.id);
    return {
      ...source,
      ...(existing?.fetchedAt !== undefined ? { fetchedAt: existing.fetchedAt } : {}),
      ...(existing?.sha256 !== undefined ? { sha256: existing.sha256 } : {}),
    };
  });
}

describe("source registry", () => {
  it("rebuilds the Melbourne manifest byte-for-byte through the canonical serializer", () => {
    const committedText = readFileSync(SOURCES_PATH, "utf8");
    const committed = JSON.parse(committedText) as ManifestSource[];
    const generated = stampedMelbourneManifest(committed);

    expect(serializeManifest(generated)).toBe(committedText);
    expect(JSON.parse(serializeManifest(generated))).toEqual(committed);
  });

  it("guards raw baking by registry licence verdict", () => {
    expect(() => assertBakeable("abs-seifa-2021")).not.toThrow();
    expect(() => assertBakeable("bom-solar-climatology")).toThrow(/not bakeable/i);
    expect(() => assertBakeable("unknown-source-id")).toThrow(/unknown source id/i);
  });

  it("keeps WA DWER as a known non-bakeable registry-only source", () => {
    const id = "wa-dwer-fpm-100aep-floodway-fringe";
    const source = REGISTRY_BY_ID.get(id);
    const committed = JSON.parse(readFileSync(SOURCES_PATH, "utf8")) as ManifestSource[];

    expect(source?.licenceVerdict).toBe("non-commercial-or-restricted");
    expect(SOURCE_FILES[id]).toBeUndefined();
    expect(committed.some((entry) => entry.id === id)).toBe(false);
  });
});
