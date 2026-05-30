const r = await fetch(
  "https://services-ap1.arcgis.com/ypkPEy1AmwPKGNNv/arcgis/rest/services?f=json"
);
const j = (await r.json()) as { services: { name: string }[] };
for (const s of j.services) {
  if (/2021_SA2/i.test(s.name)) {
    console.log(s.name);
  }
}
