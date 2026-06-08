/**
 * Electorate at a dropped pin - a v2 civic lens. Point-in-polygon for the CURRENT
 * federal division (AEC 2025 boundaries) + Victorian state district (Vicmap
 * Admin) via ArcGIS Online (runtime, keyless, CORS-open), then merges the sitting
 * member + 2022 two-party-preferred margin from the pre-built aec-divisions.json.
 * Never throws. Context only - never scored.
 *
 * Margin is shown only for major-party seats (the 2PP is notional in Greens/
 * independent seats). CC BY 4.0 (AEC + State of Victoria).
 */
import type { LngLat } from "./buyer-location";
import { timeoutSignal } from "./fetch-timeout";
import { withBase } from "./asset-path";

const FED_URL =
  "https://services-ap1.arcgis.com/ypkPEy1AmwPKGNNv/ArcGIS/rest/services/Federal_Electoral_Boundaries_2025/FeatureServer/0/query";
const STATE_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/arcgis/rest/services/Vicmap_Admin/FeatureServer/15/query";

export const AEC_SOURCE_ID = "aec-federal-2022";
export const VEC_SOURCE_ID = "vic-state-districts";

export type Electorate = {
  federal?: { division: string; member?: string; party?: string; marginPct?: number };
  state?: { district: string; region?: string };
};

type AecDivision = { member: string; party: string; marginPct?: number };

let aecCache: Record<string, AecDivision> | null = null;
async function loadAec(): Promise<Record<string, AecDivision>> {
  if (aecCache) return aecCache;
  try {
    const res = await fetch(withBase("/data/aec-divisions.json"));
    aecCache = res.ok ? ((await res.json()) as Record<string, AecDivision>) : {};
  } catch {
    aecCache = {};
  }
  return aecCache;
}

/** Title-case an ALL-CAPS Vicmap name ("NORTHERN METROPOLITAN" -> "Northern Metropolitan"). */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Readable party name from an AEC abbreviation; falls back to the abbreviation. */
export function partyLabel(ab: string | undefined): string {
  const m: Record<string, string> = {
    ALP: "Labor",
    LP: "Liberal",
    LNP: "LNP",
    NP: "Nationals",
    NATS: "Nationals",
    CLP: "Country Liberal",
    GRN: "Greens",
    IND: "Independent",
    KAP: "Katter's Australian",
    CA: "Centre Alliance",
  };
  return ab ? (m[ab] ?? ab) : "";
}

async function pip(
  url: string,
  outFields: string,
  pin: LngLat,
  signal: AbortSignal
): Promise<Record<string, unknown> | null> {
  const u =
    `${url}?geometry=${pin[0]},${pin[1]}&geometryType=esriGeometryPoint&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=${outFields}&returnGeometry=false&f=json`;
  try {
    const res = await fetch(u, { signal });
    if (!res.ok) return null;
    const j = (await res.json()) as { features?: { attributes?: Record<string, unknown> }[] };
    return j.features?.[0]?.attributes ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the federal + state electorates at `pin` ([lng, lat]). Never throws:
 * returns null when neither resolves (off-coverage) or on failure.
 */
export async function fetchElectorate(
  pin: LngLat,
  opts: { signal?: AbortSignal } = {}
): Promise<Electorate | null> {
  const t = timeoutSignal(9000, opts.signal);
  try {
    const [fed, state, aec] = await Promise.all([
      pip(FED_URL, "elect_div", pin, t.signal),
      pip(STATE_URL, "district,region", pin, t.signal),
      loadAec(),
    ]);
    const out: Electorate = {};
    const div = fed?.elect_div ? String(fed.elect_div) : undefined;
    if (div) {
      const rec = aec[div];
      out.federal = { division: div, member: rec?.member, party: rec?.party, marginPct: rec?.marginPct };
    }
    const district = state?.district ? String(state.district) : undefined;
    if (district) {
      out.state = {
        district: titleCase(district),
        region: state?.region ? titleCase(String(state.region)) : undefined,
      };
    }
    return out.federal || out.state ? out : null;
  } catch {
    return null;
  } finally {
    t.clear();
  }
}
