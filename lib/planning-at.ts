/**
 * Parcel-level planning zone + overlays at a point - a RUNTIME client-side
 * lookup, never a bundled asset (planning maps are statewide + amended weekly).
 *
 * PRIMARY: the Vicmap Planning layers on the open-data GeoServer WFS
 * (opendata.maps.vic.gov.au, CC BY 4.0, CORS-enabled) - the same host +
 * query pattern lib/parcel.ts uses, with the WFS 2.0 lat,lng axis order.
 * FALLBACK: the VicPlan ArcGIS REST point query (plan-gis.mapshare.vic.gov.au,
 * layer 0 only - the group layers reject point queries).
 *
 * Honesty rules:
 * - never throws; every request is capped at 8 s (timeoutSignal) so a stalled
 *   government endpoint can never hang the buyer report. A failed lookup is
 *   `null` - callers fall back to the SA2 area-share findings.
 * - only GAZETTED overlays are reported; a non-gazetted zone is kept but
 *   flagged (`gazetted: false`) so the copy can say "proposed".
 * - every record carries an as-at date: the gazettal date when the data has
 *   one, else the lookup date (`checkedAt`) - an undated "all clear" is the
 *   s18 exposure this defuses.
 *
 * Context only - nothing here enters any score.
 */
import { timeoutSignal } from "./fetch-timeout";
import { CONSERVATION_OVERLAY_META } from "./planning-overlays";

export type PlanningZoneAt = {
  /** Full zone code incl. schedule suffix, e.g. "GRZ1", "C1Z". */
  code: string;
  /** Base code with the schedule number stripped, e.g. "GRZ", "C1Z". */
  parent: string;
  /** Human name, e.g. "General Residential Zone - Schedule 1". */
  description: string;
  /** Council (planning-scheme LGA) when the layer carries it. */
  lga?: string;
  /** False = a proposed amendment, not yet gazetted - label it as such. */
  gazetted: boolean;
  /** Gazettal date (YYYY-MM-DD) when recorded, else the lookup date. */
  asAt: string;
};

export type PlanningOverlayAt = {
  /** Full overlay code incl. schedule, e.g. "HO123", "DDO48". */
  code: string;
  /** Overlay family, e.g. "HO", "DDO". */
  parent: string;
  description: string;
  asAt: string;
};

export type PlanningAt = {
  zone: PlanningZoneAt | null;
  overlays: PlanningOverlayAt[];
  /** The date this live lookup ran (YYYY-MM-DD) - the as-at for negatives. */
  checkedAt: string;
  source: "wfs" | "arcgis";
};

// ---- Buyer-facing metadata --------------------------------------------------

/**
 * Overlay families material enough for their own buyer-report finding. The
 * plan_overlay layer returns EVERY control at a point (parking precincts,
 * development contributions, ...); anything outside this list is bucketed into
 * one "other planning controls" line instead of shouting.
 * Ordered most-material-first for stable display.
 */
export const WHITELISTED_OVERLAY_PARENTS = [
  "PAO",
  "EAO",
  "FO",
  "BMO",
  "LSIO",
  "SBO",
  "HO",
  "MAEO",
  "AEO",
  "ESO",
  "SLO",
  "VPO",
  "EMO",
  "DDO",
] as const;

export type ParcelOverlayMeta = {
  name: string;
  /**
   * Plain-words finding headline: what this rule MEANS for the buyer, no
   * codes or proper nouns ("Changes to the outside of this home need a
   * heritage permit"). The finding title appends "(name + code)" after it.
   */
  plainTitle: string;
  /** What it means / restricts for a buyer, in plain English. */
  buyerMeaning: string;
  /** Finding severity when this overlay is mapped at the exact point. */
  severity: "high" | "medium" | "low";
};

/**
 * Plain-English meaning per whitelisted overlay family. The proper-noun
 * `name` reuses the SA2 conservation-overlay naming (lib/planning-overlays)
 * where the family already has one, so parcel + area findings never disagree
 * on what a control is called; the parcel-level explanation text is written
 * plain-first for a non-expert reader.
 */
export const PARCEL_OVERLAY_META: Record<
  (typeof WHITELISTED_OVERLAY_PARENTS)[number],
  ParcelOverlayMeta
> = {
  PAO: {
    name: CONSERVATION_OVERLAY_META.PAO.name,
    plainTitle: "The government has reserved this land for a future public project",
    buyerMeaning:
      "The government has earmarked this land for a future project - such as a road, rail line or school - and can compulsorily buy it from the owner.",
    severity: "high",
  },
  EAO: {
    name: CONSERVATION_OVERLAY_META.EAO.name,
    plainTitle: "This land may be contaminated and need a clean-up check",
    buyerMeaning:
      "The land may be contaminated, often from past industrial use. A formal contamination check (an environmental audit) can be required before homes or childcare are allowed here.",
    severity: "high",
  },
  FO: {
    name: "Floodway Overlay",
    plainTitle: "Floodwater flows across this land in a major flood",
    buyerMeaning:
      "This is the most serious flood mapping - floodwater actually flows across this land in a major flood, and building anything new here is very tightly restricted.",
    severity: "high",
  },
  BMO: {
    name: "Bushfire Management Overlay",
    plainTitle: "Building here must meet bushfire safety rules",
    buyerMeaning:
      "This land has a mapped bushfire risk. Building work needs bushfire permits, fire-resistant construction (a BAL rating) and cleared space around the home - and insurance can cost more.",
    severity: "high",
  },
  LSIO: {
    name: "Land Subject to Inundation Overlay",
    plainTitle: "This land can flood when a nearby river or creek rises",
    buyerMeaning:
      "This land can flood when a nearby river or creek rises. Building work needs flood-related permits and conditions, and insurance can cost more.",
    severity: "medium",
  },
  SBO: {
    name: "Special Building Overlay",
    plainTitle: "This land can flood in heavy rain",
    buyerMeaning:
      "Stormwater can run across this land in heavy rain. New building work must be designed to stay clear of that water.",
    severity: "medium",
  },
  HO: {
    name: "Heritage Overlay",
    plainTitle: "Changes to the outside of this home need a heritage permit",
    buyerMeaning:
      "Knocking down, extending or changing the outside of the home - sometimes even fences or trees - needs a heritage permit. It shapes what you can change.",
    severity: "medium",
  },
  MAEO: {
    name: "Melbourne Airport Environs Overlay",
    plainTitle: "Expect significant aircraft noise here",
    buyerMeaning:
      "Melbourne Airport flight paths bring significant aircraft noise here. New homes can need soundproofing, and some building and subdivision is restricted.",
    severity: "medium",
  },
  AEO: {
    name: "Airport Environs Overlay",
    plainTitle: "Expect aircraft noise here",
    buyerMeaning:
      "A nearby airport brings aircraft noise here. New homes can need soundproofing, and some building is restricted.",
    severity: "medium",
  },
  ESO: {
    name: CONSERVATION_OVERLAY_META.ESO.name,
    plainTitle: "Extra environmental rules limit building and tree removal here",
    buyerMeaning:
      "You may need a permit to build or remove vegetation here, because the area protects something environmental - such as a waterway, wildlife habitat or the coast.",
    severity: "medium",
  },
  SLO: {
    name: CONSERVATION_OVERLAY_META.SLO.name,
    plainTitle: "Rules here protect the look of the landscape",
    buyerMeaning:
      "Rules control what buildings look like, where they sit and which trees can be removed, so the area keeps its valued landscape.",
    severity: "medium",
  },
  VPO: {
    name: CONSERVATION_OVERLAY_META.VPO.name,
    plainTitle: "Removing trees or plants here needs a permit",
    buyerMeaning:
      "You need a council permit to remove, destroy or cut back protected trees and plants.",
    severity: "medium",
  },
  EMO: {
    name: CONSERVATION_OVERLAY_META.EMO.name,
    plainTitle: "This land can erode or slip, so building is controlled",
    buyerMeaning:
      "The land is prone to erosion or landslip, so building here needs extra checks and approvals.",
    severity: "medium",
  },
  DDO: {
    name: "Design and Development Overlay",
    plainTitle: "Design rules shape what can be built here",
    buyerMeaning:
      "The council sets design rules here - such as height limits, how far buildings sit from boundaries, or how they must look.",
    severity: "low",
  },
};

/**
 * One-line plain-English read of a zone GROUP for a buyer. Keyed by the base
 * code (schedule stripped). Deliberately about lived consequences, never
 * planning advice. Unknown codes get an honest generic line.
 */
const ZONE_GROUP_MEANING: Record<string, string> = {
  GRZ: "A general residential zone - houses, townhouses and some units are what this area is set up for.",
  NRZ: "A neighbourhood residential zone - the strictest residential zoning, designed to limit how many homes go on each block and keep the area's existing look.",
  RGZ: "A residential growth zone - apartments and townhouses are encouraged, so expect denser development around you over time.",
  LDRZ: "A low-density residential zone - large lots, often without all the usual connections such as sewerage.",
  MUZ: "A mixed-use zone - housing sits alongside shops, offices and light commercial uses.",
  TZ: "A township zone - small-town living and local business uses.",
  C1Z: "A commercial zone - shops, offices and services; expect business activity, deliveries and evening trade around you.",
  C2Z: "A commercial zone for offices, trade and businesses that support industry - living here is limited.",
  C3Z: "A commercial zone aimed at jobs and creative industries - living here is limited.",
  IN1Z: "An industrial zone - new homes are generally not allowed and industrial activity operates nearby.",
  IN2Z: "An industrial zone - new homes are generally not allowed and industrial activity operates nearby.",
  IN3Z: "An industrial zone - new homes are generally not allowed and industrial activity operates nearby.",
  FZ: "A farming zone - farming comes first; building a home or splitting the land is restricted.",
  RLZ: "A rural living zone - homes on large lots in a rural setting, with farming operating nearby.",
  GWZ: "A green wedge zone - countryside land kept open on purpose; splitting lots or building much here is not allowed.",
  GWAZ: "A green wedge A zone - countryside land kept open on purpose; splitting lots or building much here is not allowed.",
  RCZ: "A rural conservation zone - building is tightly controlled to protect the natural environment.",
  RAZ: "A rural activity zone - farming alongside compatible tourism and business uses.",
  PPRZ: "Public park and recreation land - not ordinarily available for private development.",
  PCRZ: "Public conservation land - protected; not ordinarily available for private development.",
  PUZ: "A public use zone - land reserved for a public purpose such as a school, hospital or utility.",
  RDZ: "A road zone - land set aside for an existing or proposed road.",
  SUZ: "A special use zone - a one-off zoning for this site; what is allowed depends entirely on the rules written for it.",
  CDZ: "A comprehensive development zone - this land has its own tailor-made development plan that sets the rules.",
  ACZ: "An activity centre zone - the planning scheme directs higher-density housing, shops and services here.",
  CCZ: "The capital city zone - central-city rules about what can be built and how tall apply here.",
  DZ: "The Docklands zone - the Docklands precinct has its own central-city building rules.",
  UGZ: "An urban growth zone - a future suburb; expect years of construction and change as precinct plans roll out.",
  UFZ: "An urban floodway zone - land at significant flood risk; building here is heavily restricted.",
  PDZ: "A priority development zone - earmarked for coordinated redevelopment.",
};

export function zoneGroupMeaning(parent: string): string {
  return (
    ZONE_GROUP_MEANING[parent] ??
    "What you can build or change here depends on this zone's own rules - check the council planning scheme."
  );
}

// ---- Pure parsing helpers (unit-tested) -------------------------------------

/** Base code with the trailing schedule number stripped: GRZ1 -> GRZ, HO123 -> HO. */
export function zoneParent(code: string): string {
  return code.replace(/\d+$/, "");
}

/**
 * "COMMERCIAL 1 ZONE" -> "Commercial 1 Zone". Tokens containing digits (codes,
 * schedule numbers, "(HO1)") are kept verbatim; joining words stay lowercase.
 */
export function prettyPlanningName(raw: string): string {
  const SMALL = new Set(["and", "of", "the", "to", "a", "in", "for", "or"]);
  return raw
    .trim()
    .split(/\s+/)
    .map((tok, i) => {
      if (/\d/.test(tok)) return tok; // codes / schedule numbers stay as-is
      const lower = tok.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Epoch ms (ArcGIS) or ISO-ish string (WFS) -> "YYYY-MM-DD", else null. */
function dateOnly(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    try {
      return new Date(v).toISOString().slice(0, 10);
    } catch {
      return null;
    }
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

type RawRecord = Record<string, unknown>;

/** The `features` array if `j` looks like a feature response, else null. */
function featureList(j: unknown): RawRecord[] | null {
  if (!j || typeof j !== "object") return null;
  const f = (j as RawRecord).features;
  if (!Array.isArray(f)) return null; // ArcGIS {error:{...}} / HTML lands here
  return f.filter((x): x is RawRecord => !!x && typeof x === "object");
}

type ParsedPlanning = { zone: PlanningZoneAt | null; overlays: PlanningOverlayAt[] };

type NormalisedRow = {
  code: string;
  parent: string;
  description: string;
  lga?: string;
  gazetted: boolean;
  asAt: string;
};

function buildParsed(zones: NormalisedRow[], overlayRows: NormalisedRow[]): ParsedPlanning {
  // Zone: prefer a gazetted one; fall back to the first (flagged proposed).
  const zoneRow = zones.find((z) => z.gazetted) ?? zones[0] ?? null;
  const zone: PlanningZoneAt | null = zoneRow
    ? {
        code: zoneRow.code,
        parent: zoneParent(zoneRow.code),
        description: zoneRow.description,
        lga: zoneRow.lga,
        gazetted: zoneRow.gazetted,
        asAt: zoneRow.asAt,
      }
    : null;
  // Overlays: gazetted only (a proposed control is not yet a control), deduped
  // by full code (adjoining polygons of the same schedule meet at boundaries).
  const seen = new Set<string>();
  const overlays: PlanningOverlayAt[] = [];
  for (const o of overlayRows) {
    if (!o.gazetted || seen.has(o.code)) continue;
    seen.add(o.code);
    overlays.push({ code: o.code, parent: o.parent, description: o.description, asAt: o.asAt });
  }
  return { zone, overlays };
}

/**
 * Parse the two Vicmap WFS GeoJSON responses (plan_zone + plan_overlay).
 * Returns null when either response is not a feature collection - the caller
 * treats that as endpoint failure and falls back to ArcGIS.
 */
export function parseWfsPlanning(
  zoneJson: unknown,
  overlayJson: unknown,
  checkedAt: string
): ParsedPlanning | null {
  const zoneFeats = featureList(zoneJson);
  const overlayFeats = featureList(overlayJson);
  if (!zoneFeats || !overlayFeats) return null;
  const norm = (f: RawRecord, parentFromScheme: boolean): NormalisedRow | null => {
    const p = (f.properties ?? {}) as RawRecord;
    const code = str(p.zone_code).toUpperCase();
    if (!code) return null;
    // plan_overlay's scheme_code IS the family (HO/DDO/...); plan_zone's is the
    // literal "ZN", so the zone parent is derived from the code instead.
    const scheme = str(p.scheme_code).toUpperCase();
    // The layer publishes the approved scheme, so a NULL/empty zone_status is
    // GAZETTED - live data carries in-force overlays (e.g. LSIO flood rows in
    // the City of Melbourne) with a null status, and dropping them would both
    // lose the flood overlay AND emit a false all-clear. Only an explicit
    // status other than "g" marks a proposed (not yet gazetted) amendment.
    const status = str(p.zone_status).toLowerCase();
    return {
      code,
      parent: parentFromScheme && scheme && scheme !== "ZN" ? scheme : zoneParent(code),
      description: prettyPlanningName(str(p.zone_description) || code),
      lga: p.lga ? prettyPlanningName(str(p.lga)) : undefined,
      gazetted: status === "" || status === "g",
      asAt: dateOnly(p.gaz_begin_date) ?? checkedAt,
    };
  };
  return buildParsed(
    zoneFeats.map((f) => norm(f, false)).filter((r): r is NormalisedRow => r != null),
    overlayFeats.map((f) => norm(f, true)).filter((r): r is NormalisedRow => r != null)
  );
}

/**
 * Parse the two VicPlan ArcGIS REST responses (zones + overlays, f=json).
 * GAZ_BEGIN_DATE arrives as epoch milliseconds. The service publishes only the
 * approved scheme, so rows are treated as gazetted.
 */
export function parseArcgisPlanning(
  zoneJson: unknown,
  overlayJson: unknown,
  checkedAt: string
): ParsedPlanning | null {
  const zoneFeats = featureList(zoneJson);
  const overlayFeats = featureList(overlayJson);
  if (!zoneFeats || !overlayFeats) return null;
  const norm = (f: RawRecord): NormalisedRow | null => {
    const a = (f.attributes ?? {}) as RawRecord;
    const code = str(a.ZONE_CODE).toUpperCase();
    if (!code) return null;
    const group = str(a.ZONE_CODE_GROUP).toUpperCase();
    return {
      code,
      parent: group || zoneParent(code),
      description: prettyPlanningName(str(a.ZONE_DESCRIPTION) || code),
      lga: a.LGA ? prettyPlanningName(str(a.LGA)) : undefined,
      gazetted: true,
      asAt: dateOnly(a.GAZ_BEGIN_DATE) ?? checkedAt,
    };
  };
  return buildParsed(
    zoneFeats.map(norm).filter((r): r is NormalisedRow => r != null),
    overlayFeats.map(norm).filter((r): r is NormalisedRow => r != null)
  );
}

// ---- The runtime fetch (browser-only, never throws) -------------------------

const WFS = "https://opendata.maps.vic.gov.au/geoserver/wfs";

function wfsUrl(layer: "plan_zone" | "plan_overlay", lng: number, lat: number): string {
  // WFS 2.0 + EPSG:4326 = lat,lng axis order (same convention as lib/parcel.ts).
  return (
    `${WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=${encodeURIComponent(`open-data-platform:${layer}`)}` +
    `&outputFormat=application/json&srsName=EPSG:4326&count=20` +
    `&cql_filter=${encodeURIComponent(`INTERSECTS(geom,POINT(${lat} ${lng}))`)}`
  );
}

const ARCGIS_BASE = "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/Planning";

function arcgisUrl(
  service: "Vicplan_PlanningSchemeZones" | "Vicplan_PlanningSchemeOverlays",
  lng: number,
  lat: number
): string {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "ZONE_CODE,ZONE_DESCRIPTION,ZONE_CODE_GROUP,LGA,GAZ_BEGIN_DATE",
    returnGeometry: "false",
    f: "json",
  });
  // Layer 0 ONLY - the service's group/child layers reject point queries.
  return `${ARCGIS_BASE}/${service}/MapServer/0/query?${params.toString()}`;
}

/** Time-capped GET -> parsed JSON, or null on any failure. Never throws. */
async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const t = timeoutSignal(8000, signal);
  try {
    const res = await fetch(url, { signal: t.signal });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    t.clear();
  }
}

/**
 * Browser-only: the planning zone + overlays mapped at (lng, lat).
 * WFS primary, ArcGIS fallback; both layers fetched in parallel; never throws;
 * each request capped at 8 s. `null` = the lookup failed (callers keep their
 * SA2 area-share fallback) - distinct from a successful "no overlays here".
 */
export async function fetchPlanningAt(
  lng: number,
  lat: number,
  opts?: { signal?: AbortSignal }
): Promise<PlanningAt | null> {
  const checkedAt = new Date().toISOString().slice(0, 10);
  try {
    const [zw, ow] = await Promise.all([
      getJson(wfsUrl("plan_zone", lng, lat), opts?.signal),
      getJson(wfsUrl("plan_overlay", lng, lat), opts?.signal),
    ]);
    const wfs = parseWfsPlanning(zw, ow, checkedAt);
    if (wfs) return { ...wfs, checkedAt, source: "wfs" };
    if (opts?.signal?.aborted) return null;
    const [za, oa] = await Promise.all([
      getJson(arcgisUrl("Vicplan_PlanningSchemeZones", lng, lat), opts?.signal),
      getJson(arcgisUrl("Vicplan_PlanningSchemeOverlays", lng, lat), opts?.signal),
    ]);
    const arc = parseArcgisPlanning(za, oa, checkedAt);
    if (arc) return { ...arc, checkedAt, source: "arcgis" };
    return null;
  } catch {
    return null;
  }
}
