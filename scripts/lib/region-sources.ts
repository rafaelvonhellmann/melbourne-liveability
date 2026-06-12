/**
 * Pure helpers for the per-region provenance manifests (Wave 2 item 4).
 *
 * A region's sources.{region}.json is the melbourne manifest (the canonical
 * id -> name/url/licence table) filtered down to the source ids that region's
 * scored artifact actually references, plus the region's own GTFS feed entry.
 * Extracted from scripts/hash-sources.ts so the assembly is unit-testable
 * (the script self-executes on import).
 */
import type { GtfsSourceMeta } from "./gtfs-constants.js";

export type ManifestSource = {
  id: string;
  name?: string;
  url?: string;
  licence?: string;
  period?: string;
  sha256?: string;
  fetchedAt?: string;
  derived?: boolean;
  [k: string]: unknown;
};

/** Every `sourceId` string value reachable in a JSON tree (places.{region}.json
 * subIndicators and any future nested provenance refs). */
export function collectSourceIds(
  node: unknown,
  out: Set<string> = new Set()
): Set<string> {
  if (Array.isArray(node)) {
    for (const v of node) collectSourceIds(v, out);
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "sourceId" && typeof v === "string" && v) out.add(v);
      else collectSourceIds(v, out);
    }
  }
  return out;
}

/**
 * Assemble a region manifest from the melbourne template: keep template order,
 * include only referenced ids, strip melbourne's sha256/fetchedAt stamps (the
 * region run re-hashes its own raw files - carrying melbourne's hashes would
 * fake provenance), and append the region's GTFS entry when its precompute
 * artifact exists and the template has no row for it.
 */
export function buildRegionSourceEntries(
  template: ManifestSource[],
  referencedIds: Set<string>,
  gtfs?: { meta: GtfsSourceMeta; period?: string }
): ManifestSource[] {
  const entries: ManifestSource[] = [];
  for (const s of template) {
    if (!referencedIds.has(s.id)) continue;
    const clone: ManifestSource = { ...s };
    delete clone.sha256;
    delete clone.fetchedAt;
    entries.push(clone);
  }
  if (gtfs && !entries.some((e) => e.id === gtfs.meta.sourceId)) {
    entries.push({
      id: gtfs.meta.sourceId,
      name: gtfs.meta.name,
      url: gtfs.meta.url,
      licence: gtfs.meta.licence,
      ...(gtfs.period ? { period: gtfs.period } : {}),
    });
  }
  return entries;
}
