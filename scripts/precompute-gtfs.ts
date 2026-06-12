/**
 * GTFS Schedule → per-SA2 transport scalars (stops 800m, modes, weekday
 * AM-peak trips) + bus-stop tuples, for the ACTIVE region (Wave 2 item 3).
 *
 * Feed URLs come from the registry (lib/regions.ts stateSources.gtfsUrls);
 * provenance metadata (sourceId, licence) from scripts/lib/gtfs-constants
 * GTFS_SOURCES. Two archive shapes are handled:
 *   - nested: PTV's zip-of-zips (inner google_transit.zip per mode branch)
 *   - flat:   stops.txt etc. at the archive root (every other AU agency)
 * Stops are clipped to the region's registry bbox; stop_times is streamed
 * line-by-line (never buffered whole - the TfNSW complete bundle is huge).
 *
 * Key-gated feeds (TfNSW): when GTFS_SOURCES[region].keyEnv is set but the
 * env var is absent, the run skips gracefully - normalize falls back to OSM
 * stops, same as a region with no feed at all.
 *
 * Melbourne (default region) output is unchanged: same filenames
 * (gtfs-transport.json, bus-stops.json), same sourceId ("ptv-gtfs"), same
 * parsing path (metro branches 2-4 of the PTV bundle). Raw zips stay in
 * data/raw (gitignored); only derived JSON is committed.
 */
import { createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import RBush from "rbush";
import unzipper from "unzipper";
import type { FeatureCollection } from "geojson";
import * as turf from "@turf/turf";
import { RAW, GENERATED, PUBLIC_DATA } from "./lib/paths.js";
import {
  IS_DEFAULT_REGION,
  PIPELINE_REGION,
  generatedOutPath,
  publicOutPath,
  sa2RawName,
} from "./lib/pipeline-region.js";
import { getProp, featureGeometry } from "./lib/abs-geo.js";
import {
  AM_PEAK_END,
  AM_PEAK_START,
  GTFS_SOURCES,
  ROUTE_TYPE_LABEL,
} from "./lib/gtfs-constants.js";
import { csvTable, gtfsTimeSeconds, parseCsvLine, stripBom } from "./lib/parse-csv.js";

const UA = "MelbourneLiveability/1.0";
const REGION = PIPELINE_REGION;
const BBOX = REGION.bbox;
const GTFS_URLS = REGION.stateSources?.gtfsUrls ?? [];
const META = GTFS_SOURCES[REGION.id];
const OUT_FILE = generatedOutPath("gtfs-transport.json");

/** Raw zip cache path per feed. Melbourne keeps the historical ptv-gtfs.zip
 * name (and its single PTV bundle); other regions get gtfs-{region}-{n}.zip. */
function zipPath(index: number): string {
  if (IS_DEFAULT_REGION) return path.join(RAW, "ptv-gtfs.zip");
  return path.join(RAW, `gtfs-${REGION.id}-${index + 1}.zip`);
}

type StopItem = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  stopId: string;
  lon: number;
  lat: number;
};

type Sa2Transport = {
  stops800m: number;
  amPeakFreq: number;
  ptModes: string | null;
};

function inBbox(lat: number, lon: number): boolean {
  return (
    lat >= BBOX.south && lat <= BBOX.north && lon >= BBOX.west && lon <= BBOX.east
  );
}

async function downloadGtfs(url: string, dest: string) {
  console.log(`Downloading GTFS for ${REGION.label}: ${url}`);
  await mkdir(RAW, { recursive: true });
  const headers: Record<string, string> = { "User-Agent": UA };
  if (META.keyEnv) {
    // TfNSW Open Data convention: `Authorization: apikey <key>`.
    headers.Authorization = `apikey ${process.env[META.keyEnv]}`;
  }
  const res = await fetch(url, { redirect: "follow", headers });
  if (!res.ok) throw new Error(`GTFS download ${res.status} (${url})`);
  if (res.body) {
    await pipeline(res.body as NodeJS.ReadableStream, createWriteStream(dest));
  }
  console.log("  saved", dest);
}

/**
 * Uniform access to one GTFS feed's files, whether the feed is a zip nested
 * inside an outer archive (PTV) or the archive itself (flat - every other
 * AU agency). openFile returns an unzipper entry whose .stream() the
 * stop_times reader consumes without buffering the whole file.
 */
type FeedReader = {
  label: string;
  openFile(fileName: string): Promise<unzipper.File | null>;
};

function findEntry(
  dir: unzipper.CentralDirectory,
  fileName: string
): unzipper.File | null {
  return (
    dir.files.find(
      (f) => f.path === fileName || f.path.endsWith(`/${fileName}`)
    ) ?? null
  );
}

function flatReader(outer: unzipper.CentralDirectory, label: string): FeedReader {
  return {
    label,
    openFile: async (fileName) => findEntry(outer, fileName),
  };
}

function nestedReader(
  outer: unzipper.CentralDirectory,
  innerPath: string
): FeedReader {
  return {
    label: innerPath,
    openFile: async (fileName) => {
      const entry = outer.files.find((f) => f.path === innerPath);
      if (!entry) return null;
      const buf = await entry.buffer();
      const inner = await unzipper.Open.buffer(buf);
      return findEntry(inner, fileName);
    },
  };
}

async function readCsv(reader: FeedReader, fileName: string): Promise<string | null> {
  const file = await reader.openFile(fileName);
  if (!file) return null;
  const buf = await file.buffer();
  return stripBom(buf.toString("utf8"));
}

async function streamStopTimes(
  reader: FeedReader,
  regionStopIds: Set<string>,
  weekdayTrips: Set<string>,
  stopAmTrips: Map<string, Set<string>>,
  stopWeekdayTrips: Map<string, Set<string>>
) {
  const file = await reader.openFile("stop_times.txt");
  if (!file) return;
  const stream = await file.stream();
  const rl = createInterface({ input: Readable.from(stream), crlfDelay: Infinity });
  let header: string[] | null = null;
  let idxStop = -1;
  let idxTrip = -1;
  let idxArr = -1;
  let idxDep = -1;
  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = parseCsvLine(stripBom(line)).map((h) => stripBom(h).trim());
      idxStop = header.indexOf("stop_id");
      idxTrip = header.indexOf("trip_id");
      idxArr = header.indexOf("arrival_time");
      idxDep = header.indexOf("departure_time");
      continue;
    }
    const cols = parseCsvLine(line);
    const stopId = cols[idxStop];
    const tripId = cols[idxTrip];
    if (!stopId || !tripId || !regionStopIds.has(stopId) || !weekdayTrips.has(tripId)) continue;
    let wdSet = stopWeekdayTrips.get(stopId);
    if (!wdSet) {
      wdSet = new Set();
      stopWeekdayTrips.set(stopId, wdSet);
    }
    wdSet.add(tripId);
    const arr = gtfsTimeSeconds(cols[idxArr] || cols[idxDep] || "");
    if (arr == null || arr < AM_PEAK_START || arr > AM_PEAK_END) continue;
    let set = stopAmTrips.get(stopId);
    if (!set) {
      set = new Set();
      stopAmTrips.set(stopId, set);
    }
    set.add(tripId);
  }
}

type FeedData = {
  stops: Map<string, { lat: number; lon: number }>;
  weekdayServices: Set<string>;
  tripRoute: Map<string, string>;
  routeType: Map<string, number>;
  stopAmTrips: Map<string, Set<string>>;
  stopWeekdayTrips: Map<string, Set<string>>;
  calendarPeriod: { start: string; end: string } | null;
};

async function parseFeed(reader: FeedReader): Promise<FeedData> {
  const stopsTxt = await readCsv(reader, "stops.txt");
  const calendarTxt = await readCsv(reader, "calendar.txt");
  const tripsTxt = await readCsv(reader, "trips.txt");
  const routesTxt = await readCsv(reader, "routes.txt");
  const stops = new Map<string, { lat: number; lon: number }>();
  for (const row of csvTable(stopsTxt ?? "")) {
    const loc = row.location_type?.trim();
    if (loc === "1") continue;
    const lat = Number(row.stop_lat);
    const lon = Number(row.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBbox(lat, lon)) continue;
    stops.set(row.stop_id, { lat, lon });
  }

  const weekdayServices = new Set<string>();
  let minStart = "99999999";
  let maxEnd = "00000000";
  for (const row of csvTable(calendarTxt ?? "")) {
    const sid = row.service_id;
    if (!sid) continue;
    const wd =
      row.monday === "1" ||
      row.tuesday === "1" ||
      row.wednesday === "1" ||
      row.thursday === "1" ||
      row.friday === "1";
    if (wd) weekdayServices.add(sid);
    const st = row.start_date ?? "";
    const en = row.end_date ?? "";
    if (st && st < minStart) minStart = st;
    if (en && en > maxEnd) maxEnd = en;
  }
  if (weekdayServices.size === 0) {
    // Feeds that schedule exclusively via calendar_dates.txt would yield zero
    // weekday trips - surface it instead of silently emitting empty frequency.
    console.warn(
      `  ${reader.label}: no weekday services in calendar.txt - AM-peak/bus-route counts will be empty for this feed`
    );
  }

  const routeType = new Map<string, number>();
  for (const row of csvTable(routesTxt ?? "")) {
    const rt = Number(row.route_type);
    if (row.route_id && Number.isFinite(rt)) routeType.set(row.route_id, rt);
  }

  const tripRoute = new Map<string, string>();
  const weekdayTrips = new Set<string>();
  for (const row of csvTable(tripsTxt ?? "")) {
    const tid = row.trip_id;
    const rid = row.route_id;
    const sid = row.service_id;
    if (!tid || !rid) continue;
    if (sid && weekdayServices.has(sid)) {
      weekdayTrips.add(tid);
      // Memory: only weekday trips are ever looked up downstream (AM-peak +
      // bus-route aggregation key off stop{Am,Weekday}Trips, both weekday-only),
      // so don't hold route ids for the rest - matters for the TfNSW bundle.
      tripRoute.set(tid, rid);
    }
  }

  const regionStopIds = new Set(stops.keys());
  const stopAmTrips = new Map<string, Set<string>>();
  const stopWeekdayTrips = new Map<string, Set<string>>();
  await streamStopTimes(reader, regionStopIds, weekdayTrips, stopAmTrips, stopWeekdayTrips);

  return {
    stops,
    weekdayServices,
    tripRoute,
    routeType,
    stopAmTrips,
    stopWeekdayTrips,
    calendarPeriod:
      minStart < "99999999" ? { start: minStart, end: maxEnd } : null,
  };
}

function mergeFeeds(feeds: FeedData[]) {
  const allStops = new Map<string, { lat: number; lon: number }>();
  const stopAmTrips = new Map<string, Set<string>>();
  const stopWeekdayTrips = new Map<string, Set<string>>();
  const tripRoute = new Map<string, string>();
  const routeType = new Map<string, number>();
  let period: { start: string; end: string } | null = null;

  for (const f of feeds) {
    for (const [id, s] of f.stops) allStops.set(id, s);
    for (const [id, trips] of f.stopAmTrips) {
      let set = stopAmTrips.get(id);
      if (!set) {
        set = new Set();
        stopAmTrips.set(id, set);
      }
      for (const t of trips) set.add(t);
    }
    for (const [id, trips] of f.stopWeekdayTrips) {
      let set = stopWeekdayTrips.get(id);
      if (!set) {
        set = new Set();
        stopWeekdayTrips.set(id, set);
      }
      for (const t of trips) set.add(t);
    }
    for (const [k, v] of f.tripRoute) tripRoute.set(k, v);
    for (const [k, v] of f.routeType) routeType.set(k, v);
    if (f.calendarPeriod) {
      if (!period) period = { ...f.calendarPeriod };
      else {
        if (f.calendarPeriod.start < period.start) period.start = f.calendarPeriod.start;
        if (f.calendarPeriod.end > period.end) period.end = f.calendarPeriod.end;
      }
    }
  }
  return { allStops, stopAmTrips, stopWeekdayTrips, tripRoute, routeType, period };
}

/**
 * Bus stops (GTFS route_type 3) with their distinct weekday bus-route count,
 * for the per-pin "bus access" finding. Compact [lng, lat, busRouteCount] tuples
 * (5dp), reusing the same in-memory maps as the SA2 aggregation. Shapes are NOT
 * shipped (too heavy) - stop proximity + route count is the honest signal.
 */
function buildBusStops(
  allStops: Map<string, { lat: number; lon: number }>,
  stopWeekdayTrips: Map<string, Set<string>>,
  tripRoute: Map<string, string>,
  routeType: Map<string, number>
): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const [stopId, { lat, lon }] of allStops) {
    const routes = new Set<string>();
    for (const tripId of stopWeekdayTrips.get(stopId) ?? []) {
      const rid = tripRoute.get(tripId);
      if (rid && routeType.get(rid) === 3) routes.add(rid);
    }
    if (routes.size > 0) {
      out.push([Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5, routes.size]);
    }
  }
  return out;
}

async function loadSa2Centroids(): Promise<Map<string, [number, number]>> {
  const fc = JSON.parse(
    await readFile(path.join(RAW, sa2RawName()), "utf8")
  ) as FeatureCollection;
  const out = new Map<string, [number, number]>();
  for (const f of fc.features) {
    const code = getProp(f, ["SA2_CODE_2021", "sa2_code_2021"]);
    const geom = featureGeometry(f);
    if (!code || !geom) continue;
    const c = turf.centroid({ type: "Feature", properties: {}, geometry: geom })
      .geometry.coordinates as [number, number];
    out.set(code, c);
  }
  return out;
}

function buildStopIndex(stops: Map<string, { lat: number; lon: number }>) {
  const tree = new RBush<StopItem>();
  const items: StopItem[] = [];
  for (const [stopId, { lat, lon }] of stops) {
    items.push({
      minX: lon,
      minY: lat,
      maxX: lon,
      maxY: lat,
      stopId,
      lon,
      lat,
    });
  }
  tree.load(items);
  return tree;
}

function nearbyStops(
  tree: RBush<StopItem>,
  centroid: [number, number],
  radiusKm: number
): StopItem[] {
  const [lon, lat] = centroid;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const dLat = radiusKm / 111;
  return tree.search({
    minX: lon - dLon,
    minY: lat - dLat,
    maxX: lon + dLon,
    maxY: lat + dLat,
  });
}

/** Parse every feed inside one downloaded archive: nested google_transit.zip
 * entries when present (PTV - metro branches 2-4 preferred, exactly the
 * pre-generalization behaviour), else the archive itself as a flat feed. */
async function parseArchive(zip: string, feeds: FeedData[]) {
  const outer = await unzipper.Open.file(zip);
  const nested = outer.files
    .map((f) => f.path)
    .filter((p) => /google_transit\.zip$/i.test(p));
  if (nested.length > 0) {
    // Metropolitan train / tram / bus feeds (PTV branch folders 2-4).
    const metro = nested.filter((p) => /^[234]\/google_transit\.zip$/i.test(p));
    const innerPaths = metro.length > 0 ? metro : nested;
    for (const p of innerPaths) {
      console.log("  ", p);
      feeds.push(await parseFeed(nestedReader(outer, p)));
    }
  } else {
    console.log("  ", path.basename(zip), "(flat feed)");
    feeds.push(await parseFeed(flatReader(outer, path.basename(zip))));
  }
}

async function main() {
  if (GTFS_URLS.length === 0) {
    // No registered feed: normalize falls back to OSM stops. Skip loudly -
    // never emit another region's transit under this region's name.
    console.warn(
      `precompute-gtfs: no stateSources.gtfsUrls for ${REGION.label} - skipped; transit uses the OSM stop fallback.`
    );
    return;
  }
  if (META.keyEnv && !process.env[META.keyEnv]) {
    console.warn(
      `precompute-gtfs: ${REGION.label} feed needs an API key - set ${META.keyEnv} (free signup, see ${META.url}). Skipped; transit uses the OSM stop fallback.`
    );
    return;
  }

  const zips: string[] = [];
  for (let i = 0; i < GTFS_URLS.length; i++) {
    const zp = zipPath(i);
    try {
      await readFile(zp);
    } catch {
      await downloadGtfs(GTFS_URLS[i], zp);
    }
    zips.push(zp);
  }

  console.log(`Parsing GTFS feeds (${REGION.label})...`);
  const feeds: FeedData[] = [];
  for (const zip of zips) {
    await parseArchive(zip, feeds);
  }
  if (feeds.length === 0) throw new Error("No GTFS feeds found in downloaded archives");

  const { allStops, stopAmTrips, stopWeekdayTrips, tripRoute, routeType, period } =
    mergeFeeds(feeds);
  console.log(`${REGION.label} stops: ${allStops.size}`);
  if (allStops.size === 0) {
    throw new Error(
      `GTFS feeds yielded zero stops inside the ${REGION.label} bbox - wrong feed or bbox?`
    );
  }

  const tree = buildStopIndex(allStops);
  const centroids = await loadSa2Centroids();
  const bySa2: Record<string, Sa2Transport> = {};

  for (const [code, centroid] of centroids) {
    const near = nearbyStops(tree, centroid, 0.8);
    const uniqueNear = new Map<string, StopItem>();
    for (const s of near) {
      const d = turf.distance(turf.point(centroid), turf.point([s.lon, s.lat]), {
        units: "kilometers",
      });
      if (d <= 0.8) uniqueNear.set(s.stopId, s);
    }

    const modes = new Set<string>();
    const amTrips = new Set<string>();
    for (const s of uniqueNear.values()) {
      for (const tripId of stopAmTrips.get(s.stopId) ?? []) amTrips.add(tripId);
      for (const tripId of stopWeekdayTrips.get(s.stopId) ?? []) {
        const rid = tripRoute.get(tripId);
        if (rid) {
          const rt = routeType.get(rid);
          if (rt != null) modes.add(ROUTE_TYPE_LABEL[rt] ?? `type${rt}`);
        }
      }
    }

    bySa2[code] = {
      stops800m: uniqueNear.size,
      amPeakFreq: amTrips.size,
      ptModes: modes.size > 0 ? [...modes].sort().join(",") : null,
    };
  }

  await mkdir(GENERATED, { recursive: true });
  const periodLabel = period
    ? `${period.start.slice(0, 4)}-${period.start.slice(4, 6)} to ${period.end.slice(0, 4)}-${period.end.slice(4, 6)}`
    : "rolling export";

  await writeFile(
    OUT_FILE,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      sourceId: META.sourceId,
      period: periodLabel,
      places: bySa2,
    })
  );
  console.log(`Wrote ${path.basename(OUT_FILE)} (${Object.keys(bySa2).length} SA2)`);

  const busStops = buildBusStops(allStops, stopWeekdayTrips, tripRoute, routeType);
  await mkdir(PUBLIC_DATA, { recursive: true });
  const busOut = publicOutPath("bus-stops.json");
  await writeFile(busOut, JSON.stringify(busStops));
  console.log(`Wrote ${path.basename(busOut)} (${busStops.length} bus stops)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
