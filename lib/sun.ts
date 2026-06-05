/**
 * Proprietary "sun & aspect" geometry for a property - deterministic solar
 * astronomy from latitude alone (no external service, no data licence, unlike a
 * third-party shade map). Buyers care which way a place faces: where the sun
 * rises/sets, how high it climbs, and how long the day runs, summer vs winter.
 *
 * All angles are degrees. Azimuth is measured clockwise from true north
 * (0 = N, 90 = E, 180 = S, 270 = W). Ignores refraction/elevation, which shift
 * sunrise a touch - fine for aspect guidance, not an almanac.
 */
const RAD = Math.PI / 180;
const AXIAL_TILT = 23.44; // Earth's axial tilt -> solstice solar declination

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

/** Nearest 16-point compass label for an azimuth in degrees from north. */
export function compass(azimuthDeg: number): string {
  const i = Math.round((((azimuthDeg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS[i];
}

/** Azimuth (deg from north) where the sun rises for a latitude + declination. */
export function sunriseAzimuth(latDeg: number, declDeg: number): number {
  const x = Math.sin(declDeg * RAD) / Math.cos(latDeg * RAD);
  return Math.acos(Math.max(-1, Math.min(1, x))) / RAD; // 0..180, east of north
}

/** Daylight length (hours) for a latitude + declination. */
export function dayLengthHours(latDeg: number, declDeg: number): number {
  const cosH = -Math.tan(latDeg * RAD) * Math.tan(declDeg * RAD);
  if (cosH <= -1) return 24;
  if (cosH >= 1) return 0;
  return (2 * (Math.acos(cosH) / RAD)) / 15;
}

/** Sun's elevation (deg above horizon) at solar noon. */
export function noonElevation(latDeg: number, declDeg: number): number {
  return 90 - Math.abs(latDeg - declDeg);
}

export type SunSeason = {
  sunriseAz: number;
  sunsetAz: number;
  sunrise: string; // compass label
  sunset: string;
  dayHours: number;
  noonElevation: number;
};

export type SunAspect = {
  hemisphere: "southern" | "northern";
  /** Direction a window/yard should face for the most sun. */
  sunSide: "north" | "south";
  summer: SunSeason;
  winter: SunSeason;
};

function season(latDeg: number, declDeg: number): SunSeason {
  const az = sunriseAzimuth(latDeg, declDeg);
  return {
    sunriseAz: az,
    sunsetAz: 360 - az,
    sunrise: compass(az),
    sunset: compass(360 - az),
    dayHours: dayLengthHours(latDeg, declDeg),
    noonElevation: noonElevation(latDeg, declDeg),
  };
}

/**
 * Sun POSITION (altitude + azimuth from north) at a specific instant + location.
 * Compact inline of the SunCalc algorithm (Mihai/Agafonkin, BSD) - pure, no
 * dependency. `altitudeDeg` is degrees above the horizon (negative = below);
 * `azimuthDeg` is clockwise from true north (0 = N, 90 = E, 180 = S, 270 = W),
 * matching MapLibre's `light.position` azimuth so it can drive 3D shading.
 */
export function sunPosition(
  date: Date,
  latDeg: number,
  lngDeg: number
): { altitudeDeg: number; azimuthDeg: number } {
  const dayMs = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const e = RAD * 23.4397; // obliquity of the ecliptic
  const lw = RAD * -lngDeg;
  const phi = RAD * latDeg;
  const d = date.valueOf() / dayMs - 0.5 + J1970 - J2000;

  const M = RAD * (357.5291 + 0.98560028 * d); // solar mean anomaly
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI; // ecliptic longitude
  const dec = Math.asin(Math.sin(0) * Math.cos(e) + Math.cos(0) * Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(e) - Math.tan(0) * Math.sin(e), Math.cos(L));
  const sidereal = RAD * (280.16 + 360.9856235 * d) - lw;
  const H = sidereal - ra; // hour angle

  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)
  );
  // SunCalc azimuth is measured from due south, +ve toward west; shift to
  // clockwise-from-north so it lines up with compass bearings + MapLibre light.
  const azSouth = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)
  );
  const azimuthDeg = (((azSouth / RAD + 180) % 360) + 360) % 360;
  return { altitudeDeg: altitude / RAD, azimuthDeg };
}

/** Full sun-aspect summary for a latitude (longitude doesn't change aspect). */
export function sunAspect(latDeg: number): SunAspect {
  const southern = latDeg < 0;
  // Local summer = sun in the same hemisphere as the site (closer overhead).
  const summerDecl = southern ? -AXIAL_TILT : AXIAL_TILT;
  const winterDecl = southern ? AXIAL_TILT : -AXIAL_TILT;
  return {
    hemisphere: southern ? "southern" : "northern",
    sunSide: southern ? "north" : "south",
    summer: season(latDeg, summerDecl),
    winter: season(latDeg, winterDecl),
  };
}
