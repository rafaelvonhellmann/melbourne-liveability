/**
 * Per-state HAZARD adapters (NATIONAL-ROLLOUT "Hazards module interface").
 *
 * Mirrors scripts/lib/crime-adapters.ts: each state plugs its bushfire/flood
 * overlay sources into the pipeline as an adapter - fetch the overlay GeoJSON
 * into data/raw, then normalize per-SA2 area-weighted overlay shares onto
 * places. Regions whose state has no adapter get NO hazards data - the domain
 * stays an honest unscored stub, exactly as before this registry existed.
 *
 * Adapter #1 is VIC - a straight move of the Vicmap BPA / LSIO / SBO logic
 * that lived inline in fetch-hazards.ts / normalize.ts; the Melbourne pipeline
 * output is byte-identical (console messages preserved verbatim).
 *
 * Adapter #2 is QLD:
 *
 *   bushfire - QFES "Bushfire Prone Area - Queensland series" (the SPP natural
 *   hazards mapping layer), CC BY 4.0. STATEWIDE product, so every SA2 in any
 *   QLD region gets a bushfirePct. Fetched as a QSpatial prepackaged regional
 *   zip (scripts/lib/qspatial-bpa.ts) and clipped to the region bbox locally -
 *   the AGOL utility proxy that also serves this layer 504s too often for
 *   paged queries (CI runs 27411672860 / 27413366356); same data vintage
 *   (July 2017 for SEQ) either way.
 *
 *   flood - Brisbane City Plan 2014 Flood overlay (CC BY 4.0,
 *   data.brisbane.qld.gov.au cp14-flood-overlay-* datasets; fetched from the
 *   BCC ArcGIS org that backs that portal, services2.arcgis.com/dEKgZETqwmDAh1rP):
 *     Flood_overlay_Brisbane_River_flood_planning_area/FeatureServer/0
 *     Flood_overlay_Creek_waterway_flood_planning_area/FeatureServer/0
 *     Flood_overlay_Overland_flow/FeatureServer/0
 *
 *   Per-council flood coverage (Greater Brisbane spans ~10 councils):
 *     Brisbane (C)      - COVERED (the three City Plan flood planning areas)
 *     Moreton Bay       - NOT WIRED. Publishes open ArcGIS overlays
 *                         (services-ap1.arcgis.com/152ojN3Ts9H3cdtl
 *                         OM_Flood_Hazard / OM_Overland_Flow) but the hazard
 *                         CATEGORIES differ from BCC's flood planning areas;
 *                         mixing them into one percentile pool needs a
 *                         category mapping that has not been verified yet.
 *     Logan / Ipswich / Redland / Scenic Rim / Somerset / Lockyer Valley /
 *     Moreton islands   - NOT WIRED: no open bulk flood-overlay feature
 *                         service verified (interactive flood-viewer portals
 *                         only).
 *   SA2s whose crosswalk weight is mostly in an unmapped council keep
 *   floodPct = null (MISSING - never a fake 0): "no data", not "no flood".
 *   The statewide Queensland Floodplain Assessment Overlay was deliberately
 *   NOT used as a fallback - it is a coarse development-assessment trigger
 *   layer, not comparable with City Plan flood planning areas.
 */
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import type { Region } from "../../lib/regions.js";
import type { CrosswalkFile } from "../../lib/crosswalk-types.js";
import { fetchArcGisGeoJson } from "./arcgis-geojson.js";
import { fetchQspatialBpaToFile } from "./qspatial-bpa.js";
import { nswHazardsAdapter } from "./nsw-hazards.js";
import { waHazardsAdapter } from "./wa-hazards.js";
import { saHazardsAdapter } from "./sa-hazards.js";
import { fetchPlanLayerGeoJson } from "./arcgis-plan-vic.js";
import { buildHazardIndex, overlayPctInSa2 } from "./sa2-overlay-pct.js";
import { normalizeQldLgaName } from "./qld-crime.js";
import { assertBakeable, registryId } from "./source-registry.js";

/** The shape every adapter's normalize step writes onto. */
export type HazardPlace = {
  sa2Code: string;
  bushfirePct: number | null;
  floodPct: number | null;
};

export type HazardNormalizeCtx = {
  /** Absolute data/raw directory holding the adapter's fetched overlays. */
  rawDir: string;
  cw: CrosswalkFile;
  places: Iterable<HazardPlace>;
  /** SA2 code -> polygon, for the area-weighted overlay share. */
  geomByCode: Map<string, Polygon | MultiPolygon>;
};

export type HazardAdapter = {
  /** Provenance ids - must exist in data/generated/sources.json. The VIC ids
   * are load-bearing for Melbourne byte-identity. */
  bushfireSourceId: string;
  floodSourceId: string;
  /** Download the overlay GeoJSON for `region` into rawDir. Throws on a
   * failed bushfire layer (a hazard refresh without its primary layer should
   * fail loudly); flood layers may warn-and-skip where the historical VIC
   * behaviour did. */
  fetch(region: Region, rawDir: string): Promise<void>;
  /** Compute per-SA2 overlay shares onto ctx.places. Missing raw files warn
   * and leave the pct null (the sub-indicator stays missing:true). */
  normalize(ctx: HazardNormalizeCtx): Promise<void>;
};

async function loadOverlayFile(
  rawDir: string,
  name: string
): Promise<FeatureCollection | null> {
  try {
    return JSON.parse(
      await readFile(path.join(rawDir, name), "utf8")
    ) as FeatureCollection;
  } catch {
    return null;
  }
}

/* ----------------------------- VIC (Vicmap) ---------------------------- */

const VIC_BPA_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Planning/FeatureServer";
const VIC_OVERLAYS_URL =
  "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/Planning/Vicplan_PlanningSchemeOverlays/MapServer";
const VIC_BUSHFIRE_SOURCE_ID = registryId("vic-planning-bpa");
const VIC_FLOOD_SOURCE_ID = registryId("vic-planning-flood");

const vicAdapter: HazardAdapter = {
  bushfireSourceId: VIC_BUSHFIRE_SOURCE_ID,
  floodSourceId: VIC_FLOOD_SOURCE_ID,

  // Straight move of scripts/fetch-hazards.ts (BPA/LSIO/SBO part) - console
  // messages and failure modes preserved (BPA failure throws and kills the
  // refresh; LSIO/SBO failures warn and continue).
  async fetch(_region, rawDir) {
    assertBakeable(VIC_BUSHFIRE_SOURCE_ID);
    assertBakeable(VIC_FLOOD_SOURCE_ID);
    console.log("Bushfire Prone Areas (Vicmap Planning)...");
    const bpa = await fetchPlanLayerGeoJson(VIC_BPA_URL, 9, 50);
    await writeFile(path.join(rawDir, "vic-bpa.geojson"), JSON.stringify(bpa));
    console.log(`  ${bpa.features.length} polygons`);

    let lsioFeatures = 0;
    let sboFeatures = 0;
    try {
      console.log("LSIO flood overlay...");
      const lsio = await fetchPlanLayerGeoJson(VIC_OVERLAYS_URL, 15, 80);
      await writeFile(path.join(rawDir, "vic-lsio.geojson"), JSON.stringify(lsio));
      lsioFeatures = lsio.features.length;
      console.log(`  ${lsioFeatures} polygons`);
    } catch (e) {
      console.warn("  LSIO skipped:", (e as Error).message);
    }

    try {
      console.log("SBO flood overlay...");
      const sbo = await fetchPlanLayerGeoJson(VIC_OVERLAYS_URL, 16, 40);
      await writeFile(path.join(rawDir, "vic-sbo.geojson"), JSON.stringify(sbo));
      sboFeatures = sbo.features.length;
      console.log(`  ${sboFeatures} polygons`);
    } catch (e) {
      console.warn("  SBO skipped:", (e as Error).message);
    }

    if (lsioFeatures === 0 && sboFeatures === 0) {
      console.warn(
        "No flood overlays downloaded - hazards domain will use bushfire only."
      );
    }
  },

  // Straight move of the normalize.ts hazards block - same index, same math,
  // same console messages, so Melbourne output stays byte-identical.
  async normalize({ rawDir, places, geomByCode }) {
    const bpa = await loadOverlayFile(rawDir, "vic-bpa.geojson");
    const lsio = await loadOverlayFile(rawDir, "vic-lsio.geojson");
    const sbo = await loadOverlayFile(rawDir, "vic-sbo.geojson");
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
      for (const p of places) {
        const geom = geomByCode.get(p.sa2Code);
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
  },
};

/* ------------------------- QLD (QFES SPP + BCC) ------------------------ */

/** QFES Bushfire Prone Area - Queensland series (statewide, CC BY 4.0).
 * Raw-file fields: fid, lga, class ("Very High/High/Medium Potential Bushfire
 * Intensity", "Potential Impact Buffer"). Sourced from the QSpatial
 * prepackaged regional packs - see scripts/lib/qspatial-bpa.ts. */

/** Brisbane City Plan 2014 flood overlay layers (CC BY 4.0). The ArcGIS org
 * backs the data.brisbane.qld.gov.au cp14-flood-overlay-* datasets. */
const BCC_AGOL = "https://services2.arcgis.com/dEKgZETqwmDAh1rP/ArcGIS/rest/services";
export const QLD_BCC_FLOOD_LAYERS = [
  { name: "river", url: `${BCC_AGOL}/Flood_overlay_Brisbane_River_flood_planning_area/FeatureServer/0` },
  { name: "creek", url: `${BCC_AGOL}/Flood_overlay_Creek_waterway_flood_planning_area/FeatureServer/0` },
  { name: "overland", url: `${BCC_AGOL}/Flood_overlay_Overland_flow/FeatureServer/0` },
] as const;

/** Raw filenames the fetch writes and normalize reads (data/raw, gitignored -
 * the river layer alone is ~190 MB at full precision; we fetch at
 * geometryPrecision 5 (~1 m) so the artifacts stay tens of MB). */
export const QLD_BPA_RAW_FILE = "qld-bpa.geojson";
export const QLD_FLOOD_RAW_FILE = "qld-bcc-flood.geojson";
const QLD_BUSHFIRE_SOURCE_ID = registryId("qld-spp-bushfire-prone-area");
const QLD_FLOOD_SOURCE_ID = registryId("bcc-cityplan-flood-overlay");

/** Councils whose open flood overlays are wired up (normalizeQldLgaName keys).
 * See the header for why Moreton Bay/Logan/Ipswich/Redland are absent. */
export const QLD_FLOOD_COVERED_LGAS = new Set([normalizeQldLgaName("Brisbane")]);

/**
 * Is this SA2 mostly inside a council whose flood overlay we have? Majority
 * crosswalk weight (>= 0.5) - a boundary-straddling SA2 keeps floodPct only
 * when most of it lies in mapped territory (the overlay share would otherwise
 * silently undercount the unmapped part).
 */
export function sa2InFloodCoveredLga(cw: CrosswalkFile, sa2Code: string): boolean {
  const entry = cw.sa2ToSuburb[sa2Code];
  let covered = 0;
  let total = 0;
  for (const s of entry?.suburbs ?? []) {
    if (!(s.weight > 0)) continue;
    total += s.weight;
    if (QLD_FLOOD_COVERED_LGAS.has(normalizeQldLgaName(s.lga))) covered += s.weight;
  }
  return total > 0 && covered / total >= 0.5;
}

/**
 * Pure core of the QLD normalize step (unit-tested directly): area-weighted
 * overlay shares per SA2. bushfire applies to EVERY SA2 (statewide layer);
 * flood only to SA2s in covered councils - everywhere else floodPct stays
 * null so the sub-indicator is honestly missing, never a fake 0.
 */
export function applyQldHazardsToPlaces(
  places: Iterable<HazardPlace>,
  cw: CrosswalkFile,
  geomByCode: Map<string, Polygon | MultiPolygon>,
  bpa: FeatureCollection | null,
  flood: FeatureCollection | null
): { bushfireSa2: number; floodSa2: number; floodSkipped: number } {
  const bpaIdx = bpa && bpa.features.length > 0 ? buildHazardIndex(bpa) : null;
  const floodIdx =
    flood && flood.features.length > 0 ? buildHazardIndex(flood) : null;
  let bushfireSa2 = 0;
  let floodSa2 = 0;
  let floodSkipped = 0;
  for (const p of places) {
    const geom = geomByCode.get(p.sa2Code);
    if (!geom) continue;
    if (bpaIdx) {
      p.bushfirePct = overlayPctInSa2(geom, bpaIdx);
      bushfireSa2++;
    }
    if (floodIdx) {
      if (sa2InFloodCoveredLga(cw, p.sa2Code)) {
        p.floodPct = overlayPctInSa2(geom, floodIdx);
        floodSa2++;
      } else {
        floodSkipped++;
      }
    }
  }
  return { bushfireSa2, floodSa2, floodSkipped };
}

const qldAdapter: HazardAdapter = {
  bushfireSourceId: QLD_BUSHFIRE_SOURCE_ID,
  floodSourceId: QLD_FLOOD_SOURCE_ID,

  async fetch(region, rawDir) {
    assertBakeable(QLD_BUSHFIRE_SOURCE_ID);
    assertBakeable(QLD_FLOOD_SOURCE_ID);
    // Statewide product - bulk-download the region's QSpatial pack and clip
    // to the region bbox locally (the paged AGOL proxy was unviable).
    console.log("QLD Bushfire Prone Area (QFES SPP via QSpatial, clipped to region bbox)...");
    const bpaCount = await fetchQspatialBpaToFile(
      region.bbox,
      rawDir,
      path.join(rawDir, QLD_BPA_RAW_FILE)
    );
    console.log(`  ${bpaCount} polygons`);

    // BCC flood overlay - all three layers or nothing: a partial union would
    // silently undercount floodPct, which is worse than an honestly missing
    // sub-indicator (mirrors arcgis-geojson's loud-truncation rule).
    try {
      const features: GeoJSON.Feature[] = [];
      for (const layer of QLD_BCC_FLOOD_LAYERS) {
        console.log(`BCC flood overlay (${layer.name})...`);
        const fc = await fetchArcGisGeoJson(layer.url, {
          envelope: region.bbox,
          outFields: "OBJECTID",
          geometryPrecision: 5,
        });
        for (const f of fc.features) {
          f.properties = { layer: layer.name };
          features.push(f);
        }
        console.log(`  ${fc.features.length} polygons`);
      }
      await writeFile(
        path.join(rawDir, QLD_FLOOD_RAW_FILE),
        JSON.stringify({ type: "FeatureCollection", features })
      );
    } catch (e) {
      console.warn(
        "  BCC flood overlay skipped (floodPct will be missing):",
        (e as Error).message
      );
    }
  },

  async normalize({ rawDir, cw, places, geomByCode }) {
    const bpa = await loadOverlayFile(rawDir, QLD_BPA_RAW_FILE);
    const flood = await loadOverlayFile(rawDir, QLD_FLOOD_RAW_FILE);
    if (!bpa) {
      console.warn(
        "Hazards: qld-bpa.geojson missing - run npm run data:hazards (bushfirePct will be missing)"
      );
    }
    if (!flood) {
      console.warn(
        "Hazards: qld-bcc-flood.geojson missing - floodPct stays missing everywhere"
      );
    }
    if (!bpa && !flood) return;
    const stats = applyQldHazardsToPlaces(places, cw, geomByCode, bpa, flood);
    console.log(
      `Hazards: BPA=${bpa?.features.length ?? 0} flood(BCC)=${flood?.features.length ?? 0} polygons; ` +
        `flood covered ${stats.floodSa2} SA2, missing ${stats.floodSkipped} SA2 (unmapped councils)`
    );
  },
};

/* ------------------------------ Registry ------------------------------- */

/** stateSlug -> adapter. States absent here have no hazard sources wired up
 * yet - their hazards domain stays unscored (the pre-adapter behaviour). */
const HAZARD_ADAPTERS: Record<string, HazardAdapter> = {
  vic: vicAdapter,
  qld: qldAdapter,
  nsw: nswHazardsAdapter,
  wa: waHazardsAdapter,
  sa: saHazardsAdapter,
};

/** The hazard adapter for a region's state, or null (hazards unscored). */
export function hazardAdapterFor(region: Region): HazardAdapter | null {
  return HAZARD_ADAPTERS[region.stateSlug] ?? null;
}
