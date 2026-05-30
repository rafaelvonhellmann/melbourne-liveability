/**
 * PTV GTFS → per-SA2 transport scalars (stops 800m, modes, weekday AM-peak trips).
 * Raw zip stays in data/raw (gitignored); only derived JSON is committed.
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
import { RAW, GENERATED } from "./lib/paths.js";
import { getProp, featureGeometry } from "./lib/abs-geo.js";
import {
  AM_PEAK_END,
  AM_PEAK_START,
  MEL_BBOX,
  PTV_GTFS_URL,
  ROUTE_TYPE_LABEL,
} from "./lib/gtfs-constants.js";
import { csvTable, gtfsTimeSeconds, parseCsvLine, stripBom } from "./lib/parse-csv.js";

const UA = "MelbourneLiveability/1.0";
const GTFS_ZIP = path.join(RAW, "ptv-gtfs.zip");
const OUT_FILE = path.join(GENERATED, "gtfs-transport.json");

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
    lat >= MEL_BBOX.south &&
    lat <= MEL_BBOX.north &&
    lon >= MEL_BBOX.west &&
    lon <= MEL_BBOX.east
  );
}

async function downloadGtfs() {
  console.log("Downloading PTV GTFS (~200MB)...");
  await mkdir(RAW, { recursive: true });
  const res = await fetch(PTV_GTFS_URL, {
    redirect: "follow",
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`GTFS download ${res.status}`);
  if (res.body) {
    await pipeline(res.body as NodeJS.ReadableStream, createWriteStream(GTFS_ZIP));
  }
  console.log("  saved", GTFS_ZIP);
}

async function openInnerFile(
  outer: unzipper.CentralDirectory,
  innerPath: string,
  fileName: string
) {
  const entry = outer.files.find((f) => f.path === innerPath);
  if (!entry) return null;
  const buf = await entry.buffer();
  const inner = await unzipper.Open.buffer(buf);
  return (
    inner.files.find((f) => f.path === fileName || f.path.endsWith(`/${fileName}`)) ??
    null
  );
}

async function readInnerCsv(
  outer: unzipper.CentralDirectory,
  innerPath: string,
  fileName: string
): Promise<string | null> {
  const file = await openInnerFile(outer, innerPath, fileName);
  if (!file) return null;
  const buf = await file.buffer();
  return stripBom(buf.toString("utf8"));
}

async function streamStopTimes(
  outer: unzipper.CentralDirectory,
  innerPath: string,
  melStopIds: Set<string>,
  weekdayTrips: Set<string>,
  stopAmTrips: Map<string, Set<string>>,
  stopWeekdayTrips: Map<string, Set<string>>
) {
  const file = await openInnerFile(outer, innerPath, "stop_times.txt");
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
      header = parseCsvLine(stripBom(line)).map((h) => stripBom(h));
      idxStop = header.indexOf("stop_id");
      idxTrip = header.indexOf("trip_id");
      idxArr = header.indexOf("arrival_time");
      idxDep = header.indexOf("departure_time");
      continue;
    }
    const cols = parseCsvLine(line);
    const stopId = cols[idxStop];
    const tripId = cols[idxTrip];
    if (!stopId || !tripId || !melStopIds.has(stopId) || !weekdayTrips.has(tripId)) continue;
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

async function parseFeed(outerPath: string, outer: unzipper.CentralDirectory): Promise<FeedData> {
  const stopsTxt = await readInnerCsv(outer, outerPath, "stops.txt");
  const calendarTxt = await readInnerCsv(outer, outerPath, "calendar.txt");
  const tripsTxt = await readInnerCsv(outer, outerPath, "trips.txt");
  const routesTxt = await readInnerCsv(outer, outerPath, "routes.txt");
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
    tripRoute.set(tid, rid);
    if (sid && weekdayServices.has(sid)) weekdayTrips.add(tid);
  }

  const melStopIds = new Set(stops.keys());
  const stopAmTrips = new Map<string, Set<string>>();
  const stopWeekdayTrips = new Map<string, Set<string>>();
  await streamStopTimes(
    outer,
    outerPath,
    melStopIds,
    weekdayTrips,
    stopAmTrips,
    stopWeekdayTrips
  );

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

async function loadSa2Centroids(): Promise<Map<string, [number, number]>> {
  const fc = JSON.parse(
    await readFile(path.join(RAW, "sa2-melbourne.geojson"), "utf8")
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

async function main() {
  try {
    await readFile(GTFS_ZIP);
  } catch {
    await downloadGtfs();
  }

  console.log("Parsing GTFS feeds...");
  const outer = await unzipper.Open.file(GTFS_ZIP);
  const allInner = outer.files
    .map((f) => f.path)
    .filter((p) => /google_transit\.zip$/i.test(p));
  // Metropolitan train / tram / bus feeds (PTV branch folders 2–4).
  const metro = allInner.filter((p) => /^[234]\/google_transit\.zip$/i.test(p));
  const innerPaths = metro.length > 0 ? metro : allInner;

  const feeds: FeedData[] = [];
  for (const p of innerPaths) {
    console.log("  ", p);
    feeds.push(await parseFeed(p, outer));
  }
  if (feeds.length === 0) throw new Error("No google_transit.zip feeds found in GTFS archive");

  const { allStops, stopAmTrips, stopWeekdayTrips, tripRoute, routeType, period } =
    mergeFeeds(feeds);
  console.log(`Melbourne stops: ${allStops.size}`);

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
      sourceId: "ptv-gtfs",
      period: periodLabel,
      places: bySa2,
    })
  );
  console.log(`Wrote ${OUT_FILE} (${Object.keys(bySa2).length} SA2)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
