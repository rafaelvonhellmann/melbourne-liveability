/**
 * WA Police Force recorded offences by locality, via the public Power BI report
 * that backs the WA crime statistics portal.
 *
 * The portal (https://www.wa.gov.au/organisation/western-australia-police-force/
 * crime-statistics) only publishes suburb/locality figures through an embedded
 * Power BI "publish to web" report - the bulk XLSX download is DISTRICT level
 * (~8 metro districts), too coarse for SA2 percentiles. But a publish-to-web
 * report is backed by an UNAUTHENTICATED query API: the embed page resolves a
 * cluster, and POSTing a semantic query with the report's public resource key
 * returns the underlying model's data. We query the locality x offence-category
 * x month grain directly - no scraping of 1,641 HTML pages.
 *
 *   Resource key (from the embed URL r= token, base64): 0529e30b-...-821a08626da5
 *   Dataset id:   dbcf91e0-0dd3-4a77-bd28-c81717587e25  (from modelsAndExploration)
 *   Cluster:      wabi-australia-east-a-primary-api.analysis.windows.net
 *   Model table:  "Offences Combined Minister Hierarchy"
 *     columns we read: Sub_Txt (locality), Offence Category, Month Start Date,
 *     # Offences (measure). District / Region carried but unused here.
 *
 * The query endpoint is /public/reports/querydata?synchronous=true; responses
 * use Power BI's compressed DSR encoding (value dictionaries + repeated-cell
 * bitmasks) which decodeDsrRows() expands.
 *
 * Offence classification (top-level "Offence Category" rollups only - grouping
 * by the category column sums its member offence types once, so no double
 * count, the same discipline as the QLD division rollups):
 *   violent  = "Selected Offences Against the Person"   (homicide, sexual
 *              offences, assault family/non-family, threatening behaviour,
 *              deprivation of liberty, robbery) - matches VCSA division A, the
 *              ACT person blocks, QPS "Offences Against the Person" and the
 *              BOCSAR person divisions.
 *   property = "Selected Offences Against Property"      (burglary, stealing,
 *              stealing of motor vehicle, property damage, arson) - matches
 *              VCSA division B, QPS "Offences Against Property", BOCSAR theft/
 *              arson/malicious damage.
 *   excluded = "Detected Offences" (drug / regulated weapons / receiving stolen
 *              property - police-detected, not victim-reported, so suburb counts
 *              track enforcement intensity not safety) and "Miscellaneous
 *              Offences" (fraud, graffiti, breach of violence restraint order) -
 *              mirrors the drug/justice/public-order/catch-all exclusions in the
 *              VIC, ACT, QLD and NSW adapters.
 *
 * Time window: sum of the LATEST TWELVE monthly counts per locality - a rolling
 * year, comparable to VCSA's "year ending" counts, the ACT's latest four
 * quarters, QPS's latest twelve monthly rates and BOCSAR's latest twelve months.
 * Counts are incidents, so normalize divides by SA2 ERP population for per-100k,
 * exactly like the VIC/ACT/NSW suburb adapters.
 *
 * Suburb join: WA gazetted localities are UNIQUE statewide - verified against
 * the source: all 1,641 localities map to exactly one police district, zero
 * cross-district name collisions. So there are no namesake localities to merge
 * (unlike NSW's "Darlington (Sydney)" vs "(Singleton)"), and the join is by bare
 * normalized name like the ACT adapter, not a suburb|lga key.
 *
 * Cache: the data is published monthly and historical months are immutable, so
 * fetch caches each month's statewide pull under data/raw/wa-crime-cache/ keyed
 * by period (wa-crime-YYYY-MM.json). A monthly CI refresh re-fetches only the
 * one new month; the other eleven load from cache. The combined rolling-window
 * artifact (WA_CRIME_RAW_FILE) is reassembled from the cache each run and is the
 * file hash-sources fingerprints.
 *
 * The pull is statewide, so any WA region (perth today; future regional WA)
 * reuses this adapter unchanged.
 */
import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { parse as parseCsvSync } from "csv-parse/sync";
import { normalizeSuburbName } from "../../lib/suburb-normalize.js";
import type { CrosswalkFile } from "../../lib/crosswalk-types.js";
import type { CrimeCounts } from "./vcsa-crime.js";

/** Portal page (provenance / human landing - NOT the data endpoint). */
export const WA_CRIME_URL =
  "https://www.wa.gov.au/organisation/western-australia-police-force/crime-statistics";

/** Power BI public report parameters (see header). */
export const WA_PBI_RESOURCE_KEY = "0529e30b-1962-4db4-87e3-821a08626da5";
export const WA_PBI_DATASET_ID = "dbcf91e0-0dd3-4a77-bd28-c81717587e25";
export const WA_PBI_MODEL_ID = 2087120;
export const WA_PBI_QUERYDATA_URL =
  "https://wabi-australia-east-a-primary-api.analysis.windows.net" +
  "/public/reports/querydata?synchronous=true";
const WA_PBI_ENTITY = "Offences Combined Minister Hierarchy";

/** Combined rolling-window artifact the fetch writes and normalize reads. */
export const WA_CRIME_RAW_FILE = "wa-police-suburb-offences.csv";
/** Per-period cache directory (resumable monthly refresh). */
export const WA_CRIME_CACHE_DIR = "wa-crime-cache";

const VIOLENT_CATEGORY = "selected offences against the person";
const PROPERTY_CATEGORY = "selected offences against property";

/**
 * Classify a WA "Offence Category" rollup as property / violent, or null for the
 * deliberately excluded rollups ("Detected Offences", "Miscellaneous Offences").
 * Exact (case-insensitive) match only: a renamed rollup drops out rather than
 * misclassifying, and parse() throws when NOTHING classifies, so a wholesale
 * relabel still fails loudly.
 */
export function classifyWaOffence(category: string): "property" | "violent" | null {
  const c = category.trim().toLowerCase();
  if (c === VIOLENT_CATEGORY) return "violent";
  if (c === PROPERTY_CATEGORY) return "property";
  return null;
}

/**
 * Rank a "YYYY-MM" month label as a comparable month index, or null for anything
 * unrecognised (the header row and any stray columns rank null). The combined
 * CSV stores periods as "YYYY-MM"; this owns the latest-12 window selection.
 */
export function waMonthRank(label: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(label.trim());
  if (!m) return null;
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  return Number(m[1]) * 12 + (mon - 1);
}

export type WaCrimeParse = {
  /** normalizeSuburbName(locality) -> latest-12-month counts. */
  bySuburb: Map<string, CrimeCounts>;
  /** Label of the most recent month consumed, e.g. "2026-03". */
  latestMonth: string;
  /** Distinct months inside the rolling window (12 when the grid is full). */
  monthsUsed: number;
};

/**
 * Parse the combined WA offences CSV (columns: Suburb, Offence Category, Month,
 * Offences) into per-locality property/violent counts over the latest twelve
 * months. Re-derives the window by month rank, so it reads the clipped artifact
 * and any wider export identically. Throws when the identifier columns are
 * missing, no month parses, or nothing classifies, so a reshaped export fails
 * loudly instead of zeroing the safety domain.
 */
export function parseWaCrimeCsv(text: string): WaCrimeParse {
  const rows = parseCsvSync(text, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];
  if (!rows.length) throw new Error("WA offences CSV is empty");

  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const suburbCol = header.indexOf("suburb");
  const categoryCol = header.indexOf("offence category");
  const monthCol = header.indexOf("month");
  const offencesCol = header.indexOf("offences");
  if (suburbCol < 0 || categoryCol < 0 || monthCol < 0 || offencesCol < 0) {
    throw new Error(
      `WA identifier columns not found (need Suburb + Offence Category + Month + ` +
        `Offences; got: ${rows[0].join(", ")}) - the export layout changed`
    );
  }

  let maxRank = -1;
  let latestMonth = "";
  for (let i = 1; i < rows.length; i++) {
    const rank = waMonthRank(String(rows[i][monthCol] ?? ""));
    if (rank != null && rank > maxRank) {
      maxRank = rank;
      latestMonth = String(rows[i][monthCol]).trim();
    }
  }
  if (maxRank < 0) {
    throw new Error('no parsable "YYYY-MM" month values (expected e.g. "2026-03")');
  }

  const bySuburb = new Map<string, CrimeCounts>();
  const months = new Set<number>();
  for (let i = 1; i < rows.length; i++) {
    const rank = waMonthRank(String(rows[i][monthCol] ?? ""));
    if (rank == null || rank <= maxRank - 12) continue; // latest 12 months only
    const kind = classifyWaOffence(String(rows[i][categoryCol] ?? ""));
    if (!kind) continue;
    const raw = String(rows[i][suburbCol] ?? "").trim();
    if (!raw) continue;
    const n = Number(rows[i][offencesCol]);
    if (!Number.isFinite(n)) continue;
    months.add(rank);
    const key = normalizeSuburbName(raw);
    const cur = bySuburb.get(key) ?? { property: 0, violent: 0 };
    cur[kind] += n;
    bySuburb.set(key, cur);
  }
  if (!bySuburb.size) {
    throw new Error(
      "no locality rows classified from the latest 12 months - the export layout changed"
    );
  }
  return { bySuburb, latestMonth, monthsUsed: months.size };
}

/**
 * Join per-locality counts to SA2 places via the crosswalk, by NORMALIZED
 * locality name only - WA gazetted localities are unique statewide, so a
 * suburb|lga key would only add a constant. Mirrors applyActCrimeToPlaces:
 * crosswalk-weighted counts over SA2 ERP population -> rate per 100k, crimeMethod
 * from the crosswalk.
 */
export function applyWaCrimeToPlaces<
  T extends {
    sa2Code: string;
    population: number | null;
    propertyCrimeRate: number | null;
    violentCrimeRate: number | null;
    crimeMethod?: "direct" | "population-weighted" | "area-weighted" | null;
  },
>(
  places: Iterable<T>,
  cw: CrosswalkFile,
  parsed: Pick<WaCrimeParse, "bySuburb">
): { matched: number; unmatched: number } {
  let matched = 0;
  let unmatched = 0;
  for (const p of places) {
    const entry = cw.sa2ToSuburb[p.sa2Code];
    let wProp = 0;
    let wViol = 0;
    let hit = false;
    for (const s of entry?.suburbs ?? []) {
      const c = parsed.bySuburb.get(normalizeSuburbName(s.suburb));
      if (!c) continue;
      hit = true;
      wProp += s.weight * c.property;
      wViol += s.weight * c.violent;
    }
    if (!hit) {
      unmatched++;
      continue;
    }
    const pop = p.population ?? 10000;
    p.propertyCrimeRate = (wProp / pop) * 100000;
    p.violentCrimeRate = (wViol / pop) * 100000;
    p.crimeMethod = entry?.suburbs[0]?.method ?? "area-weighted";
    matched++;
  }
  return { matched, unmatched };
}

/* --------------------------- Power BI fetch path --------------------------- */

type DsrRow = Record<string, unknown> & {
  S?: { N: string; T: number; DN?: string }[];
  C?: (string | number)[];
  R?: number;
  /** Null-flags bitmask: a set bit means that select position is null. */
  "Ø"?: number;
};

/**
 * Expand a Power BI DSR data window into plain value rows. The first row carries
 * the column schema (S); thereafter the R bitmask marks columns repeated from
 * the previous row and the Ø bitmask marks nulls. A changed column's value comes
 * either positionally from the C array (the multi-column form) or under its
 * select name key on the row object (the single-column / ordered form, e.g.
 * {"G0": 1772323200000}) - this handles both. Dictionary-encoded columns (schema
 * entry has DN) index ValueDicts.
 */
export function decodeDsrRows(
  ds: { PH?: { DM0?: DsrRow[] }[]; ValueDicts?: Record<string, (string | number)[]> }
): (string | number | null)[][] {
  const dm0 = ds.PH?.[0]?.DM0 ?? [];
  if (!dm0.length) return [];
  const schema = dm0[0].S ?? [];
  const ncol = schema.length;
  const dicts = ds.ValueDicts ?? {};
  const prev: (string | number | null)[] = new Array(ncol).fill(null);
  const out: (string | number | null)[][] = [];
  for (const row of dm0) {
    const c = row.C ?? [];
    const repeat = row.R ?? 0;
    const nulls = row["Ø"] ?? 0;
    const vals: (string | number | null)[] = [];
    let ci = 0;
    for (let i = 0; i < ncol; i++) {
      const name = schema[i].N;
      let v: string | number | null;
      if (nulls & (1 << i)) {
        v = null;
      } else if (repeat & (1 << i)) {
        v = prev[i];
      } else if (Object.hasOwn(row, name)) {
        // Named-key form: the value is on the row under its select name.
        v = (row as Record<string, string | number | null>)[name];
      } else {
        v = c[ci++] ?? null;
      }
      const dn = schema[i].DN;
      if (dn && typeof v === "number" && dicts[dn]) v = dicts[dn][v];
      vals.push(v);
    }
    for (let i = 0; i < ncol; i++) prev[i] = vals[i];
    out.push(vals);
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST a semantic query to the public report, with retry/backoff. Throws on a
 * persistent non-2xx or a Power BI error payload, so a relabelled model / moved
 * cluster fails loudly rather than writing an empty window. */
async function postQueryData(
  query: unknown,
  label: string
): Promise<{
  PH?: { DM0?: DsrRow[] }[];
  ValueDicts?: Record<string, (string | number)[]>;
}> {
  const body = JSON.stringify({
    version: "1.0.0",
    queries: [
      {
        Query: { Commands: [{ SemanticQueryDataShapeCommand: query }] },
        ApplicationContext: { DatasetId: WA_PBI_DATASET_ID },
      },
    ],
    cancelQueries: [],
    modelId: WA_PBI_MODEL_ID,
  });
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(500 * 2 ** (attempt - 1)); // 0.5s, 1s, 2s backoff
    try {
      const res = await fetch(WA_PBI_QUERYDATA_URL, {
        method: "POST",
        headers: {
          "X-PowerBI-ResourceKey": WA_PBI_RESOURCE_KEY,
          "Content-Type": "application/json;charset=UTF-8",
        },
        body,
      });
      if (!res.ok) {
        lastErr = new Error(`Power BI querydata ${res.status} for ${label}`);
        continue;
      }
      const json = (await res.json()) as {
        results?: { result?: { data?: { dsr?: unknown } } }[];
        error?: { code?: string };
      };
      if (json.error) {
        throw new Error(
          `Power BI returned error "${json.error.code}" for ${label} - the model or key changed`
        );
      }
      const dsr = json.results?.[0]?.result?.data?.dsr as
        | { DS?: { PH?: { DM0?: DsrRow[] }[]; ValueDicts?: Record<string, (string | number)[]> }[] }
        | undefined;
      const ds = dsr?.DS?.[0];
      if (!ds) throw new Error(`Power BI response had no data window for ${label}`);
      return ds;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Power BI fetch failed for ${label}`);
}

/** "YYYY-MM" label for a Power BI Month Start Date (epoch ms, month-aligned). */
function monthLabel(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Discover the model's distinct month-start epochs (descending). */
async function fetchMonthList(): Promise<{ epochMs: number; label: string }[]> {
  const ds = await postQueryData(
    {
      Query: {
        Version: 2,
        From: [{ Name: "o", Entity: WA_PBI_ENTITY, Type: 0 }],
        Select: [
          {
            Column: {
              Expression: { SourceRef: { Source: "o" } },
              Property: "Month Start Date",
            },
            Name: "o.Month",
          },
        ],
        OrderBy: [
          {
            Direction: 2,
            Expression: {
              Column: {
                Expression: { SourceRef: { Source: "o" } },
                Property: "Month Start Date",
              },
            },
          },
        ],
      },
      Binding: {
        Primary: { Groupings: [{ Projections: [0] }] },
        DataReduction: { DataVolume: 3, Primary: { Window: { Count: 1000 } } },
        Version: 1,
      },
    },
    "month list"
  );
  const rows = decodeDsrRows(ds);
  const months = rows
    .map((r) => Number(r[0]))
    .filter((n) => Number.isFinite(n))
    .map((epochMs) => ({ epochMs, label: monthLabel(epochMs) }));
  if (!months.length) throw new Error("WA Power BI returned no months");
  return months.sort((a, b) => b.epochMs - a.epochMs);
}

/** Pull one month's statewide locality x classified-category counts. */
async function fetchMonth(
  epochMs: number,
  label: string
): Promise<Record<string, { category: string; offences: number }[]>> {
  const iso = new Date(epochMs).toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS
  const ds = await postQueryData(
    {
      Query: {
        Version: 2,
        From: [{ Name: "o", Entity: WA_PBI_ENTITY, Type: 0 }],
        Select: [
          {
            Column: { Expression: { SourceRef: { Source: "o" } }, Property: "Sub_Txt" },
            Name: "o.Sub",
          },
          {
            Column: {
              Expression: { SourceRef: { Source: "o" } },
              Property: "Offence Category",
            },
            Name: "o.Cat",
          },
          {
            Aggregation: {
              Expression: {
                Column: {
                  Expression: { SourceRef: { Source: "o" } },
                  Property: "# Offences",
                },
              },
              Function: 0,
            },
            Name: "o.Sum",
          },
        ],
        Where: [
          {
            Condition: {
              Comparison: {
                ComparisonKind: 0,
                Left: {
                  Column: {
                    Expression: { SourceRef: { Source: "o" } },
                    Property: "Month Start Date",
                  },
                },
                Right: { Literal: { Value: `datetime'${iso}'` } },
              },
            },
          },
        ],
      },
      Binding: {
        Primary: { Groupings: [{ Projections: [0, 1, 2] }] },
        DataReduction: { DataVolume: 4, Primary: { Window: { Count: 30000 } } },
        Version: 1,
      },
    },
    label
  );
  const rows = decodeDsrRows(ds);
  const byLocality: Record<string, { category: string; offences: number }[]> = {};
  for (const r of rows) {
    const sub = String(r[0] ?? "").trim();
    const cat = String(r[1] ?? "").trim();
    const n = Number(r[2]);
    if (!sub || !cat || !classifyWaOffence(cat) || !Number.isFinite(n)) continue;
    (byLocality[sub] ??= []).push({ category: cat, offences: n });
  }
  return byLocality;
}

type MonthCache = {
  month: string;
  fetchedAt: string;
  byLocality: Record<string, { category: string; offences: number }[]>;
};

/** CSV-quote a field (quotes doubled) - locality names can hold commas. */
function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Fetch (or load from the per-period cache) the latest twelve months of WA
 * locality offences and assemble the combined rolling-window CSV. Historical
 * months are immutable, so a warm cache re-fetches only the newest month; a cold
 * cache fetches twelve, throttled to <=2 req/sec. Throws if the API never yields
 * a classifiable row, so a relabelled model fails loudly here too.
 */
export async function fetchWaCrime(rawDir: string): Promise<void> {
  const cacheDir = path.join(rawDir, WA_CRIME_CACHE_DIR);
  await mkdir(cacheDir, { recursive: true });

  const window = (await fetchMonthList()).slice(0, 12);
  if (!window.length) throw new Error("WA Power BI returned no months for the window");

  const ordered = [...window].sort((a, b) => a.epochMs - b.epochMs); // oldest -> newest
  const monthData: MonthCache[] = [];
  let fetched = 0;
  for (const m of ordered) {
    const cacheFile = path.join(cacheDir, `wa-crime-${m.label}.json`);
    let cached: MonthCache | null = null;
    try {
      const parsed = JSON.parse(await readFile(cacheFile, "utf8")) as MonthCache;
      if (parsed?.month === m.label && parsed.byLocality) cached = parsed;
    } catch {
      /* miss - fetch below */
    }
    if (!cached) {
      const byLocality = await fetchMonth(m.epochMs, `month ${m.label}`);
      cached = { month: m.label, fetchedAt: new Date().toISOString(), byLocality };
      await writeFile(cacheFile, JSON.stringify(cached) + "\n");
      fetched++;
      await sleep(500); // polite: <=2 req/sec
    }
    monthData.push(cached);
  }

  // Assemble the combined CSV (deterministic: locality, then month order).
  const lines = ["Suburb,Offence Category,Month,Offences"];
  for (const m of monthData) {
    const localities = Object.keys(m.byLocality).sort();
    for (const loc of localities) {
      for (const { category, offences } of m.byLocality[loc]) {
        lines.push(
          `${csvField(loc)},${csvField(category)},${m.month},${offences}`
        );
      }
    }
  }
  if (lines.length <= 1) {
    throw new Error("WA Power BI yielded no classifiable offence rows - the model changed");
  }

  const dest = path.join(rawDir, WA_CRIME_RAW_FILE);
  const tmp = `${dest}.tmp`;
  const out = createWriteStream(tmp);
  if (!out.write(lines.join("\n") + "\n")) await once(out, "drain");
  out.end();
  await once(out, "finish");
  await rm(dest, { force: true });
  await rename(tmp, dest);

  const latest = window[0].label;
  console.log(
    `  ${WA_CRIME_RAW_FILE} (${monthData.length} months to ${latest}, ` +
      `${fetched} fetched / ${monthData.length - fetched} cached)`
  );
}

/**
 * Throw unless `file` looks like the combined WA CSV (header mentions "Suburb"
 * and "Offence Category", not an HTML page) - the analogue of
 * assertNswCrimeCsvFile.
 */
export async function assertWaCrimeCsvFile(file: string): Promise<void> {
  const fh = await open(file, "r");
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(256), 0, 256, 0);
    const head = buffer.subarray(0, bytesRead).toString("utf8");
    if (head.trimStart().startsWith("<") || !/suburb/i.test(head) || !/offence category/i.test(head)) {
      throw new Error(
        `${file} is not the WA "Suburb,Offence Category,..." CSV - the fetch failed or served an HTML page`
      );
    }
  } finally {
    await fh.close();
  }
}

/** Listed for completeness / debugging: the cached period files present. */
export async function listWaCrimeCache(rawDir: string): Promise<string[]> {
  try {
    return (await readdir(path.join(rawDir, WA_CRIME_CACHE_DIR)))
      .filter((f) => /^wa-crime-\d{4}-\d{2}\.json$/.test(f))
      .sort();
  } catch {
    return [];
  }
}
