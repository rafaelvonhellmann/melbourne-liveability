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
    console.warn("gtfs-transport.json missing - run npm run data:gtfs first");
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
      p.firstNationsPct != null ||
      p.year12Pct != null
    ) {
      ctx.community = {
        renterPct: p.renterPct,
        apartmentPct: p.apartmentPct,
        firstNationsPct: p.firstNationsPct,
        year12Pct: p.year12Pct,
        sourceId: "abs-census-community-2021",
        period: "2021",
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
    if (p.population != null || p.cyclability?.areaKm2 != null) {
      ctx.population = populationContext(p.population, p.cyclability?.areaKm2, {
        sourceId: "abs-erp-sa2",
        period: "2023",
      });
    }
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
