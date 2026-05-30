const UA = "MelbourneLiveability/1.0 (research; contact geography@abs.gov.au)";

export async function fetchArcGisTable(
  service: string,
  layer = 0,
  options: {
    where?: string;
    outFields: string;
    codes?: string[];
    codeField?: string;
  }
): Promise<Record<string, string | number>[]> {
  const base = `https://services-ap1.arcgis.com/ypkPEy1AmwPKGNNv/arcgis/rest/services/${service}/FeatureServer/${layer}/query`;
  const rows: Record<string, string | number>[] = [];

  const codes = options.codes ?? [];
  const useGccsa = options.where?.includes("gccsa");
  const batches = useGccsa
    ? [[]]
    : codes.length > 0
      ? Array.from({ length: Math.ceil(codes.length / 25) }, (_, i) =>
          codes.slice(i * 25, i * 25 + 25)
        )
      : [[]];

  for (const batch of batches) {
    const where = useGccsa
      ? options.where!
      : batch.length > 0
        ? `${options.codeField ?? "sa2_code_2021"} IN (${batch.map((c) => `'${c}'`).join(",")})`
        : options.where ?? "1=1";

    let offset = 0;
    for (;;) {
      const url = new URL(base);
      url.searchParams.set("where", where);
      url.searchParams.set("outFields", options.outFields);
      url.searchParams.set("returnGeometry", "false");
      url.searchParams.set("f", "json");
      url.searchParams.set("resultOffset", String(offset));
      url.searchParams.set("resultRecordCount", "1000");

      const res = await fetch(url.toString(), {
        headers: { "User-Agent": UA },
      });
      if (!res.ok) throw new Error(`${service} ${res.status}`);
      const data = (await res.json()) as {
        features?: { attributes: Record<string, string | number> }[];
        error?: { message: string };
      };
      if (data.error) throw new Error(data.error.message);
      const batchRows = data.features?.map((f) => f.attributes) ?? [];
      rows.push(...batchRows);
      if (batchRows.length < 1000) break;
      offset += 1000;
    }
  }
  return rows;
}

export async function overpassMelbourne(
  query: string,
  opts: { out?: "center" | "geom" } = {}
): Promise<unknown> {
  // `out center` → a single representative point per element (POIs).
  // `out geom`   → inline node coordinates per way (needed for line lengths,
  //                e.g. cycleway infrastructure).
  const outClause = opts.out === "geom" ? "out geom;" : "out center;";
  const q = `
[out:json][timeout:180];
(
  ${query}
);
${outClause}
`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: `data=${encodeURIComponent(q)}`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  return res.json();
}
