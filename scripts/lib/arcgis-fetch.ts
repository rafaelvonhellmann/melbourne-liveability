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

/** Public Overpass mirrors, tried in rotation across retry attempts. */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const OVERPASS_MAX_ATTEMPTS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pure retry decision for an Overpass response — kept separate so it is unit
 * testable without real network or timers. Overpass commonly returns 429 (rate
 * limit) and 504/502/503 (gateway / query timeout) under load; those are
 * transient and worth retrying with exponential backoff. A `Retry-After` header
 * (seconds) is honoured when present. Non-transient statuses (e.g. 400 bad
 * query) fail fast.
 */
export function overpassRetryPlan(
  status: number | "network",
  attempt: number,
  retryAfterSec?: number
): { retry: boolean; waitMs: number } {
  const transient =
    status === "network" || [429, 502, 503, 504].includes(status as number);
  if (!transient) return { retry: false, waitMs: 0 };
  const waitMs =
    retryAfterSec && retryAfterSec > 0
      ? Math.min(60_000, retryAfterSec * 1000)
      : Math.min(30_000, 2_000 * 2 ** attempt);
  return { retry: true, waitMs };
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
  const body = `data=${encodeURIComponent(q)}`;
  let lastError = "unknown error";

  for (let attempt = 0; attempt < OVERPASS_MAX_ATTEMPTS; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
        },
      });
    } catch (e) {
      // Network / DNS / abort — treat as transient and back off.
      lastError = (e as Error).message;
      const plan = overpassRetryPlan("network", attempt);
      if (!plan.retry || attempt === OVERPASS_MAX_ATTEMPTS - 1) break;
      console.warn(
        `  Overpass network error (attempt ${attempt + 1}/${OVERPASS_MAX_ATTEMPTS}): ${lastError} — retrying in ${Math.round(plan.waitMs / 1000)}s`
      );
      await sleep(plan.waitMs);
      continue;
    }

    if (res.ok) {
      const json = (await res.json()) as { remark?: string };
      // Overpass returns HTTP 200 with a "remark" when the query failed
      // server-side (timeout / runtime error / out of memory). Treat that as a
      // transient gateway-timeout and retry rather than silently accepting an
      // empty/partial result set.
      const remark = typeof json.remark === "string" ? json.remark : "";
      if (/timed out|runtime error|out of memory/i.test(remark)) {
        lastError = `Overpass remark: ${remark.slice(0, 80)}`;
        const plan = overpassRetryPlan(504, attempt);
        if (!plan.retry || attempt === OVERPASS_MAX_ATTEMPTS - 1) break;
        console.warn(
          `  Overpass soft error (attempt ${attempt + 1}/${OVERPASS_MAX_ATTEMPTS}): ${remark.slice(0, 60)} — retrying in ${Math.round(plan.waitMs / 1000)}s`
        );
        await sleep(plan.waitMs);
        continue;
      }
      return json;
    }

    lastError = `HTTP ${res.status}`;
    const retryAfter = Number(res.headers.get("retry-after"));
    const plan = overpassRetryPlan(
      res.status,
      attempt,
      Number.isFinite(retryAfter) ? retryAfter : undefined
    );
    if (!plan.retry || attempt === OVERPASS_MAX_ATTEMPTS - 1) {
      if (!plan.retry) throw new Error(`Overpass ${res.status} (non-retryable)`);
      break;
    }
    console.warn(
      `  Overpass ${res.status} (attempt ${attempt + 1}/${OVERPASS_MAX_ATTEMPTS}) — retrying in ${Math.round(plan.waitMs / 1000)}s`
    );
    await sleep(plan.waitMs);
  }

  throw new Error(
    `Overpass failed after ${OVERPASS_MAX_ATTEMPTS} attempts: ${lastError}`
  );
}
