/**
 * Enriches data/generated/places.json with a CIVIC engagement measure -
 * place.context.community.volunteerPct = share of residents (15+) who did
 * voluntary work, from ABS Census 2021 table G23 (via the Digital Atlas of
 * Australia ABS_2021_Census_G23_SA2 ArcGIS service), keyed on sa2_code_2021.
 * Context only, never scored. Standalone (fetch + apply in one); run, then data:geo.
 *
 * volunteerPct = p_tot_volunteer / p_tot_tot * 100. Denominator is the table's
 * total (excludes "not stated"), so the rate is a slight underestimate - fine
 * for a context comparison. CC BY 4.0 (ABS).
 *
 * Failure mode: standalone runs are fatal (exit 1) so a manual invocation
 * never half-succeeds silently. In the build chain (APPLY_CIVIC_SOFT=1, set by
 * scripts/build.ts) a failed ABS fetch only warns and exits 0 - the
 * preserve-context carry-forward keeps the previous volunteerPct, and the
 * carried-fields gate makes a SECOND consecutive miss fail the refresh.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GENERATED } from "./lib/paths.js";
import type { Place, PlaceContext } from "../lib/types.js";

const G23_URL =
  "https://services-ap1.arcgis.com/ypkPEy1AmwPKGNNv/arcgis/rest/services/ABS_2021_Census_G23_SA2/FeatureServer/0/query";

type G23Row = { sa2_code_2021?: string | number; p_tot_tot?: number; p_tot_volunteer?: number };

/** Paged fetch of Victorian SA2 volunteering rates -> Map<sa2Code, pct (1dp)>. */
async function fetchVolunteering(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const page = 2000;
  let offset = 0;
  for (let i = 0; i < 10; i++) {
    const url =
      `${G23_URL}?where=${encodeURIComponent("sa2_code_2021 LIKE '2%'")}` +
      `&outFields=sa2_code_2021,p_tot_tot,p_tot_volunteer&returnGeometry=false&f=json` +
      `&resultOffset=${offset}&resultRecordCount=${page}`;
    const res = await fetch(url, { headers: { "User-Agent": "MelbourneLiveability/1.0" } });
    if (!res.ok) throw new Error(`ABS G23 ${res.status}`);
    const j = (await res.json()) as { features?: { attributes: G23Row }[] };
    const feats = j.features ?? [];
    for (const f of feats) {
      const a = f.attributes;
      const code = String(a.sa2_code_2021 ?? "");
      const tot = Number(a.p_tot_tot);
      const vol = Number(a.p_tot_volunteer);
      if (code && Number.isFinite(tot) && tot > 0 && Number.isFinite(vol)) {
        out.set(code, Math.round((vol / tot) * 1000) / 10);
      }
    }
    if (feats.length < page) break;
    offset += page;
  }
  return out;
}

/** fetchVolunteering with one retry - transient ArcGIS hiccups are common. */
async function fetchVolunteeringWithRetry(): Promise<Map<string, number>> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fetchVolunteering();
    } catch (e) {
      lastErr = e;
      console.warn(`apply-civic: ABS G23 fetch attempt ${attempt}/2 failed: ${String(e)}`);
    }
  }
  throw lastErr;
}

async function main() {
  const placesPath = path.join(GENERATED, "places.json");
  const { generatedAt, places } = JSON.parse(await readFile(placesPath, "utf8")) as {
    generatedAt: string;
    places: Place[];
  };

  let vol: Map<string, number>;
  try {
    vol = await fetchVolunteeringWithRetry();
  } catch (e) {
    if (process.env.APPLY_CIVIC_SOFT === "1") {
      console.warn(
        `apply-civic: ABS G23 fetch failed (${String(e)}) - skipping; ` +
          "volunteerPct kept from carry-forward (preserve-context merge)."
      );
      return;
    }
    throw e;
  }
  console.log(`ABS G23 volunteering: ${vol.size} VIC SA2s`);

  let enriched = 0;
  for (const p of places) {
    const v = vol.get(p.sa2Code);
    if (v == null) continue;
    const community = { ...(p.context?.community ?? {}), volunteerPct: v };
    p.context = { ...(p.context ?? {}), community } as PlaceContext;
    enriched++;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(`Applied volunteering % to ${enriched} places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
