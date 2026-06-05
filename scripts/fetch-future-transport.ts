/**
 * Future public-transport infrastructure from OpenStreetMap (ODbL): stations and
 * stops tagged under construction or proposed across Greater Melbourne - the
 * Metro Tunnel, Suburban Rail Loop, tram extensions, etc. A price-relevant
 * "what's coming" signal for the Buyer Check. Context only, never scored.
 *
 * Writes public/data/future-transport.json = [{ name, coord:[lng,lat], status,
 * mode }]. Run `npm run data:future-transport`. Tagging is community-maintained,
 * so coverage is indicative, not a committed-project register.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PUBLIC_DATA } from "./lib/paths.js";
import { overpassMelbourne } from "./lib/arcgis-fetch.js";

const BBOX = "(-38.4,144.3,-37.4,145.5)";

type OsmEl = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type FutureStation = {
  name: string;
  coord: [number, number];
  status: "construction" | "proposed";
  mode: "rail" | "tram";
};

function classify(tags: Record<string, string>): { status: FutureStation["status"]; mode: FutureStation["mode"] } | null {
  const vals = Object.entries(tags);
  const isStationish = vals.some(
    ([, v]) => v === "station" || v === "halt" || v === "tram_stop"
  );
  if (!isStationish) return null;
  const construction =
    tags.railway === "construction" || "construction" in tags || "construction:railway" in tags;
  const proposed =
    tags.railway === "proposed" || "proposed" in tags || "proposed:railway" in tags;
  if (!construction && !proposed) return null;
  const text = JSON.stringify(tags).toLowerCase();
  const mode = text.includes("tram") || text.includes("light_rail") ? "tram" : "rail";
  return { status: construction ? "construction" : "proposed", mode };
}

async function main() {
  console.log("Overpass future transport (construction/proposed stations)...");
  const data = (await overpassMelbourne(`
    nwr["railway"="construction"]["construction"="station"]${BBOX};
    nwr["construction"="station"]${BBOX};
    nwr["railway"="proposed"]["proposed"="station"]${BBOX};
    nwr["proposed"="station"]${BBOX};
    nwr["construction"="halt"]${BBOX};
    nwr["proposed"="halt"]${BBOX};
    nwr["construction"="tram_stop"]${BBOX};
    nwr["proposed"="tram_stop"]${BBOX};
  `)) as { elements?: OsmEl[] };

  const seen = new Set<string>();
  const stations: FutureStation[] = [];
  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null || !el.tags) continue;
    const cls = classify(el.tags);
    if (!cls) continue;
    const name = (el.tags.name ?? "").trim() || "Planned station";
    const coord: [number, number] = [
      Math.round(lon * 1e5) / 1e5,
      Math.round(lat * 1e5) / 1e5,
    ];
    const key = `${name}:${coord[0]},${coord[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stations.push({ name, coord, status: cls.status, mode: cls.mode });
  }

  await mkdir(PUBLIC_DATA, { recursive: true });
  const out = path.join(PUBLIC_DATA, "future-transport.json");
  await writeFile(out, JSON.stringify(stations));
  const byStatus = stations.reduce<Record<string, number>>((a, s) => {
    a[s.status] = (a[s.status] ?? 0) + 1;
    return a;
  }, {});
  console.log(`Wrote ${out} (${stations.length} future stops: ${JSON.stringify(byStatus)})`);
  for (const s of stations.slice(0, 12)) console.log(`  ${s.status} ${s.mode}: ${s.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
