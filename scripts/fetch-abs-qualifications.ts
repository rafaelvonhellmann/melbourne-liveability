/**
 * ABS Census 2021 non-school qualification level by SA2 (dataflow
 * ABS,C21_G49_SA2,1.0.0) - the post-Year-12 education signal (bachelor degree
 * or higher, and postgraduate). Context only, never scored. CC BY 4.0 (ABS).
 *
 * Pulls Persons (SEXP=3), all ages (AGEP=_T), qualification levels
 * _T + 1 (postgrad) + 2 (grad dip/cert) + 3 (bachelor) for every Victorian SA2
 * (REGION_TYPE=SA2, STATE=2), decodes the SDMX-JSON by dimension id, and writes
 * the compact per-SA2 shares to data/raw/abs-sa2-qualifications.json. Re-run
 * data:normalize after (it reads the file inline).
 *
 * The ABS Data API is not a fingerprinting WAF, so undici works; we still fall
 * back to curl on a transient block.
 */
import { execFile } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { RAW } from "./lib/paths.js";
import { decodeQualificationsSdmx } from "./lib/abs-qualifications.js";
import { PIPELINE_REGION } from "./lib/pipeline-region.js";

const execFileAsync = promisify(execFile);

const PERIOD = "2021";
// SEXP=3 (Persons) . QALLP=_T+1+2+3 . AGEP=_T (all ages) . REGION=(all) .
// REGION_TYPE=SA2 . STATE=<registry stateCode> (VIC=2). Decoding is by
// dimension id, so an over-broad key still decodes correctly; we filter the
// state's SA2s in the decoder.
const DATA_KEY = `3._T+1+2+3._T..SA2.${PIPELINE_REGION.stateCode}`;
const G49_URL =
  `https://data.api.abs.gov.au/rest/data/ABS,C21_G49_SA2,1.0.0/${DATA_KEY}` +
  `?startPeriod=${PERIOD}&detail=dataonly&dimensionAtObservation=AllDimensions`;
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
  console.log("ABS Census 2021 qualifications by SA2 (C21_G49_SA2)...");
  const text = await fetchSdmx(G49_URL);
  const json = JSON.parse(text);
  const { places, qallpLabels } = decodeQualificationsSdmx(
    json,
    PIPELINE_REGION.stateCode
  );
  const n = Object.keys(places).length;
  // Verification: confirm the QALLP codes still mean what the formula assumes.
  console.log("  QALLP value labels:", JSON.stringify(qallpLabels));
  const sample = Object.entries(places).slice(0, 3);
  for (const [sa2, r] of sample) {
    console.log(`  e.g. ${sa2} ${r.name}: bachelor+ ${r.bachelorPlusPct}%, postgrad ${r.postgradPct}%`);
  }
  if (n === 0) {
    throw new Error(
      `ABS C21_G49_SA2: decoded 0 ${PIPELINE_REGION.state} SA2s - check the data key / response`
    );
  }

  await mkdir(RAW, { recursive: true });
  const dest = path.join(RAW, "abs-sa2-qualifications.json");
  await writeFile(dest, JSON.stringify({ dataKey: DATA_KEY, period: PERIOD, places }));
  console.log(`Wrote ${dest}: ${n} ${PIPELINE_REGION.state} SA2s`);
  console.log("fetch-abs-qualifications complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
