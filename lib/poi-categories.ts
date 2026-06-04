/**
 * Point-of-interest (POI) pin categories and their CATEGORICAL colour palette.
 *
 * This palette is deliberately SEPARATE from the YlGnBu sequential data ramp in
 * `lib/colors.ts`. YlGnBu encodes a single ordered 0–100 data value (the
 * choropleth / data channel) and must never be reused for unordered categories.
 * Pins are nominal categories, so they use a qualitative ColorBrewer-style
 * palette (Dark2 / Set1-derived) chosen to be mutually distinguishable and
 * reasonably colourblind-aware, while harmonising with the warm-editorial chrome.
 *
 * Each pin is drawn with a white halo stroke on the map so it reads on top of
 * the cool YlGnBu choropleth and the light basemap.
 *
 * Pins are OFF by default - they only appear when the user explicitly enables a
 * category in the layer control.
 */

/** POI category ids - the `pinType` values present in `public/data/pois.geojson`. */
export type PoiCategoryId =
  | "hospital"
  | "gp"
  | "pharmacy"
  | "pathology_lab"
  | "police"
  | "post_office"
  | "school"
  | "childcare"
  | "supermarket"
  | "park"
  | "gym_leisure"
  | "cafe_restaurant"
  | "bank"
  | "tafe"
  | "university"
  | "place_of_worship"
  | "community_centre"
  | "ev_charging"
  | "aged_care";

export type PoiCategory = {
  id: PoiCategoryId;
  label: string;
  /** Distinct categorical colour (NOT from the YlGnBu data palette). */
  color: string;
};

/**
 * Categorical palette - qualitative ColorBrewer Dark2/Set1-derived hues.
 * Distinct from the YlGnBu data ramp, the coral chrome accent (#D97757) and the
 * neutral no-data grey (#d9d6cf).
 */
export const POI_CATEGORIES: PoiCategory[] = [
  { id: "hospital", label: "Hospitals", color: "#E31A1C" },
  { id: "gp", label: "GPs / clinics", color: "#377EB8" },
  { id: "pharmacy", label: "Pharmacies", color: "#1B9E77" },
  { id: "pathology_lab", label: "Pathology / labs", color: "#6A3D9A" },
  { id: "police", label: "Police", color: "#7570B3" },
  { id: "post_office", label: "Post offices", color: "#984EA3" },
  { id: "school", label: "Schools", color: "#E7298A" },
  { id: "childcare", label: "Childcare / kinder", color: "#D95F02" },
  { id: "supermarket", label: "Supermarkets", color: "#66A61E" },
  { id: "park", label: "Parks / open space", color: "#117733" },
  { id: "gym_leisure", label: "Gyms / leisure", color: "#E6AB02" },
  { id: "cafe_restaurant", label: "Cafes / restaurants", color: "#A6761D" },
  { id: "bank", label: "Banks", color: "#08519C" },
  { id: "tafe", label: "TAFE / college", color: "#CC4C02" },
  { id: "university", label: "Universities", color: "#54278F" },
  { id: "place_of_worship", label: "Places of worship", color: "#8E5572" },
  { id: "community_centre", label: "Community / cultural centres", color: "#2B8C8C" },
  { id: "ev_charging", label: "EV charging", color: "#2E8B57" },
  { id: "aged_care", label: "Aged care / retirement", color: "#B07AA1" },
];

export const POI_CATEGORY_IDS: PoiCategoryId[] = POI_CATEGORIES.map((c) => c.id);

/**
 * Display grouping for the layer control - keeps the pin list scannable instead
 * of one flat list of ~18 toggles. Hospitals are deliberately their own group
 * (different scale, people look for them specifically); GP/pharmacy/pathology are
 * aggregated under "Health services".
 */
export const POI_GROUPS: { label: string; ids: PoiCategoryId[] }[] = [
  { label: "Hospitals", ids: ["hospital"] },
  { label: "Health services", ids: ["gp", "pharmacy", "pathology_lab"] },
  { label: "Education", ids: ["childcare", "school", "tafe", "university"] },
  {
    label: "Daily needs",
    ids: ["supermarket", "bank", "post_office", "cafe_restaurant", "gym_leisure"],
  },
  { label: "Community", ids: ["place_of_worship", "community_centre", "aged_care"] },
  { label: "Getting around", ids: ["ev_charging"] },
  { label: "Safety", ids: ["police"] },
  { label: "Parks & green", ids: ["park"] },
];

export const POI_CATEGORY_BY_ID: Record<PoiCategoryId, PoiCategory> =
  Object.fromEntries(POI_CATEGORIES.map((c) => [c.id, c])) as Record<
    PoiCategoryId,
    PoiCategory
  >;

/** Fallback colour for any pin whose category is not in the palette. */
export const POI_FALLBACK_COLOR = "#8A857B";

/**
 * MapLibre `match` expression that paints a POI circle by its `pinType`
 * property using the categorical palette. Returns a data-driven expression
 * suitable for `circle-color`.
 */
export function poiCircleColorExpression(): unknown[] {
  const match: unknown[] = ["match", ["get", "pinType"]];
  for (const c of POI_CATEGORIES) {
    match.push(c.id, c.color);
  }
  match.push(POI_FALLBACK_COLOR);
  return match;
}
