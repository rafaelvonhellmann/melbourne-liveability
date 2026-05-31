/** Greater Melbourne map bounds (approx GCCSA 2GMEL) — used to frame the
 * initial view only, NOT to trap panning. */
export const MELBOURNE_CENTER: [number, number] = [144.9631, -37.8136];
export const MELBOURNE_BOUNDS: [[number, number], [number, number]] = [
  [144.45, -38.35],
  [145.65, -37.45],
];

/**
 * Deliberately generous panning envelope — several degrees beyond the data
 * extent in every direction so users can pan freely (notably east/right, which
 * previously felt "walled-off" because `maxBounds` hugged Greater Melbourne).
 * Wide enough that panning is unrestricted at normal zooms, while still keeping
 * the camera from drifting off to the other side of the planet.
 */
export const MELBOURNE_MAX_BOUNDS: [[number, number], [number, number]] = [
  [141.0, -39.6],
  [148.8, -36.0],
];
