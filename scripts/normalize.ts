/**
 * Normalizes raw sources → data/generated/indicators-raw.json
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as turf from "@turf/turf";
import XLSX from "xlsx";
import "./lib/xlsx-fs.js"; // wires fs into the ESM build - readFile throws without it
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { RAW, GENERATED } from "./lib/paths.js";
import {
  PIPELINE_REGION,
  generatedOutPath,
  sa2RawName,
} from "./lib/pipeline-region.js";
import { getProp, featureGeometry } from "./lib/abs-geo.js";
import type { CrosswalkFile } from "../lib/crosswalk-types.js";
import {
  applyCrimeToPlaces,
  findCrimeSheet,
  parseLgaCrimeTable02,
  parseSuburbCrimeTable03,
  LGA_CRIME_LABELS,
  SUBURB_CRIME_LABELS,
  type CrimeCounts,
} from "./lib/vcsa-crime.js";
import { countWithinKm, minDistanceKm } from "./lib/proximity.js";
import { osmPoints, isChildcareAmenity } from "./lib/osm-points.js";
import { scoredGpPoints } from "./lib/poi-classify.js";
import { buildHazardIndex, overlayPctInSa2 } from "./lib/sa2-overlay-pct.js";
import { computeCyclabilityByCode } from "./lib/cyclability-compute.js";
import { computeSocialHousing } from "../lib/social-housing.js";
import { populationContext } from "../lib/population.js";
import { summariseHousingStress } from "../lib/housing-stress.js";
import {
  roundOverlayPct,
  CONSERVATION_OVERLAY_CODES,
} from "../lib/planning-overlays.js";
import { COASTAL_SCENARIOS } from "../lib/coastal.js";
import { readVifProjections } from "./lib/vif-parse.js";
import { readApprovalsFile } from "./lib/abs-approvals.js";
import { readQualificationsFile, type QualPlace } from "./lib/abs-qualifications.js";
import { summarizeApprovals, type MonthlySeries } from "../lib/approvals.js";
import { waterRetailerAt, type WaterCorp } from "../lib/water.js";
import type {
  CoastalScenario,
  ConservationOverlayCode,
  Cyclability,
  HousingStress,
  PlaceContext,
  PlanningOverlays,
  SocialHousing,
  WalkAccess,
} from "../lib/types.js";
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
  year12Pct: number | null;
  walkAccess?: WalkAccess;
  cyclability?: Cyclability;
  socialHousing?: SocialHousing;
  housingStress?: HousingStress;
  heritageOverlayPct?: number | null;
  overlayShares?: Partial<Record<ConservationOverlayCode, number>>;
  coastalShares?: Partial<Record<CoastalScenario, number>>;
  fireBurntPct?: number | null;
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

// VIC-only raw sources (VCSA crime, MapShare hospitals, planning overlays,
// VIF, DoE schools, water corps) are skipped for non-VIC regions - mirroring
// fetch-indicators.ts - so a Canberra build can never join wrong-state data.
const IS_VIC = PIPELINE_REGION.stateSlug === "vic";

async function main() {
  const cw = JSON.parse(
    await readFile(generatedOutPath("crosswalk.json"), "utf8")
  ) as CrosswalkFile;

  const sa2Fc = JSON.parse(
    await readFile(path.join(RAW, sa2RawName()), "utf8")
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
      year12Pct: null,
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
    // Education attainment (context): % completed Year 12 or equivalent.
    const year12 = Number(row.high_22021);
    if (Number.isFinite(year12)) p.year12Pct = year12;
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

  // Social-housing SUPPLY (context only, never scored) - ABS 2021 Census G37
  // landlord-type totals: public (state/territory authority) + community housing
  // as a share of occupied private dwellings. See lib/social-housing.ts.
  for (const row of await loadAttrJsonAsync("abs-sa2-landlord.json")) {
    const code = String(row.sa2_code_2021 ?? "");
    const p = byCode.get(code);
    if (!p) continue;
    const sh = computeSocialHousing(
      {
        stateAuthority: Number(row.r_st_h_auth_total),
        communityProvider: Number(row.r_com_hp_total),
        totalDwellings: Number(row.total_total),
      },
      { sourceId: "abs-census-community-2021", period: "2021" }
    );
    if (sh.socialPct != null || sh.dwellings != null) p.socialHousing = sh;
  }

  // Housing stress (context only, never scored) - ABS 2021 Census share of
  // households paying >30% of income on rent / mortgage. See lib/housing-stress.
  for (const row of await loadAttrJsonAsync("abs-sa2-stress.json")) {
    const code = String(row.sa2_code_2021 ?? "");
    const p = byCode.get(code);
    if (!p) continue;
    const rent = Number(row.stress_172021);
    const mortgage = Number(row.stress_152021);
    const hs = summariseHousingStress(
      {
        rentStress: Number.isFinite(rent) ? rent : null,
        mortgageStress: Number.isFinite(mortgage) ? mortgage : null,
      },
      { sourceId: "abs-census-community-2021", period: "2021" }
    );
    if (hs.rentStressPct != null || hs.mortgageStressPct != null) p.housingStress = hs;
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

  if (!IS_VIC) {
    console.warn(
      `Crime: VCSA is VIC-only - skipped for ${PIPELINE_REGION.label} (safety domain unscored)`
    );
  } else {
    try {
      const wb = XLSX.readFile(path.join(RAW, "vcsa-lga-offences.xlsx"));
      // Sheets located by the column labels we consume (preferring the documented
      // "Table 0x" names) so a renamed sheet / preamble rows in a new VCSA
      // edition cannot silently parse to zero. Missing BOTH is an error: the
      // coverage gate would refuse the refresh anyway, so say why here.
      const t02 = findCrimeSheet(wb, /^Table 02/i, LGA_CRIME_LABELS, ["Suburb/Town Name"]);
      const t03 = findCrimeSheet(wb, /^Table 03/i, SUBURB_CRIME_LABELS);
      if (!t02 && !t03) {
        throw new Error(
          `no sheet has the known crime columns (sheets: ${wb.SheetNames.join(", ")})`
        );
      }
      if (!t03) console.warn("Crime: suburb sheet (Table 03) not found - LGA fallback only");
      const lga = t02
        ? parseLgaCrimeTable02(t02)
        : { property: new Map<string, number>(), violent: new Map<string, number>() };
      const suburb = t03 ? parseSuburbCrimeTable03(t03) : new Map<string, CrimeCounts>();
      const stats = applyCrimeToPlaces(byCode.values(), cw, suburb, lga);
      console.log(
        `Crime: ${stats.suburbMatched} SA2 via Table 03+crosswalk, ${stats.lgaFallback} LGA fallback`
      );
    } catch (e) {
      console.warn("Crime XLSX not loaded:", (e as Error).message);
    }
  }

  let usedGtfs = false;
  try {
    const gtfs = JSON.parse(
      await readFile(generatedOutPath("gtfs-transport.json"), "utf8")
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
    console.warn(
      IS_VIC
        ? "gtfs-transport.json missing - run npm run data:gtfs first"
        : `Transport: no GTFS precompute for ${PIPELINE_REGION.label} (per-region GTFS pending) - OSM stop fallback`
    );
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
  if (IS_VIC) {
    try {
      const raw = JSON.parse(
        await readFile(path.join(RAW, "vic-hospitals.json"), "utf8")
      ) as { points?: [number, number][] };
      vicHospitals = raw.points ?? [];
    } catch {
      console.warn("vic-hospitals.json missing");
    }
  }

  const healthJson = JSON.parse(
    (await readFile(path.join(RAW, "osm-health.json"), "utf8").catch(() => "{}")) ||
      "{}"
  );
  const osmHospitals = osmPoints(healthJson, (t) => t.amenity === "hospital");
  // Locked, pin-independent SCORED GP set (nodes only) - feeds gpCount2km.
  const gps = scoredGpPoints(healthJson);
  // Broader GP/clinic set (nodes + ways) for CONTEXT only (15-min walk access),
  // which is never scored, so it may include clinics mapped as building ways.
  const gpsContext = osmPoints(healthJson, (t) =>
    /doctors|clinic/.test(t.amenity ?? "")
  );

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

  // 15-minute access (context only, never scored) - straight-line reachability
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
    gp: gpsContext,
    school: schoolPts,
    childcare: osmPoints(schoolsJson, isChildcareAmenity),
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

  // Cyclability index (context only, never scored) - OSM cycling infrastructure
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

  // Every overlay below is a VIC planning layer (vic-*.geojson) - for non-VIC
  // regions resolve to null even if a stale local file exists, so the absent-
  // file fallbacks ("not yet available") apply uniformly.
  async function loadOverlay(name: string): Promise<FeatureCollection | null> {
    if (!IS_VIC) return null;
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
  } else if (!IS_VIC) {
    console.warn(
      `Hazards: VIC planning overlays not applicable to ${PIPELINE_REGION.label} - hazards domain unscored (per-state module pending)`
    );
  } else {
    console.warn(
      "Hazard overlays missing - run npm run data:hazards (scores will be missing for hazards domain)"
    );
  }

  // Heritage Overlay SHARE (context only, never scored) - a planning CONTROL,
  // not a hazard. Same overlay-share computation as the hazards above. See
  // lib/planning-overlays.ts (parcel-level caveat). Run data:heritage to fetch.
  const ho = await loadOverlay("vic-ho.geojson");
  if (ho && ho.features.length > 0) {
    const hoIdx = buildHazardIndex(ho);
    for (const p of byCode.values()) {
      const geom = sa2GeomByCode.get(p.sa2Code);
      if (!geom) continue;
      p.heritageOverlayPct = roundOverlayPct(overlayPctInSa2(geom, hoIdx));
    }
    console.log(`Heritage Overlay: ${ho.features.length} polygons`);
  }

  // Conservation / restriction overlay SHARES (context only, never scored). Each
  // feature in the combined raw file is tagged with its overlay `code`
  // (ESO/SLO/VPO/EMO/EAO/PAO). Same overlay-share computation as heritage above;
  // see lib/planning-overlays.ts (parcel-level caveat). Run data:overlays to fetch.
  const conservation = await loadOverlay("vic-conservation-overlays.geojson");
  if (conservation && conservation.features.length > 0) {
    const featsByCode = new Map<
      ConservationOverlayCode,
      typeof conservation.features
    >();
    for (const f of conservation.features) {
      const code = (f.properties?.code ?? "") as ConservationOverlayCode;
      if (!CONSERVATION_OVERLAY_CODES.includes(code)) continue;
      let arr = featsByCode.get(code);
      if (!arr) {
        arr = [];
        featsByCode.set(code, arr);
      }
      arr.push(f);
    }
    for (const [code, feats] of featsByCode) {
      const idx = buildHazardIndex({ type: "FeatureCollection", features: feats });
      for (const p of byCode.values()) {
        const geom = sa2GeomByCode.get(p.sa2Code);
        if (!geom) continue;
        const pct = roundOverlayPct(overlayPctInSa2(geom, idx));
        if (pct != null && pct > 0) {
          (p.overlayShares ??= {})[code] = pct;
        }
      }
      console.log(`Overlay ${code}: ${feats.length} polygons`);
    }
  }

  // Coastal inundation (sea-level rise) SHARES (context only, never scored). Each
  // feature is tagged with its `scenario` (2040/2070/2100). Same overlay-share
  // computation; see lib/coastal.ts (projection + not-parcel caveat). Run
  // data:sea-level to fetch.
  const seaLevel = await loadOverlay("vic-sea-level.geojson");
  if (seaLevel && seaLevel.features.length > 0) {
    const featsByScenario = new Map<CoastalScenario, typeof seaLevel.features>();
    for (const f of seaLevel.features) {
      const sc = (f.properties?.scenario ?? "") as CoastalScenario;
      if (!COASTAL_SCENARIOS.some((s) => s.key === sc)) continue;
      let arr = featsByScenario.get(sc);
      if (!arr) {
        arr = [];
        featsByScenario.set(sc, arr);
      }
      arr.push(f);
    }
    for (const [sc, feats] of featsByScenario) {
      const idx = buildHazardIndex({ type: "FeatureCollection", features: feats });
      for (const p of byCode.values()) {
        const geom = sa2GeomByCode.get(p.sa2Code);
        if (!geom) continue;
        const pct = roundOverlayPct(overlayPctInSa2(geom, idx));
        if (pct != null && pct > 0) {
          (p.coastalShares ??= {})[sc] = pct;
        }
      }
      console.log(`Coastal inundation ${sc}: ${feats.length} polygons`);
    }
  }

  // Past-fire burnt SHARE (context only, never scored). Single index over all
  // fire-history polygons; HISTORY, not the forward bushfire overlay. Run
  // data:fire-history to fetch.
  const fireHistory = await loadOverlay("vic-fire-history.geojson");
  if (fireHistory && fireHistory.features.length > 0) {
    const fireIdx = buildHazardIndex(fireHistory, { simplifyTolerance: 0.0015 });
    for (const p of byCode.values()) {
      const geom = sa2GeomByCode.get(p.sa2Code);
      if (!geom) continue;
      p.fireBurntPct = roundOverlayPct(overlayPctInSa2(geom, fireIdx));
    }
    console.log(`Fire history: ${fireHistory.features.length} polygons`);
  }

  // VIF2023 SA2 population + dwelling projections (context only, never scored) -
  // read once for the context loop below. Optional file (run data:vif to fetch).
  let vifMap: Map<
    string,
    { population: Record<string, number>; dwellings: Record<string, number> }
  > = new Map();
  if (IS_VIC) {
    try {
      vifMap = readVifProjections(path.join(RAW, "vif2023-sa2.xlsx"));
      if (vifMap.size) console.log(`VIF projections: ${vifMap.size} SA2s`);
      else console.warn("VIF projections: file parsed but yielded 0 SA2 rows");
    } catch (e) {
      // The file is optional locally, but it is COMMITTED (data/raw/vif2023-sa2
      // .xlsx) since the workflow stopped fetching it - so a load failure in CI
      // is unexpected and was invisible here when refresh run 27280836153
      // carried projections forward with no clue why. Say why, keep going.
      console.warn("VIF projections not loaded:", (e as Error).message);
    }
  }

  // ABS building approvals per SA2 (context only, never scored) - the "what's
  // being built" pipeline. Optional file (run data:abs-approvals to fetch).
  let approvalsMap = new Map<string, MonthlySeries>();
  try {
    approvalsMap = await readApprovalsFile(path.join(RAW, "abs-sa2-approvals.json"));
    if (approvalsMap.size) console.log(`Building approvals: ${approvalsMap.size} SA2s`);
  } catch {
    /* approvals file optional */
  }

  // Post-school qualification level per SA2 (context only, never scored) -
  // bachelor+ and postgraduate share among residents who hold a non-school
  // qualification. Optional file (run data:abs-qualifications to fetch).
  let qualMap = new Map<string, QualPlace>();
  try {
    qualMap = await readQualificationsFile(path.join(RAW, "abs-sa2-qualifications.json"));
    if (qualMap.size) console.log(`Qualifications: ${qualMap.size} SA2s`);
  } catch {
    /* qualifications file optional */
  }

  // School sector mix per SA2 (context only) - government/Catholic/independent
  // counts from VIC DoE. Optional file (run data:schools to fetch).
  let schoolsMix: Record<string, { government: number; catholic: number; independent: number }> = {};
  if (IS_VIC) {
    try {
      const sf = JSON.parse(
        await readFile(path.join(RAW, "vic-schools-by-sa2.json"), "utf8")
      ) as { places?: Record<string, { government: number; catholic: number; independent: number }> };
      schoolsMix = sf.places ?? {};
      if (Object.keys(schoolsMix).length) console.log(`School mix: ${Object.keys(schoolsMix).length} SA2s`);
    } catch {
      /* schools file optional */
    }
  }

  // Water retailer per SA2 (context only) - which corporation services the area.
  // Optional file (run data:water-corp to fetch from the Vicmap WFS).
  let waterCorps: WaterCorp[] = [];
  if (IS_VIC) {
    try {
      const wfc = JSON.parse(
        await readFile(path.join(RAW, "water-corp.geojson"), "utf8")
      ) as FeatureCollection;
      waterCorps = wfc.features
        .filter(
          (f): f is typeof f & { geometry: Polygon | MultiPolygon } =>
            !!f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
        )
        .map((f) => ({
          name: String(f.properties?.watercorp_name ?? ""),
          url: f.properties?.url ? String(f.properties.url) : undefined,
          geometry: f.geometry,
        }));
      if (waterCorps.length) console.log(`Water corps: ${waterCorps.length}`);
    } catch {
      /* water-corp file optional */
    }
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
    const qrec = qualMap.get(p.sa2Code);
    const hasQual = !!qrec && qrec.bachelorPlusPct != null;
    if (
      p.renterPct != null ||
      p.apartmentPct != null ||
      p.firstNationsPct != null ||
      p.year12Pct != null ||
      hasQual
    ) {
      ctx.community = {
        renterPct: p.renterPct,
        apartmentPct: p.apartmentPct,
        firstNationsPct: p.firstNationsPct,
        year12Pct: p.year12Pct,
        sourceId: "abs-census-community-2021",
        period: "2021",
        ...(hasQual
          ? {
              bachelorPlusPct: qrec!.bachelorPlusPct,
              postgradPct: qrec!.postgradPct,
              qualSourceId: "abs-census-g49-sa2",
            }
          : {}),
      };
    }
    if (p.walkAccess) ctx.walkAccess = p.walkAccess;
    if (p.cyclability) ctx.cyclability = p.cyclability;
    if (p.socialHousing) ctx.socialHousing = p.socialHousing;
    if (p.housingStress) ctx.housingStress = p.housingStress;
    if (
      p.heritageOverlayPct != null ||
      (p.overlayShares && Object.keys(p.overlayShares).length > 0)
    ) {
      ctx.planning = {
        heritageOverlayPct: p.heritageOverlayPct ?? null,
        sourceId: "vic-planning-heritage",
        period: "current",
        ...(p.overlayShares && Object.keys(p.overlayShares).length > 0
          ? { overlays: p.overlayShares }
          : {}),
      } satisfies PlanningOverlays;
    }
    if (p.coastalShares && Object.keys(p.coastalShares).length > 0) {
      ctx.coastalInundation = {
        scenarioShares: p.coastalShares,
        sourceId: "vic-coastal-inundation",
        period: "2040-2100 projection",
      };
    }
    if (p.fireBurntPct != null && p.fireBurntPct > 0) {
      ctx.fireHistory = {
        burntPct: p.fireBurntPct,
        sourceId: "vic-fire-history",
        period: "to 2022-23",
      };
    }
    const vrec = vifMap.get(p.sa2Code);
    if (vrec && (Object.keys(vrec.population).length || Object.keys(vrec.dwellings).length)) {
      ctx.projections = {
        population: vrec.population,
        dwellings: vrec.dwellings,
        sourceId: "vif2023-sa2",
        period: "2021-2036",
      };
    }
    const dp = summarizeApprovals(approvalsMap.get(p.sa2Code));
    if (dp) ctx.developmentPipeline = dp;
    const sa2geom = sa2GeomByCode.get(p.sa2Code);
    if (sa2geom && waterCorps.length) {
      // pointOnFeature (guaranteed inside) - centroid can fall OUTSIDE a concave
      // or multipart SA2, mis-assigning or dropping the retailer (review 2026-06-04).
      const ctr = turf.pointOnFeature(sa2geom).geometry.coordinates as [number, number];
      const wr = waterRetailerAt(ctr, waterCorps);
      if (wr) ctx.waterRetailer = { name: wr.name, url: wr.url, sourceId: "vic-water-corp" };
    }
    if (p.population != null || p.cyclability?.areaKm2 != null) {
      ctx.population = populationContext(p.population, p.cyclability?.areaKm2, {
        sourceId: "abs-erp-sa2",
        period: "2023",
      });
    }
    const sm = schoolsMix[p.sa2Code];
    if (sm && sm.government + sm.catholic + sm.independent > 0) {
      ctx.schools = {
        government: sm.government,
        catholic: sm.catholic,
        independent: sm.independent,
        sourceId: "vic-doe-school-locations",
        period: "2025",
      };
    }
    p.context = ctx;
  }

  await mkdir(GENERATED, { recursive: true });
  const places = [...byCode.values()];
  const outFile = generatedOutPath("indicators-raw.json");
  await writeFile(
    outFile,
    JSON.stringify({ generatedAt: new Date().toISOString(), places })
  );
  console.log(`Wrote ${path.basename(outFile)} (${places.length} SA2)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
