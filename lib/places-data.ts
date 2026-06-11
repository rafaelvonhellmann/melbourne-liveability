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

export function getPlaceBySlug(places: Place[], slug: string): Place | undefined {
  return places.find((p) => p.slug === slug);
}
