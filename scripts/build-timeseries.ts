/**
 * Builds data/generated/timeseries.json (+ copies to public/data) - historical
 * trend context for the metric cards. Compilation, NOT a scoring engine: these
 * series are never fed into any score, and we only emit indicators where genuine
 * multi-period data is held. No interpolation, no extrapolation.
 *
 * Indicators shipped (Phase 1 - the series that need NO 2016→2021 SA2
 * concordance, so they carry no silent boundary break):
 *   • population     - ABS ERP, annual 2001–2023, per SA2 (ABS already supplies
 *                      the whole series on 2021 SA2 boundaries → no concordance).
 *   • propertyCrime  - VCSA recorded offences, year-ending-September 2016–2025,
 *                      per LGA (native LGA geography; rate per 100,000 from the
 *                      release's own LGA population denominators).
 *   • violentCrime   - VCSA recorded offences, as above.
 *
 * Deferred (documented in methodology/HANDOVER, NOT faked here): the 2-point
 * ABS Census/SEIFA 2016↔2021 panel (needs the ASGS SA2 correspondence) and a
 * DFFH rental series. We deliberately avoid shipping any 2016-SA2-boundary
 * values rather than silently mixing boundaries.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import { RAW, GENERATED, PUBLIC_DATA } from "./lib/paths.js";
import { loadMelbourneSa2Codes } from "./lib/melbourne-sa2-codes.js";
import { fetchArcGisTable } from "./lib/arcgis-fetch.js";
import { normaliseLgaKey } from "../lib/timeseries.js";
import type {
  IndicatorSeries,
  TimeseriesFile,
  TimeseriesPoint,
} from "../lib/types.js";

const ERP_YEARS = Array.from({ length: 2023 - 2001 + 1 }, (_, i) => 2001 + i);

/** ABS ERP 2001–2023 per SA2 → an annual population series (geo: sa2). */
async function buildPopulationSeries(): Promise<IndicatorSeries | null> {
  const codes = await loadMelbourneSa2Codes();
  const outFields = [
    "sa2_code_2021",
    ...ERP_YEARS.map((y) => `erp_no_${y}`),
  ].join(",");
  let rows: Record<string, string | number>[];
  try {
    rows = await fetchArcGisTable("ABS_ERP_2001_2023_SA2", 0, {
      codes,
      outFields,
    });
  } catch (e) {
    console.warn("  Population (ERP) fetch failed:", (e as Error).message);
    return null;
  }

  // Persist the raw multi-year extract for provenance hashing (sha256 in
  // sources.json via hash-sources.ts). Single-year `abs-sa2-erp.json` is kept
  // separately for the snapshot pipeline.
  await mkdir(RAW, { recursive: true });
  await writeFile(
    path.join(RAW, "abs-sa2-erp-series.json"),
    JSON.stringify(rows)
  );

  const points: TimeseriesPoint[] = ERP_YEARS.map((y) => ({
    period: String(y),
    values: {},
  }));
  const byYear = new Map(points.map((p) => [p.period, p]));

  for (const row of rows) {
    const code = String(row.sa2_code_2021 ?? "");
    if (!code) continue;
    for (const y of ERP_YEARS) {
      const v = Number(row[`erp_no_${y}`]);
      if (Number.isFinite(v)) byYear.get(String(y))!.values[code] = Math.round(v);
    }
  }

  const nonEmpty = points.filter((p) => Object.keys(p.values).length > 0);
  console.log(
    `  Population (ERP): ${nonEmpty.length} years, ${rows.length} SA2 rows`
  );
  if (nonEmpty.length < 2) return null;

  return {
    indicator: "population",
    label: "Resident population (ERP)",
    unit: "people",
    geo: "sa2",
    cadence: "annual",
    compareMode: "value",
    higherIsBetter: true,
    periodLabel: "estimated resident population, 30 June",
    sourceId: "abs-erp-sa2-series",
    boundaryNote:
      "ABS supplies the full 2001–2023 series on 2021 ASGS SA2 boundaries, so no 2016→2021 concordance is applied and no boundary break is introduced.",
    points: nonEmpty,
  };
}

const CRIME_YEARS = Array.from({ length: 2025 - 2016 + 1 }, (_, i) => 2016 + i);

type CrimeAccum = { property: number; violent: number };

/**
 * VCSA Table 02 (LGA) → property/violent recorded-offence rate per 100,000,
 * year-ending September. We sum the release's own "LGA Rate per 100,000
 * population" across offence subgroups within a division (rows are unique per
 * LGA/year/subgroup, so this is exact and uses the correct per-year LGA
 * population denominator). Native LGA geography - never implies SA2 precision.
 */
function buildCrimeSeries(): IndicatorSeries[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.readFile(path.join(RAW, "vcsa-lga-offences.xlsx"));
  } catch (e) {
    console.warn("  Crime XLSX not loaded:", (e as Error).message);
    return [];
  }
  const sheetName = wb.SheetNames.find((n) => /^Table 02/i.test(n));
  if (!sheetName) {
    console.warn("  Crime: Table 02 sheet not found");
    return [];
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets[sheetName],
    { defval: "" }
  );

  // lgaKey → year → {property, violent} summed rate per 100,000.
  const byLga = new Map<string, Map<number, CrimeAccum>>();
  for (const row of rows) {
    const lgaRaw = String(row["Local Government Area"] ?? "").trim();
    const year = Number(row["Year"]);
    const division = String(row["Offence Division"] ?? "");
    const rate = Number(row["LGA Rate per 100,000 population"]);
    if (!lgaRaw || !Number.isFinite(year) || !Number.isFinite(rate)) continue;
    let kind: keyof CrimeAccum | null = null;
    if (/^B\s/.test(division)) kind = "property";
    else if (/^A\s/.test(division)) kind = "violent";
    if (!kind) continue;
    const key = normaliseLgaKey(lgaRaw);
    let years = byLga.get(key);
    if (!years) byLga.set(key, (years = new Map()));
    const acc = years.get(year) ?? { property: 0, violent: 0 };
    acc[kind] += rate;
    years.set(year, acc);
  }

  const mkPoints = (kind: keyof CrimeAccum): TimeseriesPoint[] =>
    CRIME_YEARS.map((y) => {
      const values: Record<string, number> = {};
      for (const [lgaKey, years] of byLga) {
        const acc = years.get(y);
        if (acc) values[lgaKey] = Math.round(acc[kind] * 10) / 10;
      }
      return { period: String(y), values };
    }).filter((p) => Object.keys(p.values).length > 0);

  const boundaryNote =
    "Native LGA geography (not SA2). Rate per 100,000 uses the release's own per-year LGA population. Moreland is matched to its post-2022 name Merri-bek (boundary unchanged).";

  const property: IndicatorSeries = {
    indicator: "propertyCrime",
    label: "Property crime rate",
    unit: "per 100k",
    geo: "lga",
    cadence: "annual",
    compareMode: "value",
    higherIsBetter: false,
    periodLabel: "year ending September",
    sourceId: "vcsa-recorded-offences",
    boundaryNote,
    points: mkPoints("property"),
  };
  const violent: IndicatorSeries = {
    indicator: "violentCrime",
    label: "Violent crime rate",
    unit: "per 100k",
    geo: "lga",
    cadence: "annual",
    compareMode: "value",
    higherIsBetter: false,
    periodLabel: "year ending September",
    sourceId: "vcsa-recorded-offences",
    boundaryNote,
    points: mkPoints("violent"),
  };

  console.log(
    `  Crime: ${byLga.size} LGAs, property ${property.points.length} years, violent ${violent.points.length} years`
  );
  return [property, violent].filter((s) => s.points.length >= 2);
}

const AFFORD_YEARS = ["2011", "2016", "2021"];

type T02Year = { income?: number; mortgage?: number; rent?: number };

/**
 * ABS Census 2021 Time Series Profile (C21_T02_SA2) median household income,
 * mortgage repayment and rent by SA2 for 2011/2016/2021 - the ABS recompiles all
 * three onto 2021 SA2 boundaries, so NO concordance is applied. Returns a
 * ratio-of-MEDIANS affordability trend (median housing cost / median income),
 * which is a different, weaker measure than a household >30%-stress share and is
 * labelled as such. Context only, never scored.
 */
async function fetchT02(): Promise<Record<string, Record<string, T02Year>> | null> {
  const url =
    "https://data.api.abs.gov.au/rest/data/ABS,C21_T02_SA2,1.0.0/4+5+6..SA2.2" +
    "?startPeriod=2011&dimensionAtObservation=AllDimensions";
  let json: {
    data?: { structures?: { dimensions?: { observation?: { id: string; values: { id: string }[] }[] } }[]; dataSets?: { observations?: Record<string, (number | null)[]> }[] };
  };
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.sdmx.data+json", "User-Agent": "MelbourneLiveability/1.0" },
    });
    if (!res.ok) {
      console.warn(`  Affordability (T02) fetch ${res.status}`);
      return null;
    }
    json = await res.json();
  } catch (e) {
    console.warn("  Affordability fetch failed:", (e as Error).message);
    return null;
  }
  const dims = json.data?.structures?.[0]?.dimensions?.observation;
  const obs = json.data?.dataSets?.[0]?.observations;
  if (!dims || !obs) return null;
  const mi = dims.findIndex((d) => d.id === "MEDAVG");
  const ri = dims.findIndex((d) => d.id === "REGION");
  const ti = dims.findIndex((d) => d.id === "TIME_PERIOD");
  if (mi < 0 || ri < 0 || ti < 0) {
    console.warn(`  Affordability (T02) dims not found (MEDAVG=${mi} REGION=${ri} TIME=${ti}) - skipping`);
    return null;
  }
  const medVals = dims[mi].values;
  const regVals = dims[ri].values;
  const timeVals = dims[ti].values;
  const out: Record<string, Record<string, T02Year>> = {};
  for (const [key, arr] of Object.entries(obs)) {
    const pos = key.split(":").map(Number);
    const med = medVals[pos[mi]]?.id;
    const sa2 = regVals[pos[ri]]?.id;
    const year = timeVals[pos[ti]]?.id;
    const val = Number(arr?.[0]);
    if (!med || !sa2 || !year || !Number.isFinite(val)) continue;
    const rec = (out[sa2] ??= {});
    const yr = (rec[year] ??= {});
    if (med === "4") yr.income = val;
    else if (med === "5") yr.mortgage = val;
    else if (med === "6") yr.rent = val;
  }
  return out;
}

async function buildAffordabilitySeries(): Promise<IndicatorSeries[]> {
  const data = await fetchT02();
  if (!data) return [];
  await mkdir(RAW, { recursive: true });
  await writeFile(path.join(RAW, "abs-sa2-affordability.json"), JSON.stringify(data));

  const mkPoints = (calc: (y: T02Year) => number | null): TimeseriesPoint[] =>
    AFFORD_YEARS.map((period) => {
      const values: Record<string, number> = {};
      for (const [sa2, byYear] of Object.entries(data)) {
        const y = byYear[period];
        if (!y) continue;
        const v = calc(y);
        if (v != null && Number.isFinite(v)) values[sa2] = Math.round(v * 10) / 10;
      }
      return { period, values };
    }).filter((p) => Object.keys(p.values).length > 0);

  // Mortgage is $/month, income + rent are $/week -> convert mortgage to weekly.
  const mortgage = mkPoints((y) => (y.mortgage && y.income ? ((y.mortgage * 12) / 52 / y.income) * 100 : null));
  const rent = mkPoints((y) => (y.rent && y.income ? (y.rent / y.income) * 100 : null));
  const boundaryNote =
    "Ratio of MEDIANS (median housing cost divided by median household income), NOT a household >30%-stress share - a weaker affordability proxy. ABS 2021 Time Series Profile recompiles 2011 + 2016 onto 2021 SA2 boundaries, so no concordance is applied here.";

  const series: IndicatorSeries[] = [];
  if (mortgage.length >= 2)
    series.push({
      indicator: "mortgageToIncomeMedianPct",
      label: "Mortgage-to-income (median)",
      unit: "% of income",
      geo: "sa2",
      cadence: "census-5yr",
      compareMode: "value",
      higherIsBetter: false,
      periodLabel: "Census year",
      sourceId: "abs-census-tsp-sa2",
      boundaryNote,
      points: mortgage,
    });
  if (rent.length >= 2)
    series.push({
      indicator: "rentToIncomeMedianPct",
      label: "Rent-to-income (median)",
      unit: "% of income",
      geo: "sa2",
      cadence: "census-5yr",
      compareMode: "value",
      higherIsBetter: false,
      periodLabel: "Census year",
      sourceId: "abs-census-tsp-sa2",
      boundaryNote,
      points: rent,
    });
  console.log(
    `  Affordability: mortgage ${mortgage.length} yrs, rent ${rent.length} yrs, ${Object.keys(data).length} SA2`
  );
  return series;
}

async function main() {
  console.log("Building timeseries.json (historical trend context)...");

  const series: Record<string, IndicatorSeries> = {};

  console.log("ABS ERP population series (2001–2023, SA2)...");
  const pop = await buildPopulationSeries();
  if (pop) series[pop.indicator] = pop;

  console.log("VCSA crime series (2016–2025, LGA)...");
  for (const s of buildCrimeSeries()) series[s.indicator] = s;

  console.log("ABS affordability ratio-of-medians (2011/2016/2021, SA2)...");
  for (const s of await buildAffordabilitySeries()) series[s.indicator] = s;

  const file: TimeseriesFile = {
    generatedAt: new Date().toISOString(),
    series,
  };

  const json = JSON.stringify(file);
  await mkdir(GENERATED, { recursive: true });
  await writeFile(path.join(GENERATED, "timeseries.json"), json);
  await mkdir(PUBLIC_DATA, { recursive: true });
  await writeFile(path.join(PUBLIC_DATA, "timeseries.json"), json);

  const kb = (Buffer.byteLength(json) / 1024).toFixed(0);
  console.log(
    `\n✓ Wrote timeseries.json (${Object.keys(series).length} indicators: ${Object.keys(
      series
    ).join(", ")}; ~${kb} KB)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
