/**
 * Decode the ABS Building Approvals (BA_SA2) SDMX-JSON 2.0 response into a
 * compact per-SA2 monthly series, and read that compact file back.
 *
 * Dataflow ABS,BA_SA2,2.0.0, dataKey 1.9.TOT.110+100.SA2..M:
 *   MEASURE=1 (dwelling units) . SECTOR=9 (total) . WORK_TYPE=TOT (all work) .
 *   BUILDING_TYPE=110 (Houses) + 100 (Total Residential) . REGION_TYPE=SA2 .
 *   REGION=(all) . FREQ=M (monthly).
 * At SA2 granularity ABS publishes only 110 + 100, so higher-density dwellings
 * are derived downstream as total - houses (townhouses + apartments + other).
 *
 * Request with dimensionAtObservation=AllDimensions: every dimension is an
 * observation dimension, and each observation key is a colon-joined list of
 * positional indices into data.structures[0].dimensions.observation[i].values.
 * The observation array's [0] element is the value.
 */
import { readFile } from "node:fs/promises";
import type { MonthlySeries } from "../../lib/approvals.js";

/** Victorian SA2 codes are 9 digits beginning with 2 (state code 2). */
const VIC_SA2 = /^2\d{8}$/;

export type ApprovalsPlace = { name: string; months: MonthlySeries };
export type ApprovalsFile = {
  dataKey: string;
  latestMonth: string;
  places: Record<string, ApprovalsPlace>;
};

type SdmxDim = { id: string; values: { id: string; name?: string }[] };
type SdmxJson = {
  data?: {
    structures?: { dimensions?: { observation?: SdmxDim[] } }[];
    dataSets?: { observations?: Record<string, (number | null)[]> }[];
  };
};

/**
 * Decode SDMX-JSON into { latestMonth, places: { sa2 -> {name, months} } },
 * filtered to Victorian SA2s. Pure (no I/O); throws if the response has no
 * dataset (so a silent empty build fails loudly).
 */
export function decodeApprovalsSdmx(json: SdmxJson): {
  latestMonth: string;
  places: Record<string, ApprovalsPlace>;
} {
  const struct = json.data?.structures?.[0];
  const dims = struct?.dimensions?.observation;
  const obs = json.data?.dataSets?.[0]?.observations;
  if (!dims || !obs) {
    throw new Error("ABS BA_SA2: response has no observation dimensions / dataset");
  }
  const at = (id: string) => dims.findIndex((d) => d.id === id);
  const bi = at("BUILDING_TYPE");
  const ri = at("REGION");
  const ti = at("TIME_PERIOD");
  if (bi < 0 || ri < 0 || ti < 0) {
    throw new Error("ABS BA_SA2: missing BUILDING_TYPE / REGION / TIME_PERIOD dimension");
  }
  const bldVals = dims[bi].values;
  const regVals = dims[ri].values;
  const timeVals = dims[ti].values;

  const places: Record<string, ApprovalsPlace> = {};
  let latestMonth = "";

  for (const [key, arr] of Object.entries(obs)) {
    const pos = key.split(":").map(Number);
    const reg = regVals[pos[ri]];
    if (!reg || !VIC_SA2.test(reg.id)) continue;
    const val = Number(arr?.[0]);
    if (!Number.isFinite(val)) continue;
    const bld = bldVals[pos[bi]]?.id;
    const month = timeVals[pos[ti]]?.id;
    if (!bld || !month) continue;

    let rec = places[reg.id];
    if (!rec) rec = places[reg.id] = { name: reg.name ?? reg.id, months: {} };
    let bucket = rec.months[month];
    if (!bucket) bucket = rec.months[month] = { total: 0, house: 0 };
    if (bld === "100") bucket.total = val;
    else if (bld === "110") bucket.house = val;
    if (month > latestMonth) latestMonth = month;
  }

  return { latestMonth, places };
}

/** Load the compact data/raw/abs-sa2-approvals.json into sa2 -> MonthlySeries. */
export async function readApprovalsFile(
  filePath: string
): Promise<Map<string, MonthlySeries>> {
  const out = new Map<string, MonthlySeries>();
  let parsed: ApprovalsFile;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8")) as ApprovalsFile;
  } catch {
    return out; // optional file: absent means "no pipeline data this build"
  }
  for (const [sa2, rec] of Object.entries(parsed.places ?? {})) {
    out.set(sa2, rec.months);
  }
  return out;
}
