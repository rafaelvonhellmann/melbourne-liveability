import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";

const UA = "MelbourneLiveability/1.0";

async function main() {
  const pkg = await fetch(
    "https://discover.data.vic.gov.au/api/3/action/package_show?id=data-tables-recorded-offences",
    { headers: { "User-Agent": UA } }
  );
  const data = (await pkg.json()) as {
    result?: { resources?: { url: string; format: string; name: string }[] };
  };
  const resources = data.result?.resources ?? [];
  const xlsx = resources
    .filter((r) => /xlsx/i.test(r.format ?? ""))
    .filter((r) => /lga/i.test(r.name ?? "") && /offence/i.test(r.name ?? ""))
    .sort((a, b) => (b.name ?? "").localeCompare(a.name ?? ""))[0];
  if (!xlsx?.url) {
    console.error("No crime XLSX found", resources.map((r) => r.name).slice(0, 5));
    process.exit(1);
  }
  console.log("Downloading", xlsx.name, xlsx.url);
  const res = await fetch(xlsx.url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(String(res.status));
  await mkdir(RAW, { recursive: true });
  await writeFile(
    path.join(RAW, "vcsa-lga-offences.xlsx"),
    Buffer.from(await res.arrayBuffer())
  );
  console.log("Done");
}

main();
