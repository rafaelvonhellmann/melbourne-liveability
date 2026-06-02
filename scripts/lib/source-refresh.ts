/**
 * Refresh cadence + upstream "last updated" probes per source.
 *
 * Used by check-freshness.ts to decide, automatically, when our committed data
 * is due for a refresh — instead of relying on someone remembering to re-run
 * the pipeline. ArcGIS layers expose editingInfo.lastEditDate; CKAN resources
 * expose last_modified. Sources with no cheap probe fall back to cadence only.
 */

export type Cadence = "rolling" | "quarterly" | "annual" | "census";

/** Approximate months between expected upstream editions. */
export const CADENCE_MONTHS: Record<Cadence, number> = {
  rolling: 1,
  quarterly: 3,
  annual: 12,
  census: 60,
};

export type Probe =
  | { type: "arcgis"; url: string }
  | { type: "ckan"; dataset: string; match?: string }
  | { type: "none" };

const ABS = (service: string) =>
  `https://services-ap1.arcgis.com/ypkPEy1AmwPKGNNv/arcgis/rest/services/${service}/FeatureServer/0`;

export const SOURCE_REFRESH: Record<
  string,
  { cadence: Cadence; probe: Probe }
> = {
  "abs-sa2-income-dbr": {
    cadence: "annual",
    probe: { type: "arcgis", url: ABS("SA2_income_DbR_Nov25") },
  },
  "abs-census-rent-2021": {
    cadence: "census",
    probe: { type: "arcgis", url: ABS("ABS_Family_and_community_by_2021_SA2") },
  },
  "abs-census-community-2021": {
    cadence: "census",
    probe: { type: "arcgis", url: ABS("ABS_Family_and_community_by_2021_SA2") },
  },
  "abs-erp-sa2": {
    cadence: "annual",
    probe: { type: "arcgis", url: ABS("ABS_ERP_2001_2023_SA2") },
  },
  "abs-census-labour-2016": {
    cadence: "census",
    probe: { type: "arcgis", url: ABS("ABS_Education_and_employment_by_2021_SA2") },
  },
  "abs-census-preschool-2021": {
    cadence: "census",
    probe: { type: "arcgis", url: ABS("ABS_Education_and_employment_by_2021_SA2") },
  },
  "abs-seifa-2021": {
    cadence: "census",
    probe: {
      type: "arcgis",
      url: ABS("ABS_Socio_Economic_Indexes_for_Areas_SEIFA_by_2021_SA2"),
    },
  },
  "vcsa-recorded-offences": {
    cadence: "quarterly",
    probe: {
      type: "ckan",
      dataset: "data-tables-recorded-offences",
      match: "LGA.*Recorded",
    },
  },
  "vic-mapshare-hospitals": {
    cadence: "annual",
    probe: {
      type: "arcgis",
      url: "https://enterprise.mapshare.vic.gov.au/server/rest/services/Hosted/Emergency_Services__VMFEAT_FOI_POINT_/FeatureServer/0",
    },
  },
  "vicmap-police": {
    cadence: "annual",
    probe: {
      type: "arcgis",
      url: "https://enterprise.mapshare.vic.gov.au/server/rest/services/Hosted/Emergency_Services__VMFEAT_FOI_POINT_/FeatureServer/0",
    },
  },
  "vicmap-foi": {
    cadence: "annual",
    probe: {
      type: "arcgis",
      url: "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Features_of_Interest/FeatureServer/1",
    },
  },
  "vic-planning-bpa": {
    cadence: "annual",
    probe: {
      type: "arcgis",
      url: "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Planning/FeatureServer/9",
    },
  },
  "vic-planning-flood": {
    cadence: "annual",
    probe: {
      type: "arcgis",
      url: "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/Planning/Vicplan_PlanningSchemeOverlays/MapServer/15",
    },
  },
  "vic-planning-heritage": {
    cadence: "annual",
    probe: {
      type: "arcgis",
      url: "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/Planning/Vicplan_PlanningSchemeOverlays/MapServer/9",
    },
  },
  "ptv-gtfs": { cadence: "rolling", probe: { type: "none" } },
  "osm-pt": { cadence: "rolling", probe: { type: "none" } },
  "osm-health": { cadence: "rolling", probe: { type: "none" } },
  "osm-schools": { cadence: "rolling", probe: { type: "none" } },
  "osm-amenities": { cadence: "rolling", probe: { type: "none" } },
  "osm-cycleways": { cadence: "rolling", probe: { type: "none" } },
};

const UA = "MelbourneLiveability/1.0";

async function fetchJson(url: string, timeoutMs = 15000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Returns the upstream last-updated date (ISO) or null if not probeable. */
export async function probeLastUpdated(probe: Probe): Promise<string | null> {
  if (probe.type === "none") return null;

  if (probe.type === "arcgis") {
    const j = (await fetchJson(`${probe.url}?f=json`)) as
      | { editingInfo?: { lastEditDate?: number; dataLastEditDate?: number } }
      | null;
    const ms =
      j?.editingInfo?.dataLastEditDate ?? j?.editingInfo?.lastEditDate ?? null;
    return ms ? new Date(ms).toISOString().slice(0, 10) : null;
  }

  // CKAN
  const j = (await fetchJson(
    `https://discover.data.vic.gov.au/api/3/action/package_show?id=${probe.dataset}`
  )) as
    | { result?: { resources?: { name?: string; last_modified?: string }[] } }
    | null;
  const resources = j?.result?.resources ?? [];
  const re = probe.match ? new RegExp(probe.match, "i") : null;
  let latest: string | null = null;
  for (const r of resources) {
    if (re && !re.test(r.name ?? "")) continue;
    if (r.last_modified && (!latest || r.last_modified > latest)) {
      latest = r.last_modified;
    }
  }
  return latest ? latest.slice(0, 10) : null;
}
