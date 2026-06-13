/**
 * Downloads and normalizes ABS SEIFA 2021 SA1 index deciles.
 *
 * Manual prerequisite for data:pockets. The output is deliberately separate
 * from the SA2 SEIFA flow in normalize.ts.
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import "./lib/xlsx-fs.js";
import { RAW } from "./lib/paths.js";

export const SEIFA_SA1_RAW_FILE = "abs-seifa-sa1-2021.json";
export const SEIFA_SA1_URL =
  "https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia/2021/Statistical%20Area%20Level%201%2C%20Indexes%2C%20SEIFA%202021.xlsx";

export type SeifaSa1Row = {
  sa1Code: string;
  irsadDecile: number | null;
  irsdDecile: number | null;
};

function normHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function hasText(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

function toCode(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\.0$/, "").replace(/\D/g, "");
  return digits || null;
}

export function parseNullableDecile(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const decile = Math.trunc(n);
  return decile >= 1 && decile <= 10 ? decile : null;
}

function findSa1CodeColumn(headers: string[]): number {
  return headers.findIndex((h) => h === "sa1code2021" || h.includes("sa1code2021"));
}

function findDecileColumn(headers: string[], index: "irsad" | "irsd"): number {
  const exact = [
    `${index}ausdecile`,
    `${index}australiadecile`,
    `${index}nationaldecile`,
    `${index}decile`,
  ];
  for (const wanted of exact) {
    const col = headers.findIndex((h) => h === wanted || h.endsWith(wanted));
    if (col >= 0) return col;
  }
  const nonState = headers.findIndex(
    (h) =>
      h.includes(index) &&
      h.includes("decile") &&
      !h.includes("state") &&
      !h.includes("territory")
  );
  if (nonState >= 0) return nonState;
  return headers.findIndex((h) => h.includes(index) && h.includes("decile"));
}

function combinedHeaders(rows: unknown[][], headerRow: number): string[] {
  const row = rows[headerRow] ?? [];
  const prev = rows[headerRow - 1] ?? [];
  const width = Math.max(row.length, prev.length);
  const headers: string[] = [];
  let group = "";
  for (let i = 0; i < width; i++) {
    if (hasText(prev[i])) group = String(prev[i]);
    headers[i] = normHeader(`${group} ${row[i] ?? ""}`);
  }
  return headers;
}

export function parseSeifaSa1Workbook(data: Buffer | Uint8Array): SeifaSa1Row[] {
  const wb = XLSX.read(data, { type: "buffer" });
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    for (let headerRow = 0; headerRow < Math.min(rows.length, 40); headerRow++) {
      const headers = combinedHeaders(rows, headerRow);
      const codeCol = findSa1CodeColumn(headers);
      const irsadCol = findDecileColumn(headers, "irsad");
      const irsdCol = findDecileColumn(headers, "irsd");
      if (codeCol < 0 || irsadCol < 0 || irsdCol < 0) continue;

      const out: SeifaSa1Row[] = [];
      for (const row of rows.slice(headerRow + 1)) {
        const sa1Code = toCode(row[codeCol]);
        if (!sa1Code || !/^\d{11}$/.test(sa1Code)) continue;
        out.push({
          sa1Code,
          irsadDecile: parseNullableDecile(row[irsadCol]),
          irsdDecile: parseNullableDecile(row[irsdCol]),
        });
      }
      if (out.length > 0) return out;
    }
  }
  throw new Error("SEIFA SA1 workbook did not contain SA1_CODE_2021 + IRSAD/IRSD deciles");
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function fetchSeifaSa1Rows(): Promise<SeifaSa1Row[]> {
  const res = await fetch(SEIFA_SA1_URL, {
    headers: { "User-Agent": "MelbourneLiveability/1.0" },
  });
  if (!res.ok) throw new Error(`SEIFA SA1 download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return parseSeifaSa1Workbook(buf);
}

export async function main() {
  await mkdir(RAW, { recursive: true });
  const out = path.join(RAW, SEIFA_SA1_RAW_FILE);
  if (await exists(out)) {
    console.log(`SEIFA SA1 raw exists, skipping download: ${out}`);
    return;
  }
  console.log("Downloading ABS SEIFA 2021 SA1 indexes...");
  const rows = await fetchSeifaSa1Rows();
  await writeFile(out, JSON.stringify(rows), "utf8");
  console.log(`Wrote ${out} (${rows.length} SA1 rows)`);
}

const invokedDirectly =
  process.argv[1] != null &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
