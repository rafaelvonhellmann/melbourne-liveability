/**
 * EPA Victoria air-monitoring sites (AirWatch, CC BY 4.0) - the "air quality
 * monitored nearby" layer for the Buyer Check. Fetches all air sites + their
 * latest health-advice band and writes a compact public/data/epa-air-sites.json
 * (site points + dated band), lazy-loaded on a pin-drop report.
 *
 * Auth: header X-API-Key (NOT the Azure default Ocp-Apim-Subscription-Key).
 * The key is read from the EPA_API_KEY env var / CI secret; if absent the script
 * SKIPS (exit 0) so the monthly refresh never breaks when the secret is missing -
 * the committed sites file simply persists. Readings are HOURLY at the source, so
 * the report shows the captured band as a DATED snapshot + links to live AirWatch.
 * Run `EPA_API_KEY=... npm run data:epa-air`.
 */
import { execFile } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PUBLIC_DATA } from "./lib/paths.js";
import type { EpaAirSite } from "../lib/epa-air.js";

const execFileAsync = promisify(execFile);
const SITES_URL =
  "https://gateway.api.epa.vic.gov.au/environmentMonitoring/v1/sites?environmentalSegment=air";

type EpaRecord = {
  siteName?: string;
  geometry?: { type?: string; coordinates?: [number, number] };
  siteHealthAdvices?: { healthParameter?: string; healthAdvice?: string; since?: string }[];
};

async function fetchSites(key: string): Promise<string> {
  try {
    const res = await fetch(SITES_URL, { headers: { "X-API-Key": key, "User-Agent": "MelbourneLiveability/1.0" } });
    if (res.ok) return await res.text();
    console.warn(`  undici ${res.status}; falling back to curl`);
  } catch (e) {
    console.warn(`  undici failed (${(e as Error).message}); curl fallback`);
  }
  const { stdout } = await execFileAsync(
    "curl",
    ["-sS", "-L", "-f", "--retry", "2", "--max-time", "120", "-H", `X-API-Key: ${key}`, SITES_URL],
    { maxBuffer: 16 * 1024 * 1024 }
  );
  return stdout;
}

async function main() {
  const key = (process.env.EPA_API_KEY ?? "").trim();
  if (!key) {
    console.warn("EPA_API_KEY not set - skipping EPA air refresh (committed sites file kept).");
    return;
  }
  console.log("EPA Victoria air-monitoring sites (AirWatch)...");
  const json = JSON.parse(await fetchSites(key)) as { records?: EpaRecord[] };
  const records = json.records ?? [];
  const sites: EpaAirSite[] = [];
  for (const r of records) {
    const c = r.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) continue;
    // EPA returns coordinates as [lat, lon] (NOT GeoJSON [lon, lat]).
    const lat = Number(c[0]);
    const lon = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const name = String(r.siteName ?? "").trim();
    if (!name) continue;
    const ha = (r.siteHealthAdvices ?? [])[0];
    sites.push({
      n: name,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      b: ha?.healthAdvice ? String(ha.healthAdvice) : null,
      p: ha?.healthParameter ? String(ha.healthParameter) : null,
      t: ha?.since ? String(ha.since) : null,
    });
  }
  if (sites.length === 0) throw new Error("EPA air: 0 sites parsed - check API response shape");

  await mkdir(PUBLIC_DATA, { recursive: true });
  const dest = path.join(PUBLIC_DATA, "epa-air-sites.json");
  const fetchedAt = new Date().toISOString().slice(0, 10);
  await writeFile(dest, JSON.stringify({ fetchedAt, sites }));
  const withBand = sites.filter((s) => s.b).length;
  console.log(`Wrote ${dest}: ${sites.length} sites (${withBand} with a current band), ${fetchedAt}`);
  console.log("fetch-epa-air complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
