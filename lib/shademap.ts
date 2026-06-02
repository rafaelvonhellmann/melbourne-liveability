/**
 * Deep link into ShadeMap (shademap.app) centred on a pin. ShadeMap renders
 * terrain + building shadows through the day, so a buyer can sanity-check
 * sunlight, overshadowing and aspect for a specific spot — something our SA2
 * data can't tell them. External third-party tool (not our data); we only build
 * the permalink and open it in a new tab.
 *
 * Permalink format: https://shademap.app/@{lat},{lng},{zoom}z
 */
export function shadeMapUrl(lat: number, lng: number, zoom = 17): string {
  return `https://shademap.app/@${lat.toFixed(5)},${lng.toFixed(5)},${zoom}z`;
}
