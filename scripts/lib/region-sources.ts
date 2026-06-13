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
import { REGISTRY_BY_ID, SOURCE_REGISTRY } from "./source-registry.js";
import { BAKEABLE_VERDICTS, type LicenceVerdict } from "./source-verify.js";

export type ManifestSource = {
  id: string;
  name?: string;
  url?: string;
  method?: string;
  licence?: string;
  verifyNote?: string;
  licenceVerdict?: LicenceVerdict;
  period?: string;
  sha256?: string;
  fetchedAt?: string;
  derived?: boolean;
  [k: string]: unknown;
};

type ManifestKey =
  | "id"
  | "name"
  | "url"
  | "method"
  | "licence"
  | "verifyNote"
  | "period"
  | "fetchedAt"
  | "derived"
  | "sha256";

const MANIFEST_KEY_ORDER: ManifestKey[] = [
  "id",
  "name",
  "url",
  "method",
  "licence",
  "verifyNote",
  "period",
  "fetchedAt",
  "derived",
  "sha256",
];

const REGISTRY_ONLY_SOURCE_IDS = new Set([
  "wa-dwer-fpm-100aep-floodway-fringe",
]);

function hasOwn(source: ManifestSource, key: ManifestKey): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function shouldEmitManifestKey(
  source: ManifestSource,
  key: ManifestKey
): boolean {
  const value = source[key];
  if (key === "id") return typeof value === "string";
  if (key === "derived") return value === true;
  if (key === "sha256") {
    return (
      typeof value === "string" &&
      (value.length > 0 || (source.derived === true && hasOwn(source, key)))
    );
  }
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.length > 0;
  return true;
}

function assertOnlySanctionedDroppedIds(
  referencedIds: Set<string>,
  emittedIds: Set<string>
): void {
  for (const id of referencedIds) {
    if (emittedIds.has(id)) continue;
    const registered = REGISTRY_BY_ID.get(id);
    if (!registered) {
      throw new Error(
        `Referenced source id ${id} is not in the source registry and was dropped from the region manifest`
      );
    }
    if (
      !registered.licenceVerdict ||
      BAKEABLE_VERDICTS.has(registered.licenceVerdict)
    ) {
      throw new Error(
        `Referenced bakeable source id ${id} was dropped from the region manifest`
      );
    }
  }
}

export function serializeManifest(entries: ManifestSource[]): string {
  const ordered = entries.map((source) => {
    const out: Record<string, unknown> = {};
    for (const key of MANIFEST_KEY_ORDER) {
      if (shouldEmitManifestKey(source, key)) {
        out[key] = source[key];
      }
    }
    return out;
  });
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function buildMelbourneManifestFromRegistry(): ManifestSource[] {
  return SOURCE_REGISTRY.filter(
    (source) => {
      const regions =
        "regions" in source ? (source.regions as readonly string[]) : undefined;
      return (
        !REGISTRY_ONLY_SOURCE_IDS.has(source.id) &&
        (!regions || regions.includes("melbourne"))
      );
    }
  ).map((source) => {
    const registrySource = source as ManifestSource;
    const out: ManifestSource = { id: registrySource.id };
    for (const key of MANIFEST_KEY_ORDER) {
      if (key === "id" || key === "fetchedAt" || key === "sha256") continue;
      if (shouldEmitManifestKey(registrySource, key)) {
        (out as Record<string, unknown>)[key] = registrySource[key];
      }
    }
    return out;
  });
}

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
  assertOnlySanctionedDroppedIds(
    referencedIds,
    new Set(entries.map((entry) => entry.id))
  );
  return entries;
}
