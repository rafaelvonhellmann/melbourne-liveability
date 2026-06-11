/** Greater Melbourne map bounds (approx GCCSA 2GMEL) - used to frame the
 * initial view only, NOT to trap panning.
 *
 * These export names are kept as aliases; the values now derive from the
 * region registry's melbourne entry (lib/regions.ts) and are unchanged. */
import REGIONS from "./regions";

const MELBOURNE = REGIONS.melbourne;

export const MELBOURNE_CENTER: [number, number] = MELBOURNE.mapCenter;
export const MELBOURNE_BOUNDS: [[number, number], [number, number]] = [
  [MELBOURNE.bbox.west, MELBOURNE.bbox.south],
  [MELBOURNE.bbox.east, MELBOURNE.bbox.north],
];

/**
 * Deliberately generous panning envelope - several degrees beyond the data
 * extent in every direction so users can pan freely (notably east/right, which
 * previously felt "walled-off" because `maxBounds` hugged Greater Melbourne).
 * Wide enough that panning is unrestricted at normal zooms, while still keeping
 * the camera from drifting off to the other side of the planet.
 */
export const MELBOURNE_MAX_BOUNDS: [[number, number], [number, number]] =
  MELBOURNE.maxBounds;
