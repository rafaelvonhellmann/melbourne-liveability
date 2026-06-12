import sourcesData from "@/data/generated/sources.json";
import { withBase } from "./asset-path";
import { DEFAULT_REGION, dataPath, type RegionId } from "./regions";

export type SourceRecord = {
  id: string;
  name: string;
  url: string;
  licence: string;
  period?: string;
  fetchedAt?: string;
  sha256?: string;
};

const SOURCES = sourcesData as SourceRecord[];
const BY_ID = new Map(SOURCES.map((s) => [s.id, s]));

export function getSource(id: string | undefined): SourceRecord | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

export function allSources(): SourceRecord[] {
  return SOURCES;
}

/**
 * Region-keyed provenance manifest (Wave 2 item 4). Melbourne resolves
 * synchronously to the bundled manifest (the exact records this module always
 * served); any other region fetches its baked /data/sources.{region}.json.
 * A 404 (region manifest not baked yet) falls back to the melbourne manifest
 * and is cached for the session; a thrown fetch (offline) also falls back but
 * is NOT cached, so a later call can re-probe.
 */
const regionSourcesPromises = new Map<RegionId, Promise<SourceRecord[]>>();

export function loadRegionSources(
  region: RegionId = DEFAULT_REGION
): Promise<SourceRecord[]> {
  if (region === DEFAULT_REGION) return Promise.resolve(SOURCES);
  const cached = regionSourcesPromises.get(region);
  if (cached) return cached;
  const promise = fetch(withBase(dataPath(region, "sources.json")))
    .then(async (res) => {
      if (!res.ok) return SOURCES; // not baked yet - melbourne fallback
      const data = (await res.json()) as SourceRecord[];
      return Array.isArray(data) && data.length > 0 ? data : SOURCES;
    })
    .catch(() => {
      regionSourcesPromises.delete(region); // transient - allow a re-probe
      return SOURCES;
    });
  regionSourcesPromises.set(region, promise);
  return promise;
}

/** Short display name: the part before the " - " qualifier (e.g. "ABS ERP by SA2"). */
export function shortSourceName(name: string): string {
  return name.split(" - ")[0];
}

/** Resolve the unique source records for an indicator id list within an
 * explicit manifest (region-aware callers pair this with loadRegionSources). */
export function sourcesForIndicatorIdsIn(
  records: SourceRecord[],
  ids: (string | undefined)[]
): SourceRecord[] {
  const byId = records === SOURCES ? BY_ID : new Map(records.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: SourceRecord[] = [];
  for (const id of ids) {
    const s = id ? byId.get(id) : undefined;
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}

/** Resolve the unique set of source records used by an indicator map
 * (melbourne bundled manifest - the historical behaviour). */
export function sourcesForIndicatorIds(ids: (string | undefined)[]): SourceRecord[] {
  return sourcesForIndicatorIdsIn(SOURCES, ids);
}

/** Test-only: drop the session cache so a suite can re-stub fetch outcomes. */
export function __resetRegionSourcesCacheForTests(): void {
  regionSourcesPromises.clear();
}
