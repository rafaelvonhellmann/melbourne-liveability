/**
 * Decode the ABS Census 2021 "Non-school qualification: level of education"
 * table (dataflow ABS,C21_G49_SA2) SDMX-JSON into a compact per-SA2 share of
 * people whose highest non-school qualification is a bachelor degree or higher.
 * Context only, never scored.
 *
 * QALLP (qualification level) codes used:
 *   1  = Postgraduate Degree Level
 *   2  = Graduate Diploma / Graduate Certificate Level
 *   3  = Bachelor Degree Level
 *   _T = Total (the denominator the ABS supplies for this table)
 * bachelorPlusPct = 100 * (q1 + q2 + q3) / q_T, guarded on q_T > 0.
 *
 * Request with dimensionAtObservation=AllDimensions: each observation key is a
 * colon-joined list of positional indices into
 * data.structures[0].dimensions.observation[i].values; the value is arr[0].
 * Decoding is by dimension id (not a hard-coded key order) so a dataflow
 * dimension re-order cannot silently mis-map the figures.
 */
import { readFile } from "node:fs/promises";

/** Victorian SA2 codes are 9 digits beginning with 2 (state code 2). */
const VIC_SA2 = /^2\d{8}$/;

export type QualPlace = {
  name: string;
  /** % of the table total whose highest qualification is bachelor or higher. */
  bachelorPlusPct: number | null;
  /** % whose highest qualification is a postgraduate degree. */
  postgradPct: number | null;
};
export type QualificationsFile = {
  dataKey: string;
  period: string;
  places: Record<string, QualPlace>;
};

type SdmxDim = { id: string; values: { id: string; name?: string }[] };
type SdmxJson = {
  data?: {
    structures?: { dimensions?: { observation?: SdmxDim[] } }[];
    dataSets?: { observations?: Record<string, (number | null)[]> }[];
  };
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Decode SDMX-JSON into per-SA2 qualification shares, filtered to Victorian
 * SA2s. Pure (no I/O); throws if the response carries no dataset so a silent
 * empty build fails loudly. `qallpLabels` is returned for one-off verification
 * that the QALLP codes still mean what the formula assumes.
 */
export function decodeQualificationsSdmx(json: SdmxJson): {
  places: Record<string, QualPlace>;
  qallpLabels: Record<string, string>;
} {
  const struct = json.data?.structures?.[0];
  const dims = struct?.dimensions?.observation;
  const obs = json.data?.dataSets?.[0]?.observations;
  if (!dims || !obs) {
    throw new Error("ABS C21_G49_SA2: response has no observation dimensions / dataset");
  }
  const at = (id: string) => dims.findIndex((d) => d.id === id);
  const qi = at("QALLP");
  const ri = at("REGION");
  if (qi < 0 || ri < 0) {
    throw new Error(
      `ABS C21_G49_SA2: missing QALLP / REGION dimension (have: ${dims
        .map((d) => d.id)
        .join(", ")})`
    );
  }
  const qVals = dims[qi].values;
  const regVals = dims[ri].values;

  const acc: Record<string, Record<string, number>> = {};
  const names: Record<string, string> = {};
  for (const [key, arr] of Object.entries(obs)) {
    const pos = key.split(":").map(Number);
    const reg = regVals[pos[ri]];
    if (!reg || !VIC_SA2.test(reg.id)) continue;
    const val = Number(arr?.[0]);
    if (!Number.isFinite(val)) continue;
    const q = qVals[pos[qi]]?.id;
    if (!q) continue;
    (acc[reg.id] ??= {})[q] = val;
    names[reg.id] = reg.name ?? reg.id;
  }

  const places: Record<string, QualPlace> = {};
  for (const [sa2, q] of Object.entries(acc)) {
    const total = q["_T"];
    const bplus = (q["1"] ?? 0) + (q["2"] ?? 0) + (q["3"] ?? 0);
    const ok = Number.isFinite(total) && total > 0;
    places[sa2] = {
      name: names[sa2],
      bachelorPlusPct: ok ? round1((100 * bplus) / total) : null,
      postgradPct: ok ? round1((100 * (q["1"] ?? 0)) / total) : null,
    };
  }

  const qallpLabels = Object.fromEntries(qVals.map((v) => [v.id, v.name ?? v.id]));
  return { places, qallpLabels };
}

/** Load the compact data/raw/abs-sa2-qualifications.json into sa2 -> QualPlace. */
export async function readQualificationsFile(
  filePath: string
): Promise<Map<string, QualPlace>> {
  const out = new Map<string, QualPlace>();
  let parsed: QualificationsFile;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8")) as QualificationsFile;
  } catch {
    return out; // optional file: absent means "no pipeline data this build"
  }
  for (const [sa2, rec] of Object.entries(parsed.places ?? {})) {
    out.set(sa2, rec);
  }
  return out;
}
