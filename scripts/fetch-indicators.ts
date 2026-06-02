/**
 * Fetches indicator raw files into data/raw (gitignored).
 */
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { RAW } from "./lib/paths.js";
import { loadMelbourneSa2Codes } from "./lib/melbourne-sa2-codes.js";
import { fetchArcGisTable, overpassMelbourne } from "./lib/arcgis-fetch.js";
import { fetchVicHospitalPoints } from "./lib/vic-facilities.js";
import { G37_SERVICE, G37_FIELDS } from "../lib/social-housing.js";

const UA = "MelbourneLiveability/1.0";

async function download(url: string, dest: string) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`Download ${res.status}: ${url}`);
  await mkdir(path.dirname(dest), { recursive: true });
  if (res.body) {
    await pipeline(res.body as NodeJS.ReadableStream, createWriteStream(dest));
  }
}

async function main() {
  await mkdir(RAW, { recursive: true });
  const codes = await loadMelbourneSa2Codes();
  console.log(`Melbourne SA2 count: ${codes.length}`);

  console.log("ABS income (equiv weekly)...");
  const income = await fetchArcGisTable("SA2_income_DbR_Nov25", 0, {
    codes,
    where: "gccsa_code_2021='2GMEL'",
    outFields: "sa2_code_2021,equiv_22021",
  });
  await writeFile(
    path.join(RAW, "abs-sa2-income.json"),
    JSON.stringify(income)
  );

  console.log("ABS median rent (Census 2021)...");
  const rent = await fetchArcGisTable("ABS_Family_and_community_by_2021_SA2", 0, {
    codes,
    outFields: "sa2_code_2021,rent_42021",
  });
  await writeFile(path.join(RAW, "abs-sa2-rent.json"), JSON.stringify(rent));

  console.log("ABS ERP 2023...");
  const erp = await fetchArcGisTable("ABS_ERP_2001_2023_SA2", 0, {
    codes,
    outFields: "sa2_code_2021,erp_no_2023",
  });
  await writeFile(path.join(RAW, "abs-sa2-erp.json"), JSON.stringify(erp));

  console.log("ABS education & employment (Census 2016 labour force + 2021 preschool)...");
  const emp = await fetchArcGisTable("ABS_Education_and_employment_by_2021_SA2", 0, {
    codes,
    // high_22021 = % completed Year 12 or equivalent (education attainment, context).
    outFields: "sa2_code_2021,lf_62016,lf_52016,lf_22016,presch_82021,high_22021",
  });
  await writeFile(path.join(RAW, "abs-sa2-employment.json"), JSON.stringify(emp));

  console.log("ABS SEIFA 2021 (IRSAD / IRSD deciles)...");
  const seifa = await fetchArcGisTable(
    "ABS_Socio_Economic_Indexes_for_Areas_SEIFA_by_2021_SA2",
    0,
    { codes, outFields: "sa2_code_2021,irsad_aus_decile,irsd_aus_decile" }
  );
  await writeFile(path.join(RAW, "abs-sa2-seifa.json"), JSON.stringify(seifa));

  console.log("ABS family & community (tenure, dwelling structure)...");
  const fam = await fetchArcGisTable("ABS_Family_and_community_by_2021_SA2", 0, {
    codes,
    outFields:
      "sa2_code_2021,tenure_72021,tenure_82021,tenure_92021,tenure_102021,dwell_42021,dwell_72021",
  });
  await writeFile(path.join(RAW, "abs-sa2-community.json"), JSON.stringify(fam));

  console.log("ABS Census G37 (tenure + landlord type) social-housing supply...");
  const landlord = await fetchArcGisTable(G37_SERVICE, 0, {
    codes,
    outFields: G37_FIELDS,
  });
  await writeFile(path.join(RAW, "abs-sa2-landlord.json"), JSON.stringify(landlord));

  console.log("ABS Census G01 (First Nations population)...");
  const g01 = await fetchArcGisTable("ABS_2021_Census_G01_SA2", 0, {
    codes,
    outFields: "sa2_code_2021,indigenous_p_tot_p,tot_p_p",
  });
  await writeFile(path.join(RAW, "abs-sa2-indigenous.json"), JSON.stringify(g01));

  console.log("Vic MapShare hospitals...");
  try {
    const hospitals = await fetchVicHospitalPoints();
    await writeFile(
      path.join(RAW, "vic-hospitals.json"),
      JSON.stringify({ points: hospitals })
    );
    console.log(`  ${hospitals.length} hospitals in Melbourne envelope`);
  } catch (e) {
    console.warn("  Vic hospitals:", (e as Error).message);
  }

  console.log("VCSA crime (CKAN → XLSX)...");
  try {
    const pkg = await fetch(
      "https://discover.data.vic.gov.au/api/3/action/package_show?id=data-tables-recorded-offences",
      { headers: { "User-Agent": UA } }
    );
    const data = (await pkg.json()) as {
      result?: { resources?: { url: string; format: string; name: string }[] };
    };
    const xlsx = (data.result?.resources ?? [])
      .filter((r) => /xlsx/i.test(r.format ?? "") && /LGA.*Recorded/i.test(r.name ?? ""))
      .sort((a, b) => (b.name ?? "").localeCompare(a.name ?? ""))[0];
    if (xlsx?.url) {
      await download(xlsx.url, path.join(RAW, "vcsa-lga-offences.xlsx"));
      console.log(`  ${xlsx.name}`);
    }
  } catch (e) {
    console.warn("  Crime:", (e as Error).message);
  }

  console.log("Overpass PT stops...");
  const pt = await overpassMelbourne(`
    node["public_transport"~"platform|stop_position"](-38.35,144.45,-37.45,145.65);
    node["railway"="tram_stop"](-38.35,144.45,-37.45,145.65);
    node["highway"="bus_stop"](-38.35,144.45,-37.45,145.65);
  `);
  await writeFile(path.join(RAW, "osm-pt.json"), JSON.stringify(pt));

  console.log("Overpass hospitals + GP + police...");
  const health = await overpassMelbourne(`
    node["amenity"="hospital"](-38.35,144.45,-37.45,145.65);
    node["amenity"~"doctors|clinic|health_centre"](-38.35,144.45,-37.45,145.65);
    way["amenity"~"doctors|clinic|health_centre"](-38.35,144.45,-37.45,145.65);
    node["healthcare"~"doctor|clinic|centre"](-38.35,144.45,-37.45,145.65);
    node["amenity"="police"](-38.35,144.45,-37.45,145.65);
    way["amenity"="police"](-38.35,144.45,-37.45,145.65);
    node["office"="police"](-38.35,144.45,-37.45,145.65);
  `);
  await writeFile(path.join(RAW, "osm-health.json"), JSON.stringify(health));

  console.log("Overpass post offices (Australia Post / LPO)...");
  const post = await overpassMelbourne(`
    node["amenity"="post_office"](-38.35,144.45,-37.45,145.65);
    way["amenity"="post_office"](-38.35,144.45,-37.45,145.65);
    node["shop"="post_office"](-38.35,144.45,-37.45,145.65);
    node["post_office"="post_partner"](-38.35,144.45,-37.45,145.65);
  `);
  await writeFile(path.join(RAW, "osm-post.json"), JSON.stringify(post));

  // Pathology collection centres + NDIS/disability-related providers for the
  // context pin layers. Tagged sparsely in OSM (honest coverage caveat); these
  // pins are context-only and never scored. Classified in build-poi.ts.
  console.log("Overpass pathology labs + NDIS-related providers...");
  const clinical = await overpassMelbourne(`
    node["healthcare"~"laboratory|sample_collection"](-38.35,144.45,-37.45,145.65);
    way["healthcare"~"laboratory|sample_collection"](-38.35,144.45,-37.45,145.65);
    node["amenity"="clinic"]["healthcare:speciality"~"pathology|diagnostic"](-38.35,144.45,-37.45,145.65);
    node["social_facility"](-38.35,144.45,-37.45,145.65);
    node["office"~"association|ngo"](-38.35,144.45,-37.45,145.65);
    node["healthcare"="counselling"](-38.35,144.45,-37.45,145.65);
  `);
  await writeFile(
    path.join(RAW, "osm-clinical-social.json"),
    JSON.stringify(clinical)
  );

  console.log("Overpass schools + childcare...");
  const schools = await overpassMelbourne(`
    node["amenity"="school"](-38.35,144.45,-37.45,145.65);
    way["amenity"="school"](-38.35,144.45,-37.45,145.65);
    node["amenity"~"kindergarten|childcare|preschool"](-38.35,144.45,-37.45,145.65);
    way["amenity"~"kindergarten|childcare|preschool"](-38.35,144.45,-37.45,145.65);
  `);
  await writeFile(path.join(RAW, "osm-schools.json"), JSON.stringify(schools));

  // Everyday amenities for the "15-minute access" context layer (ULTRAPLAN
  // walkability roadmap). Categories beyond health/schools we already fetch:
  // supermarkets/grocery, pharmacy, parks/open space, cafe/restaurant,
  // gym/leisure. Used straight-line from SA2 centroids — context only, never
  // scored. OSM is ODbL; attribute contributors.
  console.log("Overpass everyday amenities (15-min access)...");
  const amenities = await overpassMelbourne(`
    node["shop"~"supermarket|convenience|greengrocer"](-38.35,144.45,-37.45,145.65);
    way["shop"~"supermarket|convenience|greengrocer"](-38.35,144.45,-37.45,145.65);
    node["amenity"~"pharmacy|cafe|restaurant|fast_food|gym"](-38.35,144.45,-37.45,145.65);
    node["shop"="chemist"](-38.35,144.45,-37.45,145.65);
    node["leisure"~"park|garden|fitness_centre|sports_centre"](-38.35,144.45,-37.45,145.65);
    way["leisure"~"park|garden|fitness_centre|sports_centre"](-38.35,144.45,-37.45,145.65);
  `);
  await writeFile(path.join(RAW, "osm-amenities.json"), JSON.stringify(amenities));

  // Cycling infrastructure for the "cyclability index" context layer (ULTRAPLAN
  // walkability/cyclability roadmap). Dedicated cycleways, on-road bike lanes
  // (cycleway=* tags on roads) and bicycle-designated paths. `out geom` so we
  // get full way geometry to measure length per SA2 — context only, never
  // scored. OSM is ODbL; attribute contributors. bbox capped to Greater
  // Melbourne (same envelope as the other OSM extracts) to keep the query
  // bounded; documented in methodology.
  console.log("Overpass cycling infrastructure (cyclability)...");
  const cycleways = await overpassMelbourne(
    `
    way["highway"="cycleway"](-38.35,144.45,-37.45,145.65);
    way["cycleway"~"lane|track|opposite_lane|opposite_track|shared_lane|share_busway"](-38.35,144.45,-37.45,145.65);
    way["cycleway:left"~"lane|track|shared_lane"](-38.35,144.45,-37.45,145.65);
    way["cycleway:right"~"lane|track|shared_lane"](-38.35,144.45,-37.45,145.65);
    way["cycleway:both"~"lane|track|shared_lane"](-38.35,144.45,-37.45,145.65);
    way["highway"~"path|footway"]["bicycle"="designated"](-38.35,144.45,-37.45,145.65);
  `,
    { out: "geom" }
  );
  await writeFile(path.join(RAW, "osm-cycleways.json"), JSON.stringify(cycleways));

  console.log("fetch-indicators complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
