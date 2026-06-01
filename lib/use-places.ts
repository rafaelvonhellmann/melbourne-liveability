"use client";

import { useEffect, useState } from "react";
import { loadPlaces } from "./places-data";
import type { Place } from "./types";

/**
 * Shared client loader for the places dataset with consistent error handling, so
 * every page that needs /data/places.json fails the same recoverable way
 * instead of each re-implementing (or silently swallowing) the fetch.
 */
export function usePlaces(): { places: Place[]; error: boolean } {
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    loadPlaces()
      .then((p) => {
        if (!live) return;
        setPlaces(p);
        setError(false);
      })
      .catch((e) => {
        if (!live) return;
        console.error(e);
        setError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return { places, error };
}
