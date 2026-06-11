import type { Place } from "./types";
import { withBase } from "./asset-path";
import { DEFAULT_REGION, dataPath, type RegionId } from "./regions";

export type PlacesFile = {
  generatedAt: string;
  places: Place[];
};

// Shared in-flight/result cache so multiple consumers (the map, /places, the
// reachability card, ...) fetch + JSON.parse the ~1.9 MB places.json only once
// per session instead of each re-downloading and re-parsing it on the main
// thread. Keyed per region (melbourne -> /data/places.json, exactly today's
// URL; canberra -> /data/places.canberra.json). Cleared on failure so a
// transient error can be retried.
const placesPromises = new Map<RegionId, Promise<Place[]>>();

export async function loadPlaces(
  region: RegionId = DEFAULT_REGION
): Promise<Place[]> {
  const cached = placesPromises.get(region);
  if (cached) return cached;
  const promise = (async () => {
    const res = await fetch(withBase(dataPath(region, "places.json")));
    if (!res.ok) throw new Error("Failed to load places.json");
    const data = (await res.json()) as PlacesFile;
    return data.places;
  })().catch((e) => {
    placesPromises.delete(region); // allow a later retry after a failed load
    throw e;
  });
  placesPromises.set(region, promise);
  return promise;
}

/**
 * Whether a region's dataset is published (static hosting: the places artifact
 * either exists or 404s - region bakes land one by one in CI). Melbourne is
 * always available without a request. Definite verdicts (2xx / 404) are cached
 * for the session; a thrown fetch (offline, DNS) resolves false but is NOT
 * cached, so a later call can re-probe.
 */
const regionAvailability = new Map<RegionId, Promise<boolean>>();

export function regionDataAvailable(
  region: RegionId = DEFAULT_REGION
): Promise<boolean> {
  if (region === DEFAULT_REGION) return Promise.resolve(true);
  const cached = regionAvailability.get(region);
  if (cached) return cached;
  const probe = fetch(withBase(dataPath(region, "places.json")), {
    method: "HEAD",
  })
    .then((res) => res.ok)
    .catch(() => {
      regionAvailability.delete(region); // transient error - allow a re-probe
      return false;
    });
  regionAvailability.set(region, probe);
  return probe;
}

export type RegionPlacesResult = {
  places: Place[];
  /** The region whose artifact was actually served. */
  region: RegionId;
  /** True when the requested region's artifact was unavailable (not baked
   * yet / 404) and the melbourne dataset was served instead. */
  fellBack: boolean;
};

/**
 * loadPlaces with a melbourne fallback: a region whose dataset is not baked
 * yet degrades to the default map with `fellBack` set instead of crashing the
 * route. A melbourne load failure still rejects - that is a real outage and
 * keeps the existing visible, recoverable error path.
 */
export async function loadRegionPlaces(
  region: RegionId = DEFAULT_REGION
): Promise<RegionPlacesResult> {
  if (region !== DEFAULT_REGION) {
    try {
      return { places: await loadPlaces(region), region, fellBack: false };
    } catch {
      return {
        places: await loadPlaces(DEFAULT_REGION),
        region: DEFAULT_REGION,
        fellBack: true,
      };
    }
  }
  return {
    places: await loadPlaces(DEFAULT_REGION),
    region: DEFAULT_REGION,
    fellBack: false,
  };
}

export function getPlaceBySlug(places: Place[], slug: string): Place | undefined {
  return places.find((p) => p.slug === slug);
}

/** Test-only: drop the session caches (places + availability verdicts) so a
 * suite can re-stub fetch outcomes per test. Never called by app code. */
export function __resetPlacesDataCachesForTests(): void {
  placesPromises.clear();
  regionAvailability.clear();
}
