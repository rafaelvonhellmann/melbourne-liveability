import * as turf from "@turf/turf";

export function minDistanceKm(
  centroid: [number, number],
  points: [number, number][]
): number | null {
  const c = turf.point(centroid);
  let min = Infinity;
  for (const coord of points) {
    const d = turf.distance(c, turf.point(coord), { units: "kilometers" });
    if (d < min) min = d;
  }
  return min < Infinity ? min : null;
}

export function countWithinKm(
  centroid: [number, number],
  points: [number, number][],
  radiusKm: number
): number {
  const c = turf.point(centroid);
  let n = 0;
  for (const coord of points) {
    if (turf.distance(c, turf.point(coord), { units: "kilometers" }) <= radiusKm) n++;
  }
  return n;
}
