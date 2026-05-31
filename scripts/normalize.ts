/**
 * Normalizes raw sources → data/generated/indicators-raw.json
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as turf from "@turf/turf";
import XLSX from "xlsx";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { RAW, GENERATED } from "./lib/paths.js";
import { getProp, featureGeometry } from "./lib/abs-geo.js";
import type { CrosswalkFile } from "../lib/crosswalk-types.js";
import {
  applyCrimeToPlaces,
  parseLgaCrimeTable02,
  parseSuburbCrimeTable03,
} from "./lib/vcsa-crime.js";
import { countWithinKm, minDistanceKm } from "./lib/proximity.js";
import { buildHazardIndex, overlayPctInSa2 } from "./lib/sa2-overlay-pct.js";
import { computeCyclabilityByCode } from "./lib/cyclability-compute.js";
import type { Cyclability, PlaceContext, WalkAccess } from "../lib/types.js";
import {
  WALK_THRESHOLD_KM,
  WALK_CATEGORY_IDS,
  classifyOsmAmenity,
  summariseWalkAccess,
  type WalkCategoryId,
} from "../lib/walk-access.js";

type Sa2Raw = {
  sa2Code: string;
  sa2Name: string;
  lga: string;
  centroid: [number, number];
  suburbAliases: string[];
  population: number | null;
  medianDhiWeekly: number | null;
  medianRentWeekly: number | null;
  propertyCrimeRate: number | null;
  violentCrimeRate: number | null;
  crimeMethod: "direct" | "population-weighted" | "area-weighted" | null;
  stops800m: number | null;
  ptModes: string | null;
  amPeakFreq: number | null;
  transportSource: "ptv-gtfs" | "osm-pt" | null;
  hospitalDistKm: number | null;
  hospitalSource: "vic-mapshare-hospitals" | "osm-health" | null;
  gpCount2km: number | null;
  employmentRatio: number | null;
  participationRate: number | null;
  bushfirePct: number | null;
  floodPct: number | null;
  schools2km: number | null;
  preschoolEnrolled: number | null;
  irsadDecile: number | null;
  irsdDecile: number | null;
  renterPct: number | null;
  apartmentPct: number | null;
  firstNationsPct: number | null;
  walkAccess?: WalkAccess;
  cyclability?: Cyclability;
  context?: PlaceContext;
};

function toFeature(geom: Polygon | MultiPolygon) {
  return { type: "Feature" as const, properties: {}, geometry: geom };
}

async function loadAttrJsonAsync(file: string) {
  try {
    return JSON.parse(
      await readFile(path.join(RAW, file), "utf8")
    ) as Record<string, string | number>[];
  } catch {
    return [];
  }
}

function osmPoints(
  data: { elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] } | null,
  filter?: (tags: Record<string, string>) => boolean
): [number, number][] {
  const pts: [number, number][] = [];
  for (const el of data?.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const tags = el.tags ?? {};
    if (filter && !filter(tags)) continue;
    pts.push([lon, lat]);
  }
  return pts;
}

/**
 * SCORED GP/clinic points — a LOCKED, narrow definition: OSM *nodes* tagged
 * amenity=doctors|clinic. Deliberately decoupled from the broader map-pin fetch
 * (build-poi can widen pins with clinic *ways* / healthcare=* tags), because
 * widening context pins must NEVER move the scored Health composite
 * (ULTRAPLAN: "context never changes the score"). Ways carry `center` rather
 * than top-level lat/lon, so the node check reproduces the original node-only
 * GP fetch exactly and keeps gpCount2km stable across pin-query changes.
 */
function scoredGpPoints(
  data: {
    elements?: {
      type?: string;
      lat?: number;
      lon?: number;
      tags?: Record<string, string>;
    }[];
  } | null
): [number, number][] {
  const pts: [number, number][] = [];
  for (const el of data?.elements ?? []) {
    if (el.type !== "node" || el.lat == null || el.lon == null) continue;
    if (!/doctors|clinic/.test(el.tags?.amenity ?? "")) continue;
    pts.push([el.lon, el.lat]);
  }
  return pts;
}

async function main() {
  const cw = JSON.parse(
    await readFile(path.join(GENERATED, "crosswalk.json"), "utf8")
  ) as CrosswalkFile;

  const sa2Fc = JSON.parse(
    await readFile(path.join(RAW, "sa2-melbourne.geojson"), "utf8")
  ) as FeatureCollection;

  const byCode = new Map<string, Sa2Raw>();

  for (const f of sa2Fc.features) {
    const code = getProp(f, ["SA2_CODE_2021", "sa2_code_2021"]);
    const name = getProp(f, ["SA2_NAME_2021", "sa2_name_2021"]);
    const geom = featureGeometry(f);
    if (!code || !name || !geom) continue;
    const centroid = turf.centroid(toFeature(geom)).geometry.coordinates as [
      number,
      number,
    ];
    const entry = cw.sa2ToSuburb[code];
    byCode.set(code, {
      sa2Code: code,
      sa2Name: name,
      lga: entry?.suburbs[0]?.lga ?? "Unknown",
      centroid,
      suburbAliases: entry?.suburbs.map((s) => s.suburb) ?? [],
      population: null,
      medianDhiWeekly: null,
      medianRentWeekly: null,
      propertyCrimeRate: null,
      violentCrimeRate: null,
      crimeMethod: null,
      stops800m: null,
      ptModes: null,
      amPeakFreq: null,
      transportSource: null,
      hospitalDistKm: null,
      hospitalSource: null,
      gpCount2km: null,
      employmentRatio: null,
      participationRate: null,
      bushfirePct: null,
      floodPct: null,
      schools2km: null,
      preschoolEnrolled: null,
      irsadDecile: null,
      irsdDecile: null,
      renterPct: null,
      apartmentPct: null,
      firstNationsPct: null,
    });
  }

  const sa2GeomByCode = new Map<string, Polygon | MultiPolygon>();
  for (const f of sa2Fc.features) {
    const code = getProp(f, ["SA2_CODE_2021", "sa2_code_2021"]);
    const geom = featureGeometry(f);
    if (code && geom) sa2GeomByCode.set(code, geom);
  }

  for (const row of await loadAttrJsonAsync("abs-sa2-income.json")) {
    const code = String(row.sa2_code_2021 ?? "");
    const val = Number(row.equiv_22021);
    const p = byCode.get(code);
    if (p && Number.isFinite(val)) p.medianDhiWeekly = val;
  }

  for (const row of await loadAttrJsonAsync("abs-sa2-rent.json")) {
    const code = String(row.sa2_code_2021 ?? "");
    const val = Number(row.rent_42021);
    const p = byCode.get(code);
    if (p && Number.isFinite(val)) p.medianRentWeekly = val;
  }

  for (const row of await loadAttrJsonAsync("abs-sa2-erp.json")) {
    const code = String(row.sa2_code_2021 ?? "");
    const val = Number(row.erp_no_2023);
    const p = byCode.get(code);
    if (p && Number.isFinite(val)) p.population = val;
  }

  for (const row of await loadAttrJsonAsync("abs-sa2-employment.json")) {
    const code = String(row.sa2_code_2021 ?? "");
    const employed = Number(row.lf_62016);
    const participation = Number(row.lf_52016);
    const presch = Number(row.presch_82021);
    const p = byCode.get(code);
    if (!p) continue;
    const pop = p.population ?? 0;
    if (Number.isFinite(employed) && pop > 0) {
      p.employmentRatio = employed / pop;
    }
    if (Number.isFinite(participation)) p.participationRate = participation;
    if (Number.isFinite(presch)) p.preschoolEnrolled = presch;
  }

  for (const row of await loadAttrJsonAsync("abs-sa2-seifa.json")) {
    const code = String(row.sa2_code_2021 ?? "");
    const p = byCode.get(code);
    if (!p) continue;
    const irsad = Number(row.irsad_aus_decile);
    const irsd = Number(row.irsd_aus_decile);
    if (Number.isFinite(irsad)) p.irsadDecile = irsad;
    if (Number.isFinite(irsd)) p.irsdDecile = irsd;
  }

  for (const row of await loadAttrJsonAsync("abs-sa2-community.json")) {
    const code = String(row.sa2_code_2021 ?? "");
    const p = byCode.get(code);
    if (!p) continue;
    const owned = Number(row.tenure_72021);
    const mortgage = Number(row.tenure_82021);
    const rented = Number(row.tenure_92021);
    const other = Number(row.tenure_102021);
    const tenureTotal = owned + mortgage + rented + other;
    if (tenureTotal > 0 && Number.isFinite(rented)) {
      p.renterPct = (rented / tenureTotal) * 100;
    }
    const apartments = Number(row.dwell_42021);
    const dwellTotal = Number(row.dwell_72021);
    if (dwellTotal > 0 && Number.isFinite(apartments)) {
      p.apartmentPct = (apartments / dwellTotal) * 100;
    }
  }

  for (const row of await loadAttrJsonAsync("abs-sa2-indigenous.json")) {
    const code = String(row.sa2_code_2021 ?? "");
    const p = byCode.get(code);
    if (!p) continue;
    const indigenous = Number(row.indigenous_p_tot_p);
    const total = Number(row.tot_p_p);
    if (total > 0 && Number.isFinite(indigenous)) {
      p.firstNationsPct = (indigenous / total) * 100;
    }
  }

  try {
    const wb = XLSX.readFile(path.join(RAW, "vcsa-lga-offences.xlsx"));
    const t02 = wb.SheetNames.find((n) => /^Table 02/i.test(n));
    const t03 = wb.SheetNames.find((n) => /^Table 03/i.test(n));
    const lga = t02 ? parseLgaCrimeTable02(wb.Sheets[t02]) : { property: new Map(), violent: new Map() };
    const suburb = t03
      ? parseSuburbCrimeTable03(wb.Sheets[t03])
      : new Map();
    const stats = applyCrimeToPlaces(byCode.values(), cw, suburb, lga);
    console.log(
      `Crime: ${stats.suburbMatched} SA2 via Table 03+crosswalk, ${stats.lgaFallback} LGA fallback`
    );
  } catch (e) {
    console.warn("Crime XLSX not loaded:", (e as Error).message);
  }

  let usedGtfs = false;
  try {
    const gtfs = JSON.parse(
      await readFile(path.join(GENERATED, "gtfs-transport.json"), "utf8")
    ) as {
      places: Record<
        string,
        { stops800m: number; amPeakFreq: number; ptModes: string | null }
      >;
    };
    for (const p of byCode.values()) {
      const t = gtfs.places[p.sa2Code];
      if (!t) continue;
      p.stops800m = t.stops800m;
      p.amPeakFreq = t.amPeakFreq;
      p.ptModes = t.ptModes;
      p.transportSource = "ptv-gtfs";
      usedGtfs = true;
    }
    console.log("Transport: PTV GTFS precompute");
  } catch {
    console.warn("gtfs-transport.json missing — run npm run data:gtfs first");
  }

  if (!usedGtfs) {
    const ptJson = JSON.parse(
      (await readFile(path.join(RAW, "osm-pt.json"), "utf8").catch(() => "{}")) ||
        "{}"
    );
    const ptPts = osmPoints(ptJson);
    for (const p of byCode.values()) {
      const c = turf.point(p.centroid);
      let count = 0;
      for (const coord of ptPts) {
        if (turf.distance(c, turf.point(coord), { units: "kilometers" }) <= 0.8) {
          count++;
        }
      }
      p.stops800m = count;
      p.ptModes = count > 0 ? "osm-fallback" : null;
      p.amPeakFreq = null;
      p.transportSource = count > 0 ? "osm-pt" : null;
    }
    console.log("Transport: OpenStreetMap fallback (not PTV GTFS)");
  }

  let vicHospitals: [number, number][] = [];
  try {
    const raw = JSON.parse(
      await readFile(path.join(RAW, "vic-hospitals.json"), "utf8")
    ) as { points?: [number, number][] };
    vicHospitals = raw.points ?? [];
  } catch {
    console.warn("vic-hospitals.json missing");
  }

  const healthJson = JSON.parse(
    (await readFile(path.join(RAW, "osm-health.json"), "utf8").catch(() => "{}")) ||
      "{}"
  );
  const osmHospitals = osmPoints(healthJson, (t) => t.amenity === "hospital");
  // Locked, pin-independent scored GP set (see scoredGpPoints).
  const gps = scoredGpPoints(healthJson);

  let hospitalSource: "vic-mapshare-hospitals" | "osm-health" = "osm-health";
  const hospitalPts = vicHospitals.length > 0 ? vicHospitals : osmHospitals;
  if (vicHospitals.length > 0) hospitalSource = "vic-mapshare-hospitals";

  for (const p of byCode.values()) {
    const dist = minDistanceKm(p.centroid, hospitalPts);
    if (dist != null) {
      p.hospitalDistKm = dist;
      p.hospitalSource = hospitalSource;
    }
    p.gpCount2km = countWithinKm(p.centroid, gps, 2);
  }
  console.log(
    `Health: hospitals from ${hospitalSource} (${hospitalPts.length} points), GP from osm-health nodes (${gps.length}, locked scored set)`
  );

  const schoolsJson = JSON.parse(
    (await readFile(path.join(RAW, "osm-schools.json"), "utf8").catch(() => "{}")) ||
      "{}"
  );
  const schoolPts = osmPoints(schoolsJson, (t) => t.amenity === "school");
  for (const p of byCode.values()) {
    p.schools2km = countWithinKm(p.centroid, schoolPts, 2);
  }
  console.log(`Education: ${schoolPts.length} OSM schools, preschool from ABS`);

  // 15-minute access (context only, never scored) — straight-line reachability
  // of everyday amenities from each SA2 centroid. Categories come from OSM:
  // supermarket/pharmacy/park/cafe/gym from osm-amenities.json, GP from
  // osm-health, school/childcare from osm-schools.
  const amenitiesJson = JSON.parse(
    (await readFile(path.join(RAW, "osm-amenities.json"), "utf8").catch(
      () => "{}"
    )) || "{}"
  ) as {
    elements?: {
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }[];
  };
  const walkPoints: Record<WalkCategoryId, [number, number][]> = {
    supermarket: [],
    pharmacy: [],
    gp: gps,
    school: schoolPts,
    childcare: osmPoints(schoolsJson, (t) => t.amenity === "kindergarten"),
    park: [],
    cafe_restaurant: [],
    gym_leisure: [],
  };
  for (const el of amenitiesJson.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const cat = classifyOsmAmenity(el.tags ?? {});
    if (cat && cat in walkPoints) walkPoints[cat].push([lon, lat]);
  }
  for (const p of byCode.values()) {
    const counts = {} as Record<WalkCategoryId, number>;
    for (const id of WALK_CATEGORY_IDS) {
      counts[id] = countWithinKm(p.centroid, walkPoints[id], WALK_THRESHOLD_KM);
    }
    p.walkAccess = summariseWalkAccess(counts, {
      sourceId: "osm-amenities",
      period: "current",
    });
  }
  console.log(
    `15-min access: supermarkets=${walkPoints.supermarket.length} pharmacies=${walkPoints.pharmacy.length} parks=${walkPoints.park.length} cafe/restaurant=${walkPoints.cafe_restaurant.length} gym/leisure=${walkPoints.gym_leisure.length}`
  );

  // Cyclability index (context only, never scored) — OSM cycling infrastructure
  // length per SA2, normalised by land area. See lib/cyclability.ts caveats.
  const cyclewaysJson = JSON.parse(
    (await readFile(path.join(RAW, "osm-cycleways.json"), "utf8").catch(
      () => "{}"
    )) || "{}"
  ) as { elements?: { type?: string; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> }[] };
  const cyclabilityByCode = computeCyclabilityByCode(
    cyclewaysJson,
    sa2GeomByCode,
    { sourceId: "osm-cycleways", period: "current" }
  );
  for (const p of byCode.values()) {
    const c = cyclabilityByCode.get(p.sa2Code);
    if (c) p.cyclability = c;
  }
  {
    let withInfra = 0;
    let totalKm = 0;
    for (const c of cyclabilityByCode.values()) {
      if (c.cyclewayKm > 0) withInfra++;
      totalKm += c.cyclewayKm;
    }
    console.log(
      `Cyclability: ${totalKm.toFixed(0)} km cycle infrastructure across ${withInfra}/${cyclabilityByCode.size} SA2`
    );
  }

  async function loadOverlay(name: string): Promise<FeatureCollection | null> {
    try {
      return JSON.parse(
        await readFile(path.join(RAW, name), "utf8")
      ) as FeatureCollection;
    } catch {
      return null;
    }
  }

  const bpa = await loadOverlay("vic-bpa.geojson");
  const lsio = await loadOverlay("vic-lsio.geojson");
  const sbo = await loadOverlay("vic-sbo.geojson");
  const floodFeatures = [
    ...(lsio?.features ?? []),
    ...(sbo?.features ?? []),
  ];
  if (bpa || floodFeatures.length > 0) {
    const bpaIdx = bpa ? buildHazardIndex(bpa) : null;
    const floodIdx =
      floodFeatures.length > 0
        ? buildHazardIndex({ type: "FeatureCollection", features: floodFeatures })
        : null;
    for (const p of byCode.values()) {
      const geom = sa2GeomByCode.get(p.sa2Code);
      if (!geom) continue;
      if (bpaIdx) p.bushfirePct = overlayPctInSa2(geom, bpaIdx);
      if (floodIdx) p.floodPct = overlayPctInSa2(geom, floodIdx);
    }
    console.log(
      `Hazards: BPA=${bpa?.features.length ?? 0} flood=${floodFeatures.length} polygons`
    );
  } else {
    console.warn(
      "Hazard overlays missing — run npm run data:hazards (scores will be missing for hazards domain)"
    );
  }

  for (const p of byCode.values()) {
    const ctx: PlaceContext = {
      environment: {
        note: "Urban heat island and air-quality layers are planned for v2; not shown in v1.x.",
      },
      politics: {
        note: "Federal election booth results by SA2 are planned for v2; not shown in v1.x.",
      },
    };
    if (p.irsadDecile != null || p.irsdDecile != null) {
      ctx.equity = {
        irsadDecile: p.irsadDecile,
        irsdDecile: p.irsdDecile,
        sourceId: "abs-seifa-2021",
        period: "2021",
      };
    }
    if (
      p.renterPct != null ||
      p.apartmentPct != null ||
      p.firstNationsPct != null
    ) {
      ctx.community = {
        renterPct: p.renterPct,
        apartmentPct: p.apartmentPct,
        firstNationsPct: p.firstNationsPct,
        sourceId: "abs-census-community-2021",
        period: "2021",
      };
    }
    if (p.walkAccess) ctx.walkAccess = p.walkAccess;
    if (p.cyclability) ctx.cyclability = p.cyclability;
    p.context = ctx;
  }

  await mkdir(GENERATED, { recursive: true });
  const places = [...byCode.values()];
  await writeFile(
    path.join(GENERATED, "indicators-raw.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), places })
  );
  console.log(`Wrote indicators-raw.json (${places.length} SA2)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
