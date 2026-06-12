/**
 * Per-state crime adapters (FABLE-EXECUTION-PLAN Wave 2 item 1).
 *
 * Each state/territory plugs its recorded-offences source into the pipeline as
 * an adapter: fetch the raw download into data/raw, then normalize it onto SA2
 * places (rates per 100k joined via the existing SAL/LGA crosswalk). Regions
 * whose state has no adapter get NO crime data - the safety domain stays
 * unscored, exactly as before this registry existed.
 *
 * Adapter #1 is VIC (VCSA recorded offences) - a straight move of the logic
 * that lived inline in fetch-indicators.ts / normalize.ts; the Melbourne
 * pipeline output is byte-identical. Adapter #2 is the ACT (ACT Policing
 * quarterly crime statistics by suburb, dataACT). Adapter #3 is QLD (QPS
 * reported offence rates by LGA, data.qld.gov.au). Adapter #4 is NSW
 * (BOCSAR recorded criminal incidents by suburb, data.nsw). Adapter #5 is WA
 * (WA Police recorded offences by locality, via the crime portal's public
 * Power BI report). Adapter #6 is SA (SAPOL crime statistics by suburb,
 * data.sa.gov.au). Console messages inside the VIC paths are preserved
 * verbatim where they document known failure modes.
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import XLSX from "xlsx";
import "./xlsx-fs.js"; // wires fs into the ESM build - readFile throws without it
import type { Region } from "../../lib/regions.js";
import type { CrosswalkFile } from "../../lib/crosswalk-types.js";
import { downloadToFile } from "./gov-fetch.js";
import {
  applyCrimeToPlaces,
  assertXlsxFile,
  findCrimeSheet,
  parseLgaCrimeTable02,
  parseSuburbCrimeTable03,
  pickLgaOffencesXlsx,
  LGA_CRIME_LABELS,
  SUBURB_CRIME_LABELS,
  type CkanCrimeResource,
  type CrimeCounts,
} from "./vcsa-crime.js";
import {
  ACT_CRIME_RAW_FILE,
  ACT_CRIME_URL,
  applyActCrimeToPlaces,
  parseActCrimeWorkbook,
} from "./act-crime.js";
import {
  QLD_CRIME_RAW_FILE,
  QLD_CRIME_URL,
  applyQldCrimeToPlaces,
  assertQldCrimeCsvFile,
  parseQldCrimeCsv,
} from "./qld-crime.js";
import {
  NSW_CRIME_RAW_FILE,
  applyNswCrimeToPlaces,
  assertNswCrimeCsvFile,
  fetchNswCrime,
  parseNswCrimeCsv,
} from "./nsw-crime.js";
import {
  WA_CRIME_RAW_FILE,
  applyWaCrimeToPlaces,
  assertWaCrimeCsvFile,
  fetchWaCrime,
  parseWaCrimeCsv,
} from "./wa-crime.js";
import {
  SA_CRIME_RAW_FILE,
  applySaCrimeToPlaces,
  assertSaCrimeCsvFile,
  fetchSaCrime,
  parseSaCrimeCsv,
} from "./sa-crime.js";

/** The shape every adapter's normalize step writes onto. */
export type CrimePlace = {
  sa2Code: string;
  lga: string;
  population: number | null;
  propertyCrimeRate: number | null;
  violentCrimeRate: number | null;
  crimeMethod?: "direct" | "population-weighted" | "area-weighted" | null;
};

export type CrimeNormalizeCtx = {
  /** Absolute data/raw directory holding the adapter's fetched file. */
  rawDir: string;
  cw: CrosswalkFile;
  places: Iterable<CrimePlace>;
};

export type CrimeAdapter = {
  /** Provenance id - must exist in data/generated/sources.json. */
  sourceId: string;
  /** Granularity of the published data ("none" = aggregate only, unusable). */
  geographyLevel: "suburb" | "lga" | "none";
  /** Download the raw offence data for `region` into rawDir. Throws on failure
   * (callers warn-and-continue, mirroring the historical behaviour). */
  fetch(region: Region, rawDir: string): Promise<void>;
  /** Parse the raw download and join per-SA2 rates onto ctx.places. Missing /
   * malformed raw files warn and leave rates null (safety stays unscored). */
  normalize(ctx: CrimeNormalizeCtx): Promise<void>;
};

const UA = "MelbourneLiveability/1.0";

/* ----------------------------- VIC (VCSA) ------------------------------ */

const vicAdapter: CrimeAdapter = {
  sourceId: "vcsa-recorded-offences",
  geographyLevel: "suburb",

  async fetch(_region, rawDir) {
    const pkg = await fetch(
      "https://discover.data.vic.gov.au/api/3/action/package_show?id=data-tables-recorded-offences",
      { headers: { "User-Agent": UA } }
    );
    const data = (await pkg.json()) as {
      result?: { resources?: CkanCrimeResource[] };
    };
    const resources = data.result?.resources ?? [];
    // Latest edition by parsed year-ending date, matching name OR URL: the
    // June 2026 CKAN rename broke the old /LGA.*Recorded/ display-name filter
    // and the `if (url)` skip made it silent - the refresh shipped no crime
    // workbook and the coverage gate zeroed domains.safety (run 27280836153).
    const xlsx = pickLgaOffencesXlsx(resources);
    if (!xlsx?.url) {
      throw new Error(
        `no LGA offences XLSX among ${resources.length} CKAN resources ` +
          `(latest names: ${resources.slice(-3).map((r) => r.name).join("; ")})`
      );
    }
    const dest = path.join(rawDir, "vcsa-lga-offences.xlsx");
    await downloadToFile(xlsx.url, dest);
    await assertXlsxFile(dest); // a 200 HTML/WAF page must not pose as the workbook
    console.log(`  ${xlsx.name}`);
  },

  async normalize({ rawDir, cw, places }) {
    try {
      const wb = XLSX.readFile(path.join(rawDir, "vcsa-lga-offences.xlsx"));
      // Sheets located by the column labels we consume (preferring the documented
      // "Table 0x" names) so a renamed sheet / preamble rows in a new VCSA
      // edition cannot silently parse to zero. Missing BOTH is an error: the
      // coverage gate would refuse the refresh anyway, so say why here.
      const t02 = findCrimeSheet(wb, /^Table 02/i, LGA_CRIME_LABELS, ["Suburb/Town Name"]);
      const t03 = findCrimeSheet(wb, /^Table 03/i, SUBURB_CRIME_LABELS);
      if (!t02 && !t03) {
        throw new Error(
          `no sheet has the known crime columns (sheets: ${wb.SheetNames.join(", ")})`
        );
      }
      if (!t03) console.warn("Crime: suburb sheet (Table 03) not found - LGA fallback only");
      const lga = t02
        ? parseLgaCrimeTable02(t02)
        : { property: new Map<string, number>(), violent: new Map<string, number>() };
      const suburb = t03 ? parseSuburbCrimeTable03(t03) : new Map<string, CrimeCounts>();
      const stats = applyCrimeToPlaces(places, cw, suburb, lga);
      console.log(
        `Crime: ${stats.suburbMatched} SA2 via Table 03+crosswalk, ${stats.lgaFallback} LGA fallback`
      );
    } catch (e) {
      console.warn("Crime XLSX not loaded:", (e as Error).message);
    }
  },
};

/* -------------------------- ACT (ACT Policing) ------------------------- */

const actAdapter: CrimeAdapter = {
  sourceId: "act-policing-crime-statistics",
  geographyLevel: "suburb",

  async fetch(_region, rawDir) {
    const dest = path.join(rawDir, ACT_CRIME_RAW_FILE);
    await downloadToFile(ACT_CRIME_URL, dest);
    await assertXlsxFile(dest); // never let an HTML error page pose as the workbook
    console.log(`  ${ACT_CRIME_RAW_FILE}`);
  },

  async normalize({ rawDir, cw, places }) {
    try {
      const wb = XLSX.readFile(path.join(rawDir, ACT_CRIME_RAW_FILE));
      const { counts, latestQuarter } = parseActCrimeWorkbook(wb);
      const stats = applyActCrimeToPlaces(places, cw, counts);
      console.log(
        `Crime: ${stats.matched} SA2 via ACT Policing suburbs (latest 4 quarters to ${latestQuarter ?? "?"}), ${stats.unmatched} unmatched`
      );
    } catch (e) {
      console.warn("Crime XLSX not loaded:", (e as Error).message);
    }
  },
};

/* ----------------------------- QLD (QPS) ------------------------------- */

const qldAdapter: CrimeAdapter = {
  sourceId: "qps-lga-offence-rates",
  geographyLevel: "lga",

  // The CSV is statewide (all 77 councils), so the same fetch serves brisbane
  // and any future QLD region (gold coast, sunshine coast, townsville).
  async fetch(_region, rawDir) {
    const dest = path.join(rawDir, QLD_CRIME_RAW_FILE);
    await downloadToFile(QLD_CRIME_URL, dest);
    await assertQldCrimeCsvFile(dest); // never let an HTML error page pose as the CSV
    console.log(`  ${QLD_CRIME_RAW_FILE}`);
  },

  async normalize({ rawDir, cw, places }) {
    try {
      const text = await readFile(path.join(rawDir, QLD_CRIME_RAW_FILE), "utf8");
      const { rates, latestMonth, monthsUsed } = parseQldCrimeCsv(text);
      const stats = applyQldCrimeToPlaces(places, cw, rates);
      console.log(
        `Crime: ${stats.matched} SA2 via QPS LGA rates (${monthsUsed} months to ${latestMonth}), ${stats.unmatched} unmatched`
      );
    } catch (e) {
      console.warn("Crime CSV not loaded:", (e as Error).message);
    }
  },
};

/* ---------------------------- NSW (BOCSAR) ------------------------------ */

const nswAdapter: CrimeAdapter = {
  sourceId: "bocsar-suburb-offences",
  geographyLevel: "suburb",

  // The CSV is statewide (every NSW locality), so the same fetch serves
  // sydney and any future NSW region (newcastle, wollongong, northern
  // rivers). fetch() clips the ~430 MB history to the latest 12 months while
  // streaming out of the zip - see nsw-crime.ts.
  async fetch(_region, rawDir) {
    await fetchNswCrime(rawDir);
    const dest = path.join(rawDir, NSW_CRIME_RAW_FILE);
    await assertNswCrimeCsvFile(dest); // never let an HTML error page pose as the CSV
    console.log(`  ${NSW_CRIME_RAW_FILE}`);
  },

  async normalize({ rawDir, cw, places }) {
    try {
      const text = await readFile(path.join(rawDir, NSW_CRIME_RAW_FILE), "utf8");
      const parsed = parseNswCrimeCsv(text);
      const stats = applyNswCrimeToPlaces(places, cw, parsed);
      console.log(
        `Crime: ${stats.matched} SA2 via BOCSAR suburbs (${parsed.monthsUsed} months to ${parsed.latestMonth}), ${stats.unmatched} unmatched`
      );
    } catch (e) {
      console.warn("Crime CSV not loaded:", (e as Error).message);
    }
  },
};

/* ---------------------------- WA (WA Police) --------------------------- */

const waAdapter: CrimeAdapter = {
  sourceId: "wa-police-suburb-offences",
  geographyLevel: "suburb",

  // The pull is statewide (every WA locality), so the same fetch serves perth
  // and any future WA region. fetch() queries the WA crime portal's public
  // Power BI report month by month, caching each immutable period under
  // data/raw/wa-crime-cache/ - a monthly refresh re-fetches only the new month.
  async fetch(_region, rawDir) {
    await fetchWaCrime(rawDir);
    const dest = path.join(rawDir, WA_CRIME_RAW_FILE);
    await assertWaCrimeCsvFile(dest); // never let an HTML/WAF page pose as the CSV
    console.log(`  ${WA_CRIME_RAW_FILE}`);
  },

  async normalize({ rawDir, cw, places }) {
    try {
      const text = await readFile(path.join(rawDir, WA_CRIME_RAW_FILE), "utf8");
      const parsed = parseWaCrimeCsv(text);
      const stats = applyWaCrimeToPlaces(places, cw, parsed);
      console.log(
        `Crime: ${stats.matched} SA2 via WA Police localities (${parsed.monthsUsed} months to ${parsed.latestMonth}), ${stats.unmatched} unmatched`
      );
    } catch (e) {
      console.warn("Crime CSV not loaded:", (e as Error).message);
    }
  },
};

/* ----------------------------- SA (SAPOL) ------------------------------ */

const saAdapter: CrimeAdapter = {
  sourceId: "sapol-suburb-offences",
  geographyLevel: "suburb",

  // The CSVs are statewide (every SA locality), so the same fetch serves
  // adelaide and any future SA region. fetch() discovers the two newest
  // fiscal-year resources via the data.sa.gov.au CKAN API (SAPOL replaces
  // the in-progress year's file in place each quarter) and clips the pair to
  // the latest 12 months - see sa-crime.ts. NOTE: suburb-level violent
  // counts EXCLUDE sexual offences - SAPOL withholds their location
  // (suburb "NOT DISCLOSED"); documented in sources.json.
  async fetch(_region, rawDir) {
    await fetchSaCrime(rawDir);
    const dest = path.join(rawDir, SA_CRIME_RAW_FILE);
    await assertSaCrimeCsvFile(dest); // never let an HTML/WAF page pose as the CSV
    console.log(`  ${SA_CRIME_RAW_FILE}`);
  },

  async normalize({ rawDir, cw, places }) {
    try {
      const text = await readFile(path.join(rawDir, SA_CRIME_RAW_FILE), "utf8");
      const parsed = parseSaCrimeCsv(text);
      const stats = applySaCrimeToPlaces(places, cw, parsed.bySuburb);
      console.log(
        `Crime: ${stats.matched} SA2 via SAPOL suburbs (${parsed.monthsUsed} months to ${parsed.latestMonth}), ${stats.unmatched} unmatched`
      );
    } catch (e) {
      console.warn("Crime CSV not loaded:", (e as Error).message);
    }
  },
};

/* ------------------------------ Registry ------------------------------- */

/** stateSlug -> adapter. States absent here have no crime source wired up
 * yet - their safety domain stays unscored (the pre-adapter behaviour). */
const CRIME_ADAPTERS: Record<string, CrimeAdapter> = {
  vic: vicAdapter,
  act: actAdapter,
  qld: qldAdapter,
  nsw: nswAdapter,
  wa: waAdapter,
  sa: saAdapter,
};

/** The crime adapter for a region's state, or null (safety unscored). */
export function crimeAdapterFor(region: Region): CrimeAdapter | null {
  return CRIME_ADAPTERS[region.stateSlug] ?? null;
}
