/**
 * Single source of truth for the basemap style URL.
 *
 * OpenFreeMap's hosted "positron" style: free, no API key, commercial use
 * allowed (https://openfreemap.org). Replaces CARTO's basemaps CDN, whose
 * free tier is not licensed for commercial products. The light positron
 * look sits under the Crema warm-editorial chrome; the YlGnBu choropleth
 * remains the independent data channel on top.
 *
 * OpenFreeMap requires OpenStreetMap attribution - supplied by the style's
 * own attribution metadata (maplibre's AttributionControl) and by
 * components/Attribution.tsx.
 */
export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
