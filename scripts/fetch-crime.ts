/**
 * Standalone VCSA crime download (the refresh normally does this inside
 * fetch-indicators.ts). Picks the LATEST "Recorded offences by LGA" XLSX from
 * the CKAN package by parsed year-ending date (data.vic renames these
 * resources; name-sort order is wrong - "Sep 2025" out-sorts "Dec 2025") and
 * verifies the download is a real workbook, not a WAF/HTML page.
 * Run: npx tsx scripts/fetch-crime.ts
 */
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { downloadToFile } from "./lib/gov-fetch.js";
import {
  assertXlsxFile,
  pickLgaOffencesXlsx,
  type CkanCrimeResource,
} from "./lib/vcsa-crime.js";

const UA = "MelbourneLiveability/1.0";

async function main() {
  const pkg = await fetch(
    "https://discover.data.vic.gov.au/api/3/action/package_show?id=data-tables-recorded-offences",
    { headers: { "User-Agent": UA } }
  );
  if (!pkg.ok) throw new Error(`CKAN package_show ${pkg.status}`);
  const data = (await pkg.json()) as {
    result?: { resources?: CkanCrimeResource[] };
  };
  const resources = data.result?.resources ?? [];
  const xlsx = pickLgaOffencesXlsx(resources);
  if (!xlsx?.url) {
    console.error(
      "No crime XLSX found",
      resources.slice(-5).map((r) => r.name)
    );
    process.exit(1);
  }
  console.log("Downloading", xlsx.name, xlsx.url);
  const dest = path.join(RAW, "vcsa-lga-offences.xlsx");
  await downloadToFile(xlsx.url, dest);
  await assertXlsxFile(dest);
  console.log("Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
