import type { Pocket, PocketsFile } from "./types";
import { withBase } from "./asset-path";
import { DEFAULT_REGION, dataPath, type RegionId } from "./regions";

const pocketsPromises = new Map<RegionId, Promise<Map<string, Pocket[]>>>();

export function groupPocketsBySa2(pockets: Pocket[]): Map<string, Pocket[]> {
  const grouped = new Map<string, Pocket[]>();
  for (const pocket of pockets) {
    const group = grouped.get(pocket.sa2Code) ?? [];
    group.push(pocket);
    grouped.set(pocket.sa2Code, group);
  }
  return grouped;
}

export async function loadPockets(
  region: RegionId = DEFAULT_REGION
): Promise<Map<string, Pocket[]>> {
  const cached = pocketsPromises.get(region);
  if (cached) return cached;
  const promise = (async () => {
    const res = await fetch(withBase(dataPath(region, "pockets.json")));
    if (res.status === 404) return new Map<string, Pocket[]>();
    if (!res.ok) throw new Error("Failed to load pockets.json");
    const data = (await res.json()) as PocketsFile;
    return groupPocketsBySa2(data.pockets ?? []);
  })().catch((e) => {
    pocketsPromises.delete(region);
    throw e;
  });
  pocketsPromises.set(region, promise);
  return promise;
}

export function __resetPocketsDataCachesForTests(): void {
  pocketsPromises.clear();
}
