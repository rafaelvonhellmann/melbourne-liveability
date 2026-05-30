import type { Place } from "./types";
import { withBase } from "./asset-path";

export type PlacesFile = {
  generatedAt: string;
  places: Place[];
};

export async function loadPlaces(): Promise<Place[]> {
  const res = await fetch(withBase("/data/places.json"));
  if (!res.ok) throw new Error("Failed to load places.json");
  const data = (await res.json()) as PlacesFile;
  return data.places;
}

export function getPlaceBySlug(places: Place[], slug: string): Place | undefined {
  return places.find((p) => p.slug === slug);
}
