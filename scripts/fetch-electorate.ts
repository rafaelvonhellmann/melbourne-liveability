/**
 * Builds public/data/aec-divisions.json = { [DivisionNm]: { member, party,
 * marginPct } } from the AEC 2022 House results (members elected + two-party-
 * preferred by division). The runtime electorate lens (lib/electorate.ts) does a
 * point-in-polygon for the CURRENT federal division at the pin, then looks up the
 * sitting member + 2022 2PP margin here. Tiny (~151 rows). Context only, never
 * scored. CC BY 4.0 (AEC). Run: npm run data:electorate.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";

const MEMBERS =
  "https://results.aec.gov.au/27966/Website/Downloads/HouseMembersElectedDownload-27966.csv";
const TPP =
  "https://results.aec.gov.au/27966/Website/Downloads/HouseTppByDivisionDownload-27966.csv";
const PUBLIC_DATA = path.join(process.cwd(), "public", "data");

async function csvRows(url: string): Promise<Record<string, string>[]> {
  const text = await fetch(url, { headers: { "User-Agent": "MelbourneLiveability/1.0" } }).then((r) => r.text());
  // The AEC files carry a one-line title before the header row.
  return parse(text, { columns: true, from_line: 2, skip_empty_lines: true, relax_column_count: true });
}

type Division = { member: string; party: string; marginPct?: number };

// The two-party-preferred margin (ALP vs Coalition) only describes the actual
// contest in seats a major party won. In Greens/independent seats (e.g.
// Melbourne, Kooyong) the 2PP is notional, so we DON'T attach a margin there -
// showing "27.9%" next to a Greens member would be misleading.
const MAJOR_PARTIES = new Set(["ALP", "LP", "LNP", "NP", "NATS", "CLP", "LNQ"]);

async function main() {
  const out: Record<string, Division> = {};

  for (const r of await csvRows(MEMBERS)) {
    const div = (r.DivisionNm ?? "").trim();
    if (!div) continue;
    out[div] = {
      member: `${r.GivenNm ?? ""} ${r.Surname ?? ""}`.trim(),
      party: (r.PartyAb || r.PartyNm || "").trim(),
    };
  }

  for (const r of await csvRows(TPP)) {
    const div = (r.DivisionNm ?? "").trim();
    if (!div || !out[div]) continue;
    const alp = Number(r["Australian Labor Party Percentage"]);
    if (Number.isFinite(alp) && MAJOR_PARTIES.has(out[div].party)) {
      out[div].marginPct = Math.round(Math.abs(alp - 50) * 10) / 10;
    }
  }

  await mkdir(PUBLIC_DATA, { recursive: true });
  await writeFile(path.join(PUBLIC_DATA, "aec-divisions.json"), JSON.stringify(out));
  console.log(`Wrote aec-divisions.json (${Object.keys(out).length} divisions)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
