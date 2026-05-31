import Fuse from "fuse.js";
import type { Place } from "./types";

/** Whether a hit matched our data-area (SA2) name or a geographic suburb alias. */
export type SearchEntryKind = "area" | "alias";

export type SearchIndexEntry = {
  key: string;
  sa2Code: string;
  slug: string;
  /** The matched term — either the SA2 name or a geographic suburb alias. */
  label: string;
  /** Back-compat alias of `label` (kept so existing Fuse keys still resolve). */
  suburb: string;
  /** Did this term come from our data-area name, or a suburb/locality alias? */
  kind: SearchEntryKind;
  /** Canonical data-area (SA2) name this term resolves to. */
  areaName: string;
  /** Normalised label (lower-cased, punctuation/qualifier-stripped) for tolerant matching. */
  normalized: string;
};

/**
 * Normalise a place/suburb term so suburb searches match tolerantly:
 * lower-case, drop state qualifiers like "(Vic.)", collapse punctuation and
 * whitespace. e.g. "Brunswick (Vic.)" → "brunswick", "Coburg - East" → "coburg east".
 */
export function normalizeSearchTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // drop "(Vic.)" etc.
    .replace(/[^a-z0-9]+/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchIndex(places: Place[]): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [];
  for (const p of places) {
    const areaNorm = normalizeSearchTerm(p.name);
    entries.push({
      key: `${p.slug}-main`,
      sa2Code: p.sa2Code,
      slug: p.slug,
      label: p.name,
      suburb: p.name,
      kind: "area",
      areaName: p.name,
      normalized: areaNorm,
    });
    const seen = new Set<string>([areaNorm]);
    for (const alias of p.suburbAliases) {
      const norm = normalizeSearchTerm(alias);
      // Skip aliases that are empty or identical (normalised) to the area name
      // or an already-added alias — avoids duplicate/redundant rows.
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      entries.push({
        key: `${p.slug}-${alias}`,
        sa2Code: p.sa2Code,
        slug: p.slug,
        label: alias,
        suburb: alias,
        kind: "alias",
        areaName: p.name,
        normalized: norm,
      });
    }
  }
  return entries;
}

export function createSearch(
  entries: SearchIndexEntry[]
): Fuse<SearchIndexEntry> {
  return new Fuse(entries, {
    keys: ["label", "suburb", "normalized"],
    threshold: 0.35,
    ignoreLocation: true,
  });
}
