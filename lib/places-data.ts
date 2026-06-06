import type { Place } from "./types";
import { withBase } from "./asset-path";

export type PlacesFile = {
  generatedAt: string;
  places: Place[];
};

// Shared in-flight/result cache so multiple consumers (the map, /places, the
// reachability card, ...) fetch + JSON.parse the ~1.9 MB places.json only once
// per session instead of each re-downloading and re-parsing it on the main
// thread. Cleared on failure so a transient error can be retried.
let placesPromise: Promise<Place[]> | null = null;

export async function loadPlaces(): Promise<Place[]> {
  if (placesPromise) return placesPromise;
  placesPromise = (async () => {
    const res = await fetch(withBase("/data/places.json"));
    if (!res.ok) throw new Error("Failed to load places.json");
    const data = (await res.json()) as PlacesFile;
    return data.places;
  })().catch((e) => {
    placesPromise = null; // allow a later retry after a failed load
    throw e;
  });
  return placesPromise;
}

export function getPlaceBySlug(places: Place[], slug: string): Place | undefined {
  return places.find((p) => p.slug === slug);
}
