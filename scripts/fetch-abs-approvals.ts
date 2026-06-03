/**
 * ABS Building Approvals by SA2 (dataflow ABS,BA_SA2,2.0.0) - dwelling units
 * approved, monthly, the "what's being built" pipeline signal of the Horizon
 * lens. Context only, never scored; an APPROVAL leads, and does not guarantee,
 * construction. CC BY 4.0 (ABS).
 *
 * Pulls dwelling-unit counts (MEASURE=1, SECTOR=9 total, WORK_TYPE=TOT) for
 * Houses (110) + Total Residential (100) across all SA2s from 2024-01, decodes
 * the SDMX-JSON, filters to Victorian SA2s and writes the compact monthly series
 * to data/raw/abs-sa2-approvals.json. Run `npm run data:apply-abs-approvals`
 * after (or just re-run data:normalize, which reads it inline).
 *
 * The ABS Data API is NOT a fingerprinting WAF (unlike planning.vic), so undici
 * works; we still fall back to curl on a transient block.
 */
import { execFile } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { RAW } from "./lib/paths.js";
import { decodeApprovalsSdmx } from "./lib/abs-approvals.js";

const execFileAsync = promisify(execFile);

const DATA_KEY = "1.9.TOT.110+100.SA2..M";
const BA_URL =
  `https://data.api.abs.gov.au/rest/data/ABS,BA_SA2,2.0.0/${DATA_KEY}` +
  `?startPeriod=2024-01&detail=dataonly&dimensionAtObservation=AllDimensions`;
const ACCEPT = "application/vnd.sdmx.data+json";
const UA = "MelbourneLiveability/1.0 (+https://liveable.melbourne)";

async function fetchSdmx(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { Accept: ACCEPT, "User-Agent": UA } });
    if (res.ok) return await res.text();
    console.warn(`  undici ${res.status}; falling back to curl`);
  } catch (e) {
    console.warn(`  undici failed (${(e as Error).message}); falling back to curl`);
  }
  const { stdout } = await execFileAsync(
    "curl",
    ["-sS", "-L", "-f", "--retry", "2", "--max-time", "180", "-H", `Accept: ${ACCEPT}`, "-H", `User-Agent: ${UA}`, url],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  return stdout;
}

async function main() {
  console.log("ABS Building Approvals by SA2 (BA_SA2, dwelling units)...");
  const text = await fetchSdmx(BA_URL);
  const json = JSON.parse(text);
  const { latestMonth, places } = decodeApprovalsSdmx(json);
  const n = Object.keys(places).length;
  if (n === 0) throw new Error("ABS BA_SA2: decoded 0 Victorian SA2s - check the data key / response");

  await mkdir(RAW, { recursive: true });
  const dest = path.join(RAW, "abs-sa2-approvals.json");
  await writeFile(
    dest,
    JSON.stringify({ dataKey: DATA_KEY, latestMonth, places })
  );
  console.log(`Wrote ${dest}: ${n} Victorian SA2s, latest month ${latestMonth}`);
  console.log("fetch-abs-approvals complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
