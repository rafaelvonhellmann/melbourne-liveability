/**
 * Fetches the Dept of Health Modified Monash Model 2023 SA1 layer.
 *
 * Use the ArcGIS FeatureServer directly: the data.gov.au catalogue page can be
 * WAF-blocked for agents, while the authoritative service pages cleanly.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { assertBakeable, registryId } from "./lib/source-registry.js";

export const MMM_RAW_FILE = "mmm-sa1.json";

const SOURCE_ID = registryId("doh-mmm-2023");
const PAGE_SIZE = 2000;
const MMM_QUERY_URL =
  "https://services5.arcgis.com/OvOcYIrJnM97ABBA/arcgis/rest/services/Modified_Monash_Model_2023/FeatureServer/2/query";

type MmmRow = {
  SA1_CODE21?: string | number;
  MMM_CODE23?: string | number;
  MMM_NAME23?: string;
};

type ArcGisResponse = {
  features?: { attributes: MmmRow }[];
  error?: { message?: string; details?: string[] };
};

async function fetchPage(offset: number): Promise<MmmRow[]> {
  const url = new URL(MMM_QUERY_URL);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "SA1_CODE21,MMM_CODE23,MMM_NAME23");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(PAGE_SIZE));
  url.searchParams.set("orderByFields", "SA1_CODE21");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "MelbourneLiveability/1.0 (research)",
    },
  });
  if (!res.ok) throw new Error(`MMM FeatureServer ${res.status}`);
  const data = (await res.json()) as ArcGisResponse;
  if (data.error) {
    throw new Error(
      [data.error.message, ...(data.error.details ?? [])].filter(Boolean).join(" - ")
    );
  }
  return data.features?.map((f) => f.attributes) ?? [];
}

async function main() {
  assertBakeable(SOURCE_ID);
  await mkdir(RAW, { recursive: true });

  const rows: MmmRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchPage(offset);
    rows.push(...page);
    console.log(`MMM SA1 rows: ${rows.length}`);
    if (page.length < PAGE_SIZE) break;
  }

  await writeFile(path.join(RAW, MMM_RAW_FILE), JSON.stringify(rows));
  console.log(`Wrote ${MMM_RAW_FILE} (${rows.length} SA1 rows)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
