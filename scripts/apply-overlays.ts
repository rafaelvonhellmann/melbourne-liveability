/**
 * Enriches data/generated/places.json with conservation/restriction overlay
 * shares (place.context.planning.overlays[CODE]) - the % of each SA2 within each
 * overlay, from data/raw/vic-conservation-overlays.geojson. Same overlay-share
 * computation normalize.ts performs inline (both use scripts/lib/sa2-overlay-pct
 * + lib/planning-overlays). Standalone so the metric can be (re)applied without a
 * full rebuild. Context only - planning CONTROLS, never scored. Preserves any
 * existing heritage-overlay value on context.planning.
 *
 * Run after fetch-overlays. Follow with data:geo.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { RAW, GENERATED } from "./lib/paths.js";
import { getProp, featureGeometry } from "./lib/abs-geo.js";
import { buildHazardIndex, overlayPctInSa2 } from "./lib/sa2-overlay-pct.js";
import {
  roundOverlayPct,
  CONSERVATION_OVERLAY_CODES,
} from "../lib/planning-overlays.js";
import type { Place, PlaceContext, ConservationOverlayCode } from "../lib/types.js";

async function main() {
  const placesPath = path.join(GENERATED, "places.json");
  const { generatedAt, places } = JSON.parse(
    await readFile(placesPath, "utf8")
  ) as { generatedAt: string; places: Place[] };

  const sa2Fc = JSON.parse(
    await readFile(path.join(RAW, "sa2-melbourne.geojson"), "utf8")
  ) as FeatureCollection;
  const sa2GeomByCode = new Map<string, Polygon | MultiPolygon>();
  for (const f of sa2Fc.features) {
    const code = getProp(f, ["SA2_CODE_2021", "sa2_code_2021"]);
    const geom = featureGeometry(f);
    if (code && geom) sa2GeomByCode.set(code, geom);
  }

  const fc = JSON.parse(
    await readFile(path.join(RAW, "vic-conservation-overlays.geojson"), "utf8")
  ) as FeatureCollection;

  // Split features by overlay code, then build one spatial index per overlay.
  const byOverlay = new Map<ConservationOverlayCode, Feature[]>();
  for (const f of fc.features) {
    const code = (f.properties?.code ?? "") as ConservationOverlayCode;
    if (!CONSERVATION_OVERLAY_CODES.includes(code)) continue;
    let arr = byOverlay.get(code);
    if (!arr) {
      arr = [];
      byOverlay.set(code, arr);
    }
    arr.push(f);
  }
  const idxByOverlay = new Map<
    ConservationOverlayCode,
    ReturnType<typeof buildHazardIndex>
  >();
  for (const [code, feats] of byOverlay) {
    idxByOverlay.set(
      code,
      buildHazardIndex({ type: "FeatureCollection", features: feats })
    );
    console.log(`${code}: ${feats.length} polygons`);
  }

  let enriched = 0;
  for (const p of places) {
    const geom = sa2GeomByCode.get(p.sa2Code);
    if (!geom) continue;
    const overlays: Partial<Record<ConservationOverlayCode, number>> = {};
    for (const [code, idx] of idxByOverlay) {
      const pct = roundOverlayPct(overlayPctInSa2(geom, idx));
      if (pct != null && pct > 0) overlays[code] = pct;
    }
    if (Object.keys(overlays).length === 0) continue;
    const prev = p.context?.planning;
    const ctx: PlaceContext = {
      ...(p.context ?? {}),
      planning: {
        heritageOverlayPct: prev?.heritageOverlayPct ?? null,
        sourceId: prev?.sourceId ?? "vic-planning-overlays",
        period: prev?.period ?? "current",
        overlays,
      },
    };
    p.context = ctx;
    enriched++;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(`Applied conservation overlays to ${enriched} places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
