/**
 * Noise / traffic / transit lens: transport-noise + nuisance proximity proxies,
 * nearest/future train station, major-project nudge, the SA2 transport
 * percentile, busy-road (AADT) proximity and bus access.
 * Split out of lib/buyer-report.ts (P1-10 decomposition) - no logic changes.
 */
import { haversineKm, type LngLat } from "../buyer-location";
import {
  nearestNoiseSources,
  noiseFlags,
  noiseKindLabel,
} from "../noise";
import {
  nearestNuisances,
  nuisanceFlags,
  nuisanceKindLabel,
} from "../nuisance";
import { nearestStation, nearestBusStop, type Station } from "../transit";
import { busiestRoadNear } from "../traffic";
import { getSourcesByIds } from "../source-manifest";
import { domainVerdict } from "../verdict";
import { MAJOR_PROJECT_THRESHOLD_KM, type BuyerFinding } from "./types";
import { pctOf } from "./helpers";
import type { EngineCtx } from "./context";

const REGION_LABEL = "Greater Melbourne";

/**
 * Transport-noise proximity proxy (pin-level, OSM lines). Only FLAG when a
 * source is close - we never claim "quiet" (not all noise sources are mapped).
 */
export function pushNoiseFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, point } = ctx;
  if (point && input.noiseLines && input.noiseLines.length > 0) {
    const flags = noiseFlags(
      nearestNoiseSources([point.lng, point.lat], input.noiseLines)
    );
    if (flags.length > 0) {
      const list = flags
        .map((f) => `${noiseKindLabel(f.kind)} (~${f.distance} m away)`)
        .join(", ");
      findings.push({
        id: "transport-noise",
        kind: "verify",
        tone: "concern",
        severity: flags.some((f) => f.distance <= 50) ? "medium" : "low",
        title: "Possible traffic / rail noise",
        summary: `This point is close to a ${list}.`,
        whyItMatters:
          "Proximity to a freeway, railway or tram line often means road, train or tram noise - especially at peak hour and overnight.",
        verifyAction:
          "Visit at peak hour and after dark to judge the real noise; ask whether the property has double glazing.",
        confidence: "low",
        geography: "pin",
        caveat:
          "Straight-line distance to the nearest mapped rail line, tram line or freeway/major road (OpenStreetMap, ODbL) - a proximity proxy, NOT a measured noise level. Barriers, cuttings, traffic volume, aspect and time of day all matter and are not modelled.",
        sourceRefs: getSourcesByIds(["osm-noise-corridors"]),
      });
    }
  }
}

/**
 * Nuisance / disamenity proximity proxy (pin-level, OSM): industrial estates,
 * waste/landfill, sewage works, quarries - odour/dust/traffic. Only FLAG close.
 */
export function pushNuisanceFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, point } = ctx;
  if (point && input.nuisancePoints && input.nuisancePoints.length > 0) {
    const nflags = nuisanceFlags(
      nearestNuisances([point.lng, point.lat], input.nuisancePoints)
    );
    if (nflags.length > 0) {
      const list = nflags
        .map((f) => `${nuisanceKindLabel(f.kind)} (~${f.distance} m away)`)
        .join(", ");
      findings.push({
        id: "nuisance-proximity",
        kind: "verify",
        tone: "concern",
        severity: nflags.some((f) => f.distance <= 200) ? "medium" : "low",
        title: "Possible industrial / odour / pollution source nearby",
        summary: `This point is near a ${list}.`,
        whyItMatters:
          "Industrial areas, waste or sewage sites and quarries can bring odour, dust, heavy-vehicle traffic or noise at certain times or wind directions.",
        verifyAction:
          "Check the prevailing wind, visit at different times, and look up any EPA licence or known issues for the site.",
        confidence: "low",
        geography: "pin",
        caveat:
          "Straight-line distance to the representative point of the nearest mapped industrial area, waste/landfill, sewage works or quarry (OpenStreetMap, ODbL) - a proximity proxy, NOT a measured emission. Whether a site affects this property depends on wind, hours, screening and operations.",
        sourceRefs: getSourcesByIds(["osm-nuisance-points"]),
      });
    }
  }
}

/** Nearest train station (pin-level, OSM) - a commute-convenience signal. */
export function pushTrainStationFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, point } = ctx;
  if (point && input.stations && input.stations.length > 0) {
    const st = nearestStation([point.lng, point.lat], input.stations);
    if (st) {
      const close = st.distanceM <= 1200;
      const dist =
        st.distanceM < 1000 ? `${st.distanceM} m` : `${(st.distanceM / 1000).toFixed(1)} km`;
      findings.push({
        id: "train-station",
        kind: close ? "positive" : "neutral",
        severity: "info",
        title: close ? "Train station within walking distance" : "Nearest train station",
        summary: `${st.name} station is about ${dist} away (straight line).`,
        whyItMatters:
          "A nearby train station often means a faster, more reliable commute than buses alone.",
        confidence: "medium",
        geography: "pin",
        caveat:
          "Straight-line distance to the nearest mapped train station (OpenStreetMap, ODbL). The walking route is longer, and the line, frequency and direction matter too.",
        sourceRefs: getSourcesByIds(["osm-train-stations"]),
      });
    }
  }
}

/** Future transport - a planned/under-construction station nearby (price-relevant). */
export function pushFutureTransportFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, point } = ctx;
  if (point && input.futureStations && input.futureStations.length > 0) {
    const fut = nearestStation([point.lng, point.lat], input.futureStations as Station[]);
    if (fut && fut.distanceM <= 2000) {
      const match = input.futureStations.find((f) => f.name === fut.name);
      const statusWord = match?.status === "construction" ? "under-construction" : "planned";
      const modeWord = match?.mode === "tram" ? "tram" : "train";
      const dist =
        fut.distanceM < 1000 ? `${fut.distanceM} m` : `${(fut.distanceM / 1000).toFixed(1)} km`;
      findings.push({
        id: "future-transport",
        kind: "neutral",
        severity: "info",
        title: "Future transport nearby",
        summary: `A ${statusWord} ${modeWord} station (${fut.name}) is mapped about ${dist} away.`,
        whyItMatters:
          "New transport is often priced into an area early - it can lift access and demand, but timelines and final stops can still change.",
        confidence: "low",
        geography: "pin",
        caveat:
          "Community-mapped under-construction / proposed stops (OpenStreetMap, ODbL) - indicative only, not a committed-project guarantee. Check the official project page for status and the final location.",
        sourceRefs: getSourcesByIds(["osm-future-transport"]),
      });
    }
  }
}

/**
 * 1c) Major transport projects (curated VIC Big Build) within ~1.5 km of the
 *     pin - a factual "what's changing nearby" nudge, never a price prediction.
 */
export function pushMajorProjectFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, point } = ctx;
  if (point && input.majorProjects?.length) {
    const pin: LngLat = [point.lng, point.lat];
    const near = input.majorProjects
      .map((p) => ({ ...p, km: haversineKm(pin, [p.lng, p.lat]) }))
      .filter((p) => p.km <= MAJOR_PROJECT_THRESHOLD_KM)
      .sort((a, b) => a.km - b.km)
      .slice(0, 2);
    if (near.length > 0) {
      const p = near[0];
      const more = near
        .slice(1)
        .map((n) => `${n.name} (~${Math.round(n.km * 1000)} m)`)
        .join(", ");
      findings.push({
        id: "major-project-nearby",
        kind: "neutral",
        severity: "info",
        title: "Major transport project nearby",
        summary: `A new ${p.label} - ${p.name} station, ~${Math.round(p.km * 1000)} m away - is ${p.status}.${more ? ` Also nearby: ${more}.` : ""}`,
        whyItMatters:
          "Major transport infrastructure can reshape access and the area over the years it is built and opens.",
        verifyAction:
          "Check the official project page for timing, construction impacts and the final station siting.",
        confidence: "medium",
        geography: "poi-radius",
        caveat:
          "Station location is approximate (resolved from OpenStreetMap) and projects can shift - confirm on the project page. This flags what is planned or underway, not a prediction of prices.",
        sourceRefs: [
          { id: "vic-big-build", label: "Victoria's Big Build", url: p.sourceUrl },
        ],
      });
    }
  }
}

/** 3) Transport (SA2 domain). */
export function pushTransportPercentileFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { place } = ctx;
  const transportPct = pctOf(place, "transport");
  const transportVerdict = domainVerdict("transport", transportPct, REGION_LABEL);
  if (transportPct != null && transportPct >= 70) {
    findings.push({
      id: "transport-strong",
      kind: "positive",
      severity: "info",
      title: "Strong public transport proximity",
      summary: `${transportVerdict?.headline ?? "Public transport access scores strongly"} for this wider area.`,
      confidence: "medium",
      geography: "sa2",
      caveat: "Area-level; confirm the actual stops, lines and peak-hour commute for this address.",
      sourceRefs: getSourcesByIds(["ptv-gtfs"]),
    });
  } else if (transportPct != null && transportPct <= 30) {
    findings.push({
      id: "transport-check",
      kind: "verify",
      tone: "concern",
      severity: "low",
      title: "Inspect the commute at peak hour",
      summary: `${transportVerdict?.headline ?? "Public transport access is limited"} for this wider area.`,
      verifyAction: "Test the door-to-door commute at peak hour before relying on public transport.",
      confidence: "medium",
      geography: "sa2",
      sourceRefs: getSourcesByIds(["ptv-gtfs"]),
    });
  }
}

/**
 * 5h) Traffic exposure (context, never scored). Busiest mapped arterial /
 *     highway within ~250 m of the pin + its measured AADT. Pin-level
 *     proximity proxy; residential streets are not counted, latest year 2019.
 */
export function pushTrafficFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, mode, point } = ctx;
  const road =
    point && mode === "pin" && input.traffic
      ? busiestRoadNear([point.lng, point.lat], input.traffic, 250)
      : null;
  if (road && road.aadt >= 5000) {
    const heavy = road.heavyPct >= 8;
    const concern = road.aadt >= 20000 && road.distanceMeters <= 150;
    findings.push({
      id: "traffic-volume",
      kind: concern ? "verify" : "neutral",
      ...(concern ? { tone: "concern" as const } : {}),
      severity: road.aadt >= 40000 ? "high" : road.aadt >= 15000 ? "medium" : "low",
      title:
        road.aadt >= 40000
          ? "Major traffic route close by"
          : road.aadt >= 15000
            ? "Busy road nearby"
            : "Moderate traffic nearby",
      summary: `${road.road || "A main road"} is about ${road.distanceMeters} m away and carried roughly ${road.aadt.toLocaleString("en-AU")} vehicles a day (2019)${heavy ? `, with a notable ${road.heavyPct}% heavy vehicles (a truck route)` : ""}.`,
      whyItMatters:
        "Busier roads bring more traffic noise, harder on-street parking and pedestrian-safety trade-offs - though they often also mean better bus access and shops.",
      verifyAction:
        "Visit at morning and evening peak and after dark to judge the noise and traffic, and check crossing safety if you have children.",
      confidence: "medium",
      geography: "pin",
      caveat:
        "Straight-line distance to the nearest MAPPED arterial / highway (DTP traffic counts, latest year 2019) - residential streets are not counted, and this is a proximity proxy, not modelled noise or a parcel result.",
      sourceRefs: getSourcesByIds(["dtp-aadt"]),
    });
  }
}

/**
 * 5m) Bus access (context, never scored). Nearest GTFS bus stop + its weekday
 *     route count + stops within 400 m. Straight-line proximity proxy.
 */
export function pushBusFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, mode, point } = ctx;
  const bus =
    point && mode === "pin" && input.busStops
      ? nearestBusStop([point.lng, point.lat], input.busStops)
      : null;
  if (bus && bus.distanceM <= 1200) {
    const close = bus.distanceM <= 400;
    const dist = bus.distanceM < 1000 ? `${bus.distanceM} m` : `${(bus.distanceM / 1000).toFixed(1)} km`;
    findings.push({
      id: "bus-access",
      kind: close ? "positive" : "neutral",
      severity: "info",
      title: close ? "Bus stop within walking distance" : "Bus stop nearby",
      summary: `The nearest bus stop is about ${dist} away${bus.routeCount > 0 ? `, served by ${bus.routeCount} bus route${bus.routeCount === 1 ? "" : "s"}` : ""}${bus.stopsWithin400 > 1 ? ` (${bus.stopsWithin400} bus stops within 400 m)` : ""}.`,
      whyItMatters:
        "Bus access widens where you can get without a car - though routes, frequency and direction vary, so a nearby stop is not always a useful one.",
      verifyAction:
        "Check the actual routes, frequency and direction on the PTV journey planner for the times you would travel.",
      confidence: "medium",
      geography: "pin",
      caveat:
        "Straight-line distance to a mapped GTFS bus stop (weekday services) - the walking route is longer and timetable / direction matter.",
      sourceRefs: getSourcesByIds(["ptv-gtfs"]),
    });
  }
}
