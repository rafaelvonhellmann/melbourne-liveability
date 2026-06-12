/**
 * Fetches indicator raw files into data/raw (gitignored).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { loadSa2Codes } from "./lib/melbourne-sa2-codes.js";
import { PIPELINE_REGION, OVERPASS_BBOX } from "./lib/pipeline-region.js";
import { fetchArcGisTable, overpassMelbourne } from "./lib/arcgis-fetch.js";
import { crimeAdapterFor } from "./lib/crime-adapters.js";
import { fetchVicHospitalPoints } from "./lib/vic-facilities.js";
import { G37_SERVICE, G37_FIELDS } from "../lib/social-housing.js";
import { STRESS_SERVICE, STRESS_FIELDS } from "../lib/housing-stress.js";

async function main() {
  await mkdir(RAW, { recursive: true });
  const codes = await loadSa2Codes();
  console.log(`${PIPELINE_REGION.label} SA2 count: ${codes.length}`);

  console.log("ABS income (equiv weekly)...");
  const income = await fetchArcGisTable("SA2_income_DbR_Nov25", 0, {
    codes,
    where: `gccsa_code_2021='${PIPELINE_REGION.gccsa}'`,
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

  console.log("ABS Census household stress (rent/mortgage >30% of income)...");
  const stress = await fetchArcGisTable(STRESS_SERVICE, 0, {
    codes,
    outFields: STRESS_FIELDS,
  });
  await writeFile(path.join(RAW, "abs-sa2-stress.json"), JSON.stringify(stress));

  console.log("ABS Census G01 (First Nations population)...");
  const g01 = await fetchArcGisTable("ABS_2021_Census_G01_SA2", 0, {
    codes,
    outFields: "sa2_code_2021,indigenous_p_tot_p,tot_p_p",
  });
  await writeFile(path.join(RAW, "abs-sa2-indigenous.json"), JSON.stringify(g01));

  // VIC-only Tier-B sources below: per-state equivalents are separate modules
  // (EXPANSION-PLAN section 3) - skip rather than fetch wrong-state data.
  if (PIPELINE_REGION.id !== "melbourne") {
    console.log(
      `Skipping VIC-only sources (hospitals) for ${PIPELINE_REGION.id} - Tier-B state module pending.`
    );
  }

  if (PIPELINE_REGION.id === "melbourne") {
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
  } // end melbourne-only (VIC Tier-B) sources

  // Recorded offences via the per-state crime adapter registry (VIC = VCSA
  // CKAN -> XLSX, ACT = ACT Policing dataACT blob). States without an adapter
  // fetch nothing - their safety domain stays unscored.
  const crimeAdapter = crimeAdapterFor(PIPELINE_REGION);
  if (!crimeAdapter) {
    console.log(
      `Skipping crime for ${PIPELINE_REGION.id} - no ${PIPELINE_REGION.state} crime adapter yet.`
    );
  } else {
    console.log(`Crime (${crimeAdapter.sourceId})...`);
    try {
      await crimeAdapter.fetch(PIPELINE_REGION, RAW);
    } catch (e) {
      console.warn("  Crime:", (e as Error).message);
    }
  }

  console.log("Overpass PT stops...");
  const pt = await overpassMelbourne(`
    node["public_transport"~"platform|stop_position"]${OVERPASS_BBOX};
    node["railway"="tram_stop"]${OVERPASS_BBOX};
    node["highway"="bus_stop"]${OVERPASS_BBOX};
  `);
  await writeFile(path.join(RAW, "osm-pt.json"), JSON.stringify(pt));

  console.log("Overpass hospitals + GP + police...");
  const health = await overpassMelbourne(`
    node["amenity"="hospital"]${OVERPASS_BBOX};
    node["amenity"~"doctors|clinic|health_centre"]${OVERPASS_BBOX};
    way["amenity"~"doctors|clinic|health_centre"]${OVERPASS_BBOX};
    node["healthcare"~"doctor|clinic|centre"]${OVERPASS_BBOX};
    node["amenity"="police"]${OVERPASS_BBOX};
    way["amenity"="police"]${OVERPASS_BBOX};
    node["office"="police"]${OVERPASS_BBOX};
  `);
  await writeFile(path.join(RAW, "osm-health.json"), JSON.stringify(health));

  console.log("Overpass post offices (Australia Post / LPO)...");
  const post = await overpassMelbourne(`
    node["amenity"="post_office"]${OVERPASS_BBOX};
    way["amenity"="post_office"]${OVERPASS_BBOX};
    node["shop"="post_office"]${OVERPASS_BBOX};
    node["post_office"="post_partner"]${OVERPASS_BBOX};
  `);
  await writeFile(path.join(RAW, "osm-post.json"), JSON.stringify(post));

  // Pathology collection centres + NDIS/disability-related providers for the
  // context pin layers. Tagged sparsely in OSM (honest coverage caveat); these
  // pins are context-only and never scored. Classified in build-poi.ts.
  console.log("Overpass pathology labs + NDIS-related providers...");
  const clinical = await overpassMelbourne(`
    node["healthcare"~"laboratory|sample_collection"]${OVERPASS_BBOX};
    way["healthcare"~"laboratory|sample_collection"]${OVERPASS_BBOX};
    node["amenity"="clinic"]["healthcare:speciality"~"pathology|diagnostic"]${OVERPASS_BBOX};
    node["social_facility"]${OVERPASS_BBOX};
    node["office"~"association|ngo"]${OVERPASS_BBOX};
    node["healthcare"="counselling"]${OVERPASS_BBOX};
  `);
  await writeFile(
    path.join(RAW, "osm-clinical-social.json"),
    JSON.stringify(clinical)
  );

  console.log("Overpass schools + childcare...");
  // nwr = node + way + relation. Large schools are often mapped as
  // multipolygon RELATIONS (Brighton showed 1 of 4 schools when only
  // node+way were fetched - see AMENITY-AUDIT.md). The helper's default
  // `out center` yields a representative point for ways and relations alike.
  const schools = await overpassMelbourne(`
    nwr["amenity"="school"]${OVERPASS_BBOX};
    nwr["amenity"~"kindergarten|childcare|preschool"]${OVERPASS_BBOX};
  `);
  await writeFile(path.join(RAW, "osm-schools.json"), JSON.stringify(schools));

  // Everyday amenities for the "15-minute access" context layer (ULTRAPLAN
  // walkability roadmap). Categories beyond health/schools we already fetch:
  // supermarkets/grocery, pharmacy, parks/open space, cafe/restaurant,
  // gym/leisure. Used straight-line from SA2 centroids - context only, never
  // scored. OSM is ODbL; attribute contributors.
  // nwr (node + way + relation) everywhere: cafes/restaurants/pharmacies/gyms
  // were fetched as NODES only, missing building-mapped venues (cafes -45% in
  // Brighton, -21% in Fitzroy), and park relations were never fetched - see
  // AMENITY-AUDIT.md. `out center` (helper default) gives ways/relations a
  // representative point that the consumers already decode via `el.center`.
  console.log("Overpass everyday amenities (15-min access)...");
  const amenities = await overpassMelbourne(`
    nwr["shop"~"supermarket|convenience|greengrocer"]${OVERPASS_BBOX};
    nwr["amenity"~"pharmacy|cafe|restaurant|fast_food|gym"]${OVERPASS_BBOX};
    nwr["shop"="chemist"]${OVERPASS_BBOX};
    nwr["leisure"~"park|garden|fitness_centre|sports_centre"]${OVERPASS_BBOX};
  `);
  await writeFile(path.join(RAW, "osm-amenities.json"), JSON.stringify(amenities));

  // Cycling infrastructure for the "cyclability index" context layer (ULTRAPLAN
  // walkability/cyclability roadmap). Dedicated cycleways, on-road bike lanes
  // (cycleway=* tags on roads) and bicycle-designated paths. `out geom` so we
  // get full way geometry to measure length per SA2 - context only, never
  // scored. OSM is ODbL; attribute contributors. bbox capped to Greater
  // Melbourne (same envelope as the other OSM extracts) to keep the query
  // bounded; documented in methodology.
  console.log("Overpass cycling infrastructure (cyclability)...");
  const cycleways = await overpassMelbourne(
    `
    way["highway"="cycleway"]${OVERPASS_BBOX};
    way["cycleway"~"lane|track|opposite_lane|opposite_track|shared_lane|share_busway"]${OVERPASS_BBOX};
    way["cycleway:left"~"lane|track|shared_lane"]${OVERPASS_BBOX};
    way["cycleway:right"~"lane|track|shared_lane"]${OVERPASS_BBOX};
    way["cycleway:both"~"lane|track|shared_lane"]${OVERPASS_BBOX};
    way["highway"~"path|footway"]["bicycle"="designated"]${OVERPASS_BBOX};
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
