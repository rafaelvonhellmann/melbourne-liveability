import Fuse from "fuse.js";
import type { Place } from "./types";

export type SearchIndexEntry = {
  key: string;
  sa2Code: string;
  slug: string;
  label: string;
  suburb: string;
};

export function buildSearchIndex(places: Place[]): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [];
  for (const p of places) {
    entries.push({
      key: `${p.slug}-main`,
      sa2Code: p.sa2Code,
      slug: p.slug,
      label: p.name,
      suburb: p.name,
    });
    for (const alias of p.suburbAliases) {
      entries.push({
        key: `${p.slug}-${alias}`,
        sa2Code: p.sa2Code,
        slug: p.slug,
        label: alias,
        suburb: alias,
      });
    }
  }
  return entries;
}

export function createSearch(
  entries: SearchIndexEntry[]
): Fuse<SearchIndexEntry> {
  return new Fuse(entries, {
    keys: ["label", "suburb"],
    threshold: 0.35,
    ignoreLocation: true,
  });
}
