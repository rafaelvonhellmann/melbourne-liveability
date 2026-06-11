"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin, PanelRightClose, PanelRightOpen, Bike, Layers, ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";
// Code-split MapLibre out of the initial bundle: the page shell (header, search,
// side panels) paints first, then the heavy map chunk loads. ssr:false because
// MapLibre needs the browser and this is a static-export client view anyway.
const MelbourneMap = dynamic(
  () => import("@/components/MelbourneMap").then((m) => m.MelbourneMap),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 grid place-items-center bg-surface-sunken text-sm text-ink-muted">
        Loading map...
      </div>
    ),
  }
);
import { LayerToggle } from "@/components/LayerToggle";
import { RegionSwitcher } from "@/components/RegionSwitcher";
import { SearchBox } from "@/components/SearchBox";
import { DomainSliders } from "@/components/DomainSliders";
import { InterestViews } from "@/components/InterestViews";
import { ShortlistPanel } from "@/components/ShortlistPanel";
import { ShareViewButton } from "@/components/ShareViewButton";
import { MobileSheet } from "@/components/MobileSheet";
import { MapLegend } from "@/components/MapLegend";
import { POI_CATEGORY_BY_ID, type PoiCategoryId } from "@/lib/poi-categories";
import { Attribution } from "@/components/Attribution";
import { SelectedSummaryCard } from "@/components/SelectedSummaryCard";
import { FeedbackButton } from "@/components/FeedbackButton";
import { OnboardingModal } from "@/components/OnboardingModal";
import { Landing, shouldShowLanding, type LandingProfileChoice } from "@/components/Landing";
import { ProfileSetup } from "@/components/ProfileSetup";
import { MapTip } from "@/components/MapTip";
import { BuyerReportPanel } from "@/components/buyer/BuyerReportPanel";
import { SavedChecks } from "@/components/buyer/SavedChecks";
import { BuyerProfilePanel } from "@/components/buyer/BuyerProfilePanel";
import {
  savedCheckId,
  loadBuyerProfile,
  saveBuyerProfile,
  clearBuyerProfile,
  type SavedCheck,
} from "@/lib/user-prefs";
import type { BuyerProfile } from "@/lib/buyer-fit";
import { buildBuyerReport, type BuyerReport as BuyerReportData, type FutureStationLite } from "@/lib/buyer-report";
import { fetchDriveRoute, isDriveRoutingConfigured } from "@/lib/route-drive";
import type { NoiseLine } from "@/lib/noise";
import type { NuisancePoint } from "@/lib/nuisance";
import type { SchoolZonesData } from "@/lib/school-zones";
import type { TrafficSegment } from "@/lib/traffic";
import type { EpaAirSite } from "@/lib/epa-air";
import type { ActivityCentreFeature } from "@/lib/activity-centres";
import { fetchParcelShapeAt, type ParcelInfo, type ParcelShape } from "@/lib/parcel";
import { fetchPlanningAt, type PlanningAt } from "@/lib/planning-at";
import { ParcelConfirmCard } from "@/components/buyer/ParcelConfirmCard";
import type { Station, BusStop } from "@/lib/transit";
import { findSa2ForPoint } from "@/lib/buyer-location";
import { MAJOR_PROJECTS } from "@/lib/major-projects";
import type { GeocodeResult } from "@/lib/geocode";
import { withBase } from "@/lib/asset-path";
import { DEFAULT_REGION, dataPath, getRegion, type RegionId } from "@/lib/regions";
import { PRODUCT_NAME } from "@/lib/brand";
import { loadPoisNear, loadReportTilesNear } from "@/lib/report-tiles";
import { parseMapUrlState, buildMapUrl, inRegionBBox } from "@/lib/share-url";
import { track } from "@/lib/analytics";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { Place } from "@/lib/types";
import {
  loadRegionPlaces,
  regionDataAvailable,
  getPlaceBySlug,
} from "@/lib/places-data";
import { buildSearchIndex } from "@/lib/search";
import { DOMAIN_LABELS, domainProperty } from "@/lib/colors";
import { useMapPersonalisation } from "@/lib/use-map-personalisation";

// Pre-paint on the client, plain effect during the build prerender (silences
// React's useLayoutEffect-on-the-server warning). The first-visit landing gate
// runs through this so the decision lands BEFORE first paint - a brand-new
// visitor must never see the map shell flash behind the landing.
const useBeforePaintEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Buyer-relevant amenity pins for the "show everything within a 15-min walk" button.
const WALK_PIN_CATEGORIES = [
  { id: "supermarket", label: "Groceries" },
  { id: "gp", label: "GP" },
  { id: "pharmacy", label: "Pharmacy" },
  { id: "school", label: "Schools" },
  { id: "gym_leisure", label: "Gym" },
  { id: "bank", label: "Banks" },
  { id: "park", label: "Parks" },
];

export default function MapPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null);
  // Desktop side-panel collapse - gives the map full width on demand.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Pins are OFF by default - they only appear when the user enables a category.
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({});
  // Camera target for the area search / list selections. Map clicks never set
  // this, so clicking a place on the map preserves the current view. `zoom` is
  // only set by the region switcher (fly to the capital's framing zoom); the
  // search flows keep the historical max(current, 12) behaviour.
  const [focusTarget, setFocusTarget] = useState<{
    center: [number, number];
    zoom?: number;
    nonce: number;
  } | null>(null);

  // ---- Region seam (?region= + the capital switcher) ----------------------
  // One-shot from the URL, like the other share-URL state. Melbourne (the
  // default) resolves synchronously with zero extra work; any other region is
  // probed for a baked places artifact first and degrades to the Melbourne
  // map (with the visible notice below) when its dataset is not published yet
  // - a crafted or stale link must never crash the route. Declared BEFORE the
  // personalisation hook so every URL it writes can carry the region.
  const searchParams = useSearchParams();
  const [urlRegion] = useState<RegionId>(
    () => parseMapUrlState(searchParams.toString()).region
  );
  const [regionState, setRegionState] = useState<{
    region: RegionId;
    fellBack: boolean;
  } | null>(
    urlRegion === DEFAULT_REGION
      ? { region: DEFAULT_REGION, fellBack: false }
      : null
  );
  useEffect(() => {
    if (urlRegion === DEFAULT_REGION) return; // resolved synchronously above
    let live = true;
    void regionDataAvailable(urlRegion).then((ok) => {
      if (!live) return;
      // A manual switcher pick may have resolved the region first - the URL
      // probe must never stomp it (prev is only null while still unresolved).
      setRegionState(
        (prev) =>
          prev ??
          (ok
            ? { region: urlRegion, fellBack: false }
            : { region: DEFAULT_REGION, fellBack: true })
      );
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot URL region
  }, []);
  // Effective region for data loading, camera framing and URL writes. The map
  // mounts only after regionState resolves, so it never frames the wrong city.
  const region = regionState?.region ?? DEFAULT_REGION;
  // The capital a fallback degraded FROM (URL probe miss, or an artifact that
  // 404'd mid-session under the loader): drives the visible "showing Greater
  // Melbourne instead" notice and the data-region-fallback marker.
  const [fellBackFrom, setFellBackFrom] = useState<RegionId | null>(null);

  const {
    weights,
    shortlist,
    interestView,
    activeDomain,
    setActiveDomain,
    confidenceMode,
    toggleConfidenceMode,
    walkAccessMode,
    toggleWalkAccessMode,
    cyclabilityMode,
    toggleCyclabilityMode,
    socialHousingMode,
    toggleSocialHousingMode,
    colorblindRamp,
    toggleColorblindRamp,
    hazardLayer,
    selectHazardLayer,
    savedChecks,
    saveCheck,
    removeCheck,
    setWeightsAndSync,
    selectInterestView,
    updateShortlist,
    getShareUrl,
    noteRecentView,
    resetWeights,
  } = useMapPersonalisation(region);

  // "No layer": paint the map with no choropleth (basemap + area outlines only).
  // Local UI state - not URL-persisted.
  const [noLayer, setNoLayer] = useState(false);
  const selectDomain: typeof setActiveDomain = (id) => {
    setNoLayer(false);
    setActiveDomain(id);
  };
  const toggleNoLayer = () => setNoLayer((v) => !v);
  // Activating any choropleth/overlay must clear "No layer" so it actually paints.
  useEffect(() => {
    if (confidenceMode || walkAccessMode || cyclabilityMode || socialHousingMode || hazardLayer) {
      setNoLayer(false);
    }
  }, [confidenceMode, walkAccessMode, cyclabilityMode, socialHousingMode, hazardLayer]);

  useEffect(() => {
    if (!regionState) return; // non-default region still resolving
    let live = true;
    loadRegionPlaces(regionState.region)
      .then((r) => {
        if (!live) return;
        setPlaces(r.places);
        setLoadError(false);
        if (regionState.fellBack) {
          // URL probe miss - already resolved to melbourne; just say so.
          setFellBackFrom(urlRegion);
        } else if (r.fellBack) {
          // The artifact 404'd mid-session UNDER the loader (e.g. un-baked
          // between the switcher probe and the fetch). Revert the WHOLE app to
          // melbourne - region prop, map sources, camera - so the map never
          // sits on a 404'd sa2 source with another capital's framing. The
          // re-run of this effect for melbourne is a cached no-op.
          setFellBackFrom(regionState.region);
          setRegionState({ region: DEFAULT_REGION, fellBack: false });
          const def = getRegion(DEFAULT_REGION);
          setFocusTarget({ center: def.mapCenter, zoom: def.zoom, nonce: Date.now() });
        }
      })
      .catch((e) => {
        if (!live) return;
        console.error(e);
        setLoadError(true);
      });
    return () => {
      live = false;
    };
  }, [regionState, urlRegion]);

  // Press Escape to clear the selected-area card - a seamless "back to the map"
  // (the friend feedback: selecting an area felt like a trap with no easy exit).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Selecting an area collapses the Layers panel; clearing it brings the panel
  // back. (Manual toggle still works between selection changes.)
  useEffect(() => {
    setShowLayers(!selected);
  }, [selected]);

  const searchIndex = useMemo(() => buildSearchIndex(places), [places]);

  // Map-click selection: update the side panel only, preserving map view.
  const selectPlace = (p: Place) => {
    setSelected(p);
    noteRecentView(p.slug, p.name);
  };

  // Search / list selection: select AND pan/zoom the map in-app (no reload).
  const focusPlace = (p: Place) => {
    selectPlace(p);
    setFocusTarget({ center: p.centroid, nonce: Date.now() });
  };

  // ---- Buyer "Location Check" mode ------------------------------------
  const router = useRouter();

  // Onboarding: first-time visitors with NO share-URL state get the full-screen
  // Landing (scroll story + big address search) INSTEAD of the map; everyone
  // else lands straight on the map, where the lens-picker modal + dismissible
  // map tip cover orientation. Client-only decision so the prerendered HTML
  // and the e2e-seeded returning-user path stay byte-identical (hydration
  // renders the map shell either way) - but it runs BEFORE the first paint,
  // so a first-time visitor's first painted frame is the landing, never a
  // map-shell flash, and the OnboardingModal cannot blink open underneath.
  const [showLanding, setShowLanding] = useState(false);
  // In-session memory that the landing handled onboarding. The landing sets the
  // mlv-onboarded-v1 flag on every dismissal path, but localStorage.setItem can
  // throw where getItem works (legacy Safari private mode, quota-full) - the
  // OnboardingModal must still never fire right after the landing dismisses.
  const landingHandledRef = useRef(false);
  useBeforePaintEffect(() => {
    // One-shot first-visit gate; later URL rewrites (syncBuyerUrl) never re-gate.
    setShowLanding(shouldShowLanding(window.location.search));
  }, []);
  // Post-landing profile setup: a landing profile-card click queues the quiet
  // ProfileSetup sheet, which mounts over the map once the landing dismisses
  // (same React batch). null = skipped / closed. The stored record is inert
  // beyond lib/user-profile's greeting seam for now.
  const [profileSetup, setProfileSetup] = useState<LandingProfileChoice>(null);
  const [buyerMode, setBuyerMode] = useState(false);
  const [buyerPin, setBuyerPin] = useState<[number, number] | null>(null);
  // Pin from the shared URL at first render, so the map can initialise centred on
  // it (no whole-metro flash). Computed once; the async restore below still
  // resolves the SA2 + report.
  const [initialBuyerPin] = useState<[number, number] | null>(
    () => parseMapUrlState(searchParams.toString()).pin ?? null
  );
  const [showCycleRadius, setShowCycleRadius] = useState(false);
  // Rail/tram lines near the pin (loaded lazily when buyer mode opens).
  const [transitLines, setTransitLines] = useState<NoiseLine[]>([]);
  // Personal "fit" profile, local-only. `profileRef` mirrors it so
  // a rebuild triggered right after save reads the latest profile (not stale state).
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const profileRef = useRef<BuyerProfile | null>(null);
  useEffect(() => {
    const pf = loadBuyerProfile();
    setProfile(pf);
    profileRef.current = pf;
  }, []);
  // Floating Layers panel (desktop) auto-collapses to a pill when an area is
  // selected, so the selected-area card isn't crowded by the big panel.
  const [showLayers, setShowLayers] = useState(true);
  const [buyerSa2, setBuyerSa2] = useState<{ slug?: string; sa2Code?: string } | null>(null);
  const [buyerReport, setBuyerReport] = useState<BuyerReportData | null>(null);

  // Staleness guard for the async report-enrichment fetches. `buyerPinRef`
  // mirrors the current pin so an in-flight request (drive enrichment, parcel/
  // planning patch, SA2 resolve) can detect that the pin moved underneath it
  // and never overwrite the report for a newly dropped pin.
  const buyerPinRef = useRef<[number, number] | null>(null);
  // Monotonic report-build counter. The pin-identity guard catches a MOVED pin,
  // but not a new report generation for the SAME pin (e.g. a profile-save
  // rebuild). Async drive-enrichment captures the seq at build time and only
  // patches if it's still current, so a stale enrichment can't land on a newer
  // generation's report.
  const buildSeqRef = useRef(0);
  useEffect(() => {
    buyerPinRef.current = buyerPin;
  }, [buyerPin]);
  // "Yes, this is the property" (ParcelConfirmCard), keyed to the exact pin it
  // was confirmed for - a moved pin invalidates it automatically, and report
  // rebuilds for the SAME pin (parcel/planning patch, profile save) re-thread
  // it instead of losing it.
  const confirmedParcelRef = useRef<{
    pin: [number, number];
    value: { areaM2: number; confirmedAt: string };
  } | null>(null);
  // The Vicmap parcel shape under the current pin - fetched ONCE per pin in
  // buildReportFor and shared between the report build (lot-size ParcelInfo)
  // and the ParcelConfirmCard outline (no second WFS round-trip).
  // undefined = not resolved yet; null = the lookup failed.
  const [buyerParcelShape, setBuyerParcelShape] = useState<ParcelShape | null | undefined>(
    undefined
  );

  // Lazy-load rail/tram lines around the pin, to draw the local network.
  // Reuses the noise-line loader (same OSM source, now z14 tiles keyed by the
  // pin - the per-tile cache makes a nearby pin move a cheap re-merge).
  useEffect(() => {
    if (!buyerMode || !buyerPin) return;
    let cancelled = false;
    void ensureNoiseLines(buyerPin)
      .then((lines) => {
        if (!cancelled) {
          setTransitLines(lines.filter((l) => l.kind === "rail" || l.kind === "tram"));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [buyerMode, buyerPin]);

  // SA2 polygons live in the MapLibre sources; for the report maths we also
  // need them as JS. Lazy-load once (kept out of the initial bundle).
  const sa2GeoRef = useRef<FeatureCollection | null>(null);

  // POIs for the report maths come from the baked z14 report tiles near the
  // pin (3x3 block, ~KBs) instead of the whole 7.8 MB pois.geojson - the map's
  // own POI layer still streams the full file into MapLibre separately.
  // Caching is per tileKey inside lib/report-tiles, not per session.
  async function ensurePois(lngLat: [number, number]): Promise<Feature<Point>[]> {
    return loadPoisNear(lngLat[0], lngLat[1]);
  }
  async function ensureSa2Geo(): Promise<FeatureCollection> {
    if (sa2GeoRef.current) return sa2GeoRef.current;
    // Effective region (one-shot): pin flows can only run after the map mounts,
    // which is gated on regionState - so this never races the region probe.
    const res = await fetch(withBase(dataPath(region, "places.geojson")));
    sa2GeoRef.current = (await res.json()) as FeatureCollection;
    return sa2GeoRef.current;
  }
  // Transport-noise source lines (rail/tram/freeway) for the buyer report's
  // proximity proxy. Baked z14 tiles near the pin (the report scans <=150 m;
  // a 3x3 block guarantees ~1.9 km) instead of the 1.0 MB noise-lines.json.
  async function ensureNoiseLines(lngLat: [number, number]): Promise<NoiseLine[]> {
    return loadReportTilesNear(lngLat[0], lngLat[1], "noise");
  }
  // Nuisance source points (industrial/waste/sewage/quarry) for the buyer
  // report's disamenity proximity proxy. Lazy-loaded once on first pin.
  const nuisancePointsRef = useRef<NuisancePoint[] | null>(null);
  async function ensureNuisancePoints(): Promise<NuisancePoint[]> {
    if (nuisancePointsRef.current) return nuisancePointsRef.current;
    const res = await fetch(withBase("/data/nuisance-points.json"));
    const g = (await res.json()) as Record<NuisancePoint["kind"], [number, number][]>;
    const pts: NuisancePoint[] = [];
    (["industrial", "waste", "sewage", "quarry"] as const).forEach((k) =>
      (g[k] ?? []).forEach((coord) => pts.push({ kind: k, coord }))
    );
    nuisancePointsRef.current = pts;
    return pts;
  }
  // Train stations (OSM) for the buyer report's nearest-station distance.
  const stationsRef = useRef<Station[] | null>(null);
  async function ensureStations(): Promise<Station[]> {
    if (stationsRef.current) return stationsRef.current;
    const res = await fetch(withBase("/data/train-stations.json"));
    stationsRef.current = (await res.json()) as Station[];
    return stationsRef.current;
  }
  // Future PT stations (OSM) for the buyer report's "future transport" finding.
  const futureTransportRef = useRef<FutureStationLite[] | null>(null);
  async function ensureFutureTransport(): Promise<FutureStationLite[]> {
    if (futureTransportRef.current) return futureTransportRef.current;
    const res = await fetch(withBase("/data/future-transport.json"));
    futureTransportRef.current = (await res.json()) as FutureStationLite[];
    return futureTransportRef.current;
  }
  // Government school zones (DataVic) for the buyer report's address-level
  // zone match. Lazy-loaded once on first pin (kept out of the map bundle).
  const schoolZonesRef = useRef<SchoolZonesData | null>(null);
  async function ensureSchoolZones(): Promise<SchoolZonesData | null> {
    if (schoolZonesRef.current) return schoolZonesRef.current;
    const res = await fetch(withBase("/data/school-zones.json"));
    schoolZonesRef.current = (await res.json()) as SchoolZonesData;
    return schoolZonesRef.current;
  }
  // DTP traffic-volume (AADT) segments for the buyer report's "busy road nearby"
  // proximity finding (scans <=250 m). Baked z14 tiles near the pin instead of
  // the 1.1 MB traffic-aadt.json.
  async function ensureTraffic(lngLat: [number, number]): Promise<TrafficSegment[]> {
    return loadReportTilesNear(lngLat[0], lngLat[1], "traffic");
  }
  // EPA air-monitoring sites for the "air quality nearby" finding. Lazy-loaded.
  const epaAirRef = useRef<EpaAirSite[] | null>(null);
  async function ensureEpaAir(): Promise<EpaAirSite[]> {
    if (epaAirRef.current) return epaAirRef.current;
    const res = await fetch(withBase("/data/epa-air-sites.json"));
    const j = (await res.json()) as { sites?: EpaAirSite[] };
    epaAirRef.current = j.sites ?? [];
    return epaAirRef.current;
  }
  // Activity Centre Zones for the "in a designated activity centre" finding. Lazy-loaded.
  const activityCentresRef = useRef<ActivityCentreFeature[] | null>(null);
  async function ensureActivityCentres(): Promise<ActivityCentreFeature[]> {
    if (activityCentresRef.current) return activityCentresRef.current;
    const res = await fetch(withBase("/data/activity-centres.json"));
    const fc = (await res.json()) as { features?: ActivityCentreFeature[] };
    activityCentresRef.current = fc.features ?? [];
    return activityCentresRef.current;
  }
  // GTFS bus stops for the "bus access" finding (surfaces <=1.2 km). Baked z14
  // tiles near the pin instead of the 0.44 MB bus-stops.json.
  async function ensureBusStops(lngLat: [number, number]): Promise<BusStop[]> {
    return loadReportTilesNear(lngLat[0], lngLat[1], "bus");
  }

  const buyerPlace = useMemo(
    () =>
      buyerSa2
        ? places.find((p) => p.slug === buyerSa2.slug || p.sa2Code === buyerSa2.sa2Code) ?? null
        : null,
    [buyerSa2, places]
  );

  // Lightweight area centre-points for the buyer report's adjacency nudge (pin
  // near a neighbouring SA2 → recommend checking it). Derived once from places.
  const areaCentroids = useMemo(
    () =>
      places.map((p) => ({
        sa2Code: p.sa2Code,
        slug: p.slug,
        name: p.name,
        centroid: p.centroid,
      })),
    [places]
  );

  // Persist buyer mode + pin to the URL so a report is shareable / restorable.
  const syncBuyerUrl = (mode: boolean, pin: [number, number] | null) => {
    router.replace(
      buildMapUrl("/", {
        weights,
        shortlist,
        view: interestView,
        buyer: mode,
        pin: mode ? pin : null,
        // Effective region: serialized only when non-melbourne, so melbourne
        // URL rewrites stay byte-identical to today.
        region,
      }),
      { scroll: false }
    );
  };

  // Capital switcher (RegionSwitcher). Resolves the region directly - the
  // switcher only enables baked regions, so no second availability probe -
  // then: the places effect above reloads the dataset through the seam, the
  // map's region prop swaps its sa2/poi sources, and the existing focusTarget
  // fly-to seam (reduced-motion aware) carries the camera to the new capital
  // at its registry framing zoom. City-specific selection state is cleared;
  // buyer mode itself stays (the panel gates honestly outside melbourne).
  const switchRegion = (next: RegionId) => {
    if (next === region) return;
    setSelected(null);
    setBuyerPin(null);
    setBuyerSa2(null);
    setBuyerReport(null);
    sa2GeoRef.current = null; // pin flows must re-fetch the new region's polygons
    setFellBackFrom(null);
    setRegionState({ region: next, fellBack: false });
    const def = getRegion(next);
    setFocusTarget({ center: def.mapCenter, zoom: def.zoom, nonce: Date.now() });
    track("region_switch", { region: next });
    router.replace(
      buildMapUrl("/", {
        weights,
        shortlist,
        view: interestView,
        buyer: buyerMode,
        pin: null,
        region: next,
      }),
      { scroll: false }
    );
  };

  // Upgrade the straight-line anchor distances to real driving time + road
  // distance (OpenRouteService), when configured. Runs after the report is shown
  // (non-blocking) and patches it; bails if the pin moved underneath it.
  const enrichAnchorsWithDrive = async (
    report: BuyerReportData,
    pin: [number, number],
    seq: number
  ) => {
    if (!isDriveRoutingConfigured()) return;
    const ad = report.anchorDistances;
    if (!ad || ad.length === 0) return;
    const enriched = await Promise.all(
      ad.map(async (d) => {
        const r = await fetchDriveRoute(pin, [d.anchor.lng, d.anchor.lat]).catch(
          () => ({ ok: false as const, reason: "error" })
        );
        return r.ok ? { ...d, driveMin: r.durationMin, driveKm: r.distanceKm } : d;
      })
    );
    // Bail if the pin moved OR a newer report generation has since been built.
    if (buyerPinRef.current !== pin || seq !== buildSeqRef.current) return;
    setBuyerReport((prev) => (prev ? { ...prev, anchorDistances: enriched } : prev));
  };

  const buildReportFor = async (
    lngLat: [number, number],
    sa2: { slug?: string; sa2Code?: string } | null,
    // "pin" = an exact dropped/geocoded point (address-level findings allowed);
    // "sa2" = a suburb-search centroid (NOT a property - address-level findings
    // must fall back to area-level). Default pin for map clicks / restored pins.
    mode: "pin" | "sa2" = "pin"
  ) => {
    // Pin reports are melbourne-only today: every report input below (report
    // tiles, stations, school zones, traffic, parcels...) is melbourne-baked.
    // Outside melbourne the buyer panel shows an honest one-liner instead, so
    // never fetch melbourne tiles for another capital's pin.
    if (region !== DEFAULT_REGION) return;
    // The parcel shape belongs to the previous pin until this pin's fetch
    // resolves below - back to "not resolved yet" so the confirm card hides.
    setBuyerParcelShape(undefined);
    // Parcel-level planning (zone + overlays) is an exact-address concept and a
    // slow external gov endpoint: kick it off NOW so it runs in parallel with
    // the lens loads, but never block the first render on it (patched in below
    // with the parcel, like the lot size).
    const planningPromise: Promise<PlanningAt | null> =
      mode === "pin"
        ? fetchPlanningAt(lngLat[0], lngLat[1]).catch(() => null)
        : Promise.resolve(null);
    const [feats, noiseLines, nuisancePoints, stations, schoolZones, traffic, epaAir, activityCentres, busStops, futureStations] = await Promise.all([
      ensurePois(lngLat).catch(() => [] as Feature<Point>[]),
      ensureNoiseLines(lngLat).catch(() => [] as NoiseLine[]),
      ensureNuisancePoints().catch(() => [] as NuisancePoint[]),
      ensureStations().catch(() => [] as Station[]),
      ensureSchoolZones().catch(() => null),
      ensureTraffic(lngLat).catch(() => [] as TrafficSegment[]),
      ensureEpaAir().catch(() => [] as EpaAirSite[]),
      ensureActivityCentres().catch(() => [] as ActivityCentreFeature[]),
      ensureBusStops(lngLat).catch(() => [] as BusStop[]),
      ensureFutureTransport().catch(() => [] as FutureStationLite[]),
    ]);
    const place = sa2
      ? places.find((p) => p.slug === sa2.slug || p.sa2Code === sa2.sa2Code) ?? null
      : null;
    // A newer pin (moved/searched) may have superseded this build while the POI
    // fetches were in flight - don't overwrite the current report.
    if (buyerPinRef.current !== lngLat) return;
    // `parcel` (lot size) is the only slow, external input - a government WFS that
    // can stall for ~a minute. So render the report WITHOUT it immediately, then
    // fetch + patch the lot size in (time-bounded) so "Computing what's nearby"
    // no longer hangs on that one gov endpoint.
    const buildArgs = (parcel: ParcelInfo | null, planning: PlanningAt | null) => ({
      mode,
      lat: lngLat[1],
      lng: lngLat[0],
      place,
      pois: feats,
      noiseLines,
      nuisancePoints,
      stations,
      futureStations,
      schoolZones: schoolZones ?? undefined,
      traffic,
      epaAir,
      activityCentres,
      parcel,
      planning,
      confirmedParcel:
        confirmedParcelRef.current && confirmedParcelRef.current.pin === lngLat
          ? confirmedParcelRef.current.value
          : undefined,
      busStops,
      nearbyAreas: areaCentroids,
      majorProjects: MAJOR_PROJECTS,
      profile: profileRef.current,
    });
    const builtReport = buildBuyerReport(buildArgs(null, null));
    const seq = ++buildSeqRef.current;
    setBuyerReport(builtReport);
    track("buyer_report", { coverage: place ? "in" : "off" });
    void enrichAnchorsWithDrive(builtReport, lngLat, seq);
    // Parcel + planning are exact-address concepts: never query them for a
    // suburb centroid. Both are slow gov endpoints, so the report rendered
    // immediately above and they patch in here when/if they arrive.
    if (mode === "pin") {
      void (async () => {
        // One WFS fetch per pin: the shape feeds the ParcelConfirmCard outline
        // AND (as its ParcelInfo superset) the report's lot-size patch below.
        const [parcel, planning] = await Promise.all([
          fetchParcelShapeAt(lngLat[0], lngLat[1]).catch(() => null),
          planningPromise,
        ]);
        if (buyerPinRef.current !== lngLat) return;
        setBuyerParcelShape(parcel); // null = lookup failed -> explicit card state
        if (!parcel && !planning) return;
        if (seq !== buildSeqRef.current) return;
        setBuyerReport(buildBuyerReport(buildArgs(parcel, planning)));
      })();
    }
  };

  // Live map click in buyer mode (SA2 comes from the clicked map feature).
  const onPinDrop = (
    lngLat: [number, number],
    sa2: { slug?: string; name?: string; sa2Code?: string } | null
  ) => {
    setBuyerMode(true); // a map click enters the buyer deep-dive directly
    setSelected(null);
    setBuyerPin(lngLat);
    setBuyerSa2(sa2);
    setBuyerReport(null); // "computing" until pois resolve
    syncBuyerUrl(true, lngLat);
    void buildReportFor(lngLat, sa2);
  };

  // Search-driven location (keyboard-accessible alternative to clicking the map):
  // in buyer mode, drop the pin at the suburb/SA2 centroid; else pan the map.
  const selectFromSearch = (slug: string) => {
    const p = getPlaceBySlug(places, slug);
    if (!p) return;
    // Outside melbourne the pin deep-dive is gated (melbourne-baked tiles), so
    // an area search selects + pans instead - the area scores experience works
    // fully for any baked region.
    if (region !== DEFAULT_REGION) {
      focusPlace(p);
      return;
    }
    // Searching enters the buyer deep-dive at the area centroid; click the map
    // to refine to the exact spot.
    const c = p.centroid as [number, number];
    setBuyerMode(true);
    setSelected(null);
    setBuyerPin(c);
    setBuyerSa2({ slug: p.slug, sa2Code: p.sa2Code });
    setBuyerReport(null);
    syncBuyerUrl(true, c);
    void buildReportFor(c, { slug: p.slug, sa2Code: p.sa2Code }, "sa2");
  };

  // Full-address geocode (OSM Nominatim, client-side) → exact-pin deep-dive.
  // There is no clicked map feature, so the SA2 is resolved from geometry. This
  // mirrors a map click at the geocoded coordinate; suburb/SA2 search + map
  // clicks remain the primary flows.
  const selectFromAddress = async (r: GeocodeResult) => {
    // Enforce the same hard per-region bound that URL pins get - Nominatim's
    // bounded=1 is a preference, so don't trust an out-of-region geocode result.
    if (!inRegionBBox(r.lng, r.lat, region)) return;
    const lngLat: [number, number] = [r.lng, r.lat];
    setBuyerMode(true);
    setSelected(null);
    setBuyerPin(lngLat); // the map flies to the pin
    setBuyerSa2(null);
    setBuyerReport(null);
    syncBuyerUrl(true, lngLat);
    const fc = await ensureSa2Geo().catch(() => null);
    // A map click during the await may have moved the pin - don't stomp the new
    // pin's SA2/label with this (now stale) address result.
    if (buyerPinRef.current !== lngLat) return;
    const sa2 = fc ? findSa2ForPoint(lngLat, fc) : null;
    setBuyerSa2(sa2);
    void buildReportFor(lngLat, sa2);
    track("buyer_geocode", { coverage: sa2 ? "in" : "off" });
  };

  // Restore a pin from a shared URL (no map click → resolve the SA2 from geometry).
  const restorePin = async (lngLat: [number, number]) => {
    setBuyerPin(lngLat);
    setBuyerReport(null);
    const fc = await ensureSa2Geo().catch(() => null);
    if (buyerPinRef.current !== lngLat) return;
    const sa2 = fc ? findSa2ForPoint(lngLat, fc) : null;
    setBuyerSa2(sa2);
    void buildReportFor(lngLat, sa2);
  };

  const clearBuyerPin = () => {
    setBuyerPin(null);
    setBuyerSa2(null);
    setBuyerReport(null);
    syncBuyerUrl(true, null);
  };

  // "Yes, this is the property" - record the confirmation for the current pin
  // and patch it straight onto the on-screen report (no rebuild needed; later
  // rebuilds for the same pin re-thread it via confirmedParcelRef).
  const onConfirmParcel = (c: { areaM2: number; confirmedAt: string }) => {
    const pin = buyerPinRef.current;
    if (!pin) return;
    confirmedParcelRef.current = { pin, value: c };
    setBuyerReport((prev) =>
      prev ? { ...prev, location: { ...prev.location, confirmedParcel: c } } : prev
    );
  };

  // Saved checks (device-local retention): bookmark the current pin, or reopen a
  // saved one (regenerating the deterministic report from its coordinates).
  const currentCheckSaved = useMemo(
    () =>
      buyerPin != null &&
      savedChecks.some((c) => c.id === savedCheckId(buyerPin[1], buyerPin[0])),
    [savedChecks, buyerPin]
  );
  const toggleSaveCheck = () => {
    if (!buyerPin) return;
    const id = savedCheckId(buyerPin[1], buyerPin[0]);
    if (savedChecks.some((c) => c.id === id)) {
      removeCheck(id);
    } else {
      saveCheck({ lat: buyerPin[1], lng: buyerPin[0], areaName: buyerPlace?.name });
      track("buyer_save_check", { coverage: buyerPlace ? "in" : "off" });
    }
  };
  const openSavedCheck = (c: SavedCheck) => {
    const lngLat: [number, number] = [c.lng, c.lat];
    setBuyerMode(true);
    setSelected(null);
    syncBuyerUrl(true, lngLat);
    void restorePin(lngLat);
  };

  const toggleBuyerMode = () => {
    const next = !buyerMode;
    if (next) {
      // If an area is already selected, carry it INTO buyer mode instead of
      // dropping the user back on the whole-metro map: drop the pin at its
      // centroid (area-level report) and keep the current view, so they don't
      // have to find the area again. Click the map to refine to an exact address.
      const carry = selected;
      setSelected(null);
      if (carry && !buyerPin) {
        const c = carry.centroid as [number, number];
        setBuyerMode(true);
        setBuyerPin(c);
        setBuyerSa2({ slug: carry.slug, sa2Code: carry.sa2Code });
        setBuyerReport(null);
        setFocusTarget({ center: c, nonce: Date.now() });
        syncBuyerUrl(true, c);
        track("buyer_mode", { on: true, from: "selection" });
        void buildReportFor(c, { slug: carry.slug, sa2Code: carry.sa2Code }, "sa2");
        return;
      }
    } else {
      setBuyerPin(null);
      setBuyerSa2(null);
      setBuyerReport(null);
    }
    setBuyerMode(next);
    track("buyer_mode", { on: next });
    syncBuyerUrl(next, next ? buyerPin : null);
  };

  // One-shot restore from ?buyer=1&lat&lng once place data is available.
  const buyerRestoredRef = useRef(false);
  useEffect(() => {
    if (buyerRestoredRef.current || places.length === 0) return;
    buyerRestoredRef.current = true;
    const url = parseMapUrlState(searchParams.toString());
    if (url.buyer) {
      setBuyerMode(true);
      setSelected(null);
      if (url.pin) {
        // Validate against the EFFECTIVE region: a fell-back link (e.g. a
        // sydney pin now served the melbourne map) must not restore a pin
        // outside the region actually shown.
        if (inRegionBBox(url.pin[0], url.pin[1], region)) void restorePin(url.pin);
      } else if (url.select) {
        // Entered Buyer Check from a specific area profile - pan there so the
        // user drops their exact-address pin in the right place (no selection
        // card; buyer mode owns the panel).
        const area = places.find((pl) => pl.slug === url.select);
        if (area) setFocusTarget({ center: area.centroid, nonce: Date.now() });
      }
    } else if (url.select) {
      // Deep-link from a /places profile ("View on the map"): select the area and
      // pan to it. The hook already applied any &layer= one-shot.
      const target = places.find((pl) => pl.slug === url.select);
      if (target) focusPlace(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  // Root-relative on purpose: ShareViewButton's shareHref prepends origin +
  // the deploy base path exactly once - baking withBase() in here would double
  // the base path on GitHub Pages (404).
  const buyerShareUrl = useMemo(
    () =>
      buyerPin
        ? buildMapUrl("/", {
            weights,
            shortlist,
            view: interestView,
            buyer: true,
            pin: buyerPin,
            region,
          })
        : undefined,
    [buyerPin, weights, shortlist, interestView, region]
  );

  const personalisationControls = (
    <div className="space-y-3">
      {/* Lens - one unified set of one-tap starting points (sets layer +
          weights), kept distinct from the manual priority sliders below. */}
      <section aria-label="Lens">
        <InterestViews active={interestView} onSelect={selectInterestView} />
      </section>

      <div className="border-t border-surface-border" aria-hidden />

      {/* Adjust priorities - manual fine-tuning, collapsed by default so the
          panel stays uncluttered; the Lens presets cover most users (feedback). */}
      <section aria-label="Adjust priorities">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted hover:text-accent">
            <span>Fine-tune priorities</span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-2">
            <DomainSliders
              weights={weights}
              onChange={setWeightsAndSync}
              onReset={resetWeights}
            />
          </div>
        </details>
      </section>
    </div>
  );

  const onSaveProfile = (pf: BuyerProfile) => {
    const next = saveBuyerProfile(pf).buyerProfile ?? pf;
    setProfile(next);
    profileRef.current = next;
    setShowProfile(false);
    if (buyerPin) void buildReportFor(buyerPin, buyerSa2);
  };
  const onClearProfile = () => {
    clearBuyerProfile();
    setProfile(null);
    profileRef.current = null;
    setShowProfile(false);
    if (buyerPin) void buildReportFor(buyerPin, buyerSa2);
  };

  const buyerPanel = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-medium text-ink">Location check</h2>
        <button
          type="button"
          onClick={toggleBuyerMode}
          className="rounded-md border border-surface-border px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent"
        >
          Exit
        </button>
      </div>
      {region !== DEFAULT_REGION ? (
        // Honest gate: the pin report's inputs (report tiles, stations, school
        // zones, traffic, parcels) are melbourne-baked - no broken empty
        // sections for another capital. Area scores + compare still work.
        <p className="rounded-lg border border-dashed border-surface-border bg-surface px-3 py-4 text-sm text-ink-muted">
          Full pin reports are Melbourne-only today - your capital is coming.
        </p>
      ) : !buyerPin ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-dashed border-surface-border bg-surface px-3 py-4 text-sm text-ink-muted">
            Click the map - or search a suburb or full address in the top bar - to drop a
            pin and get a second-opinion report.
          </p>
          <SavedChecks
            checks={savedChecks}
            onOpen={openSavedCheck}
            onRemove={removeCheck}
          />
        </div>
      ) : !buyerReport ? (
        <p className="text-sm text-ink-muted">Computing what&apos;s nearby…</p>
      ) : (
        <>
          {buyerPlace ? (
            <p className="text-xs text-ink-muted">
              Pinned in <b className="text-ink">{buyerPlace.name}</b>, {buyerPlace.lga}. Click
              elsewhere on the map to move the pin.
            </p>
          ) : (
            <p className="text-xs text-ink-muted">
              This pin is outside our Greater Melbourne SA2 coverage - drop it on a Melbourne
              property for the full report.
            </p>
          )}
          {/* Personalise: a local-only profile that adds "Fit for your life" +
              deal-breaker flags to the report. */}
          {showProfile ? (
            <BuyerProfilePanel
              initial={profile}
              onSave={onSaveProfile}
              onClear={onClearProfile}
              onClose={() => setShowProfile(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowProfile(true)}
              className="w-full rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
            >
              {profile ? "Edit your preferences" : "Personalise this report"}
            </button>
          )}
          {/* 15-min walk: the radius is drawn on the map; this drops every
              buyer-relevant pin so you see what's inside the circle at once. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const ids = WALK_PIN_CATEGORIES.map((c) => c.id);
                const allOn = ids.every((id) => visiblePins[id]);
                setVisiblePins((v) => {
                  const next = { ...v };
                  for (const id of ids) next[id] = !allOn;
                  return next;
                });
              }}
              aria-pressed={WALK_PIN_CATEGORIES.every((c) => visiblePins[c.id])}
              className="inline-flex min-h-11 items-center rounded-full border border-accent bg-accent px-2.5 py-0.5 text-[11px] font-medium text-accent-ink transition-colors hover:bg-accent-focus md:min-h-0"
            >
              {WALK_PIN_CATEGORIES.every((c) => visiblePins[c.id])
                ? "Hide 15-min walk"
                : "Show 15-min walk"}
            </button>
            <span className="text-[11px] text-ink-muted">or one:</span>
            {WALK_PIN_CATEGORIES.map((c) => {
              const on = !!visiblePins[c.id];
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setVisiblePins((v) => ({ ...v, [c.id]: !v[c.id] }))}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors md:min-h-0 ${
                    on
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-surface-border text-ink-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {/* Swatch = this category's MAP PIN colour, so the toggle and the
                      coloured dots on the map are unambiguously the same thing. */}
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-white/70"
                    style={{ background: POI_CATEGORY_BY_ID[c.id as PoiCategoryId]?.color ?? "#8A857B" }}
                    aria-hidden
                  />
                  {c.label}
                </button>
              );
            })}
          </div>
          {/* Honesty label for the dashed walk ring on the map: it is a
              crow-flies circle, not a routed walk, and no coastline geometry is
              shipped to clip it - near the bay the ring crosses water. */}
          <p className="text-[11px] text-ink-muted">
            Dashed ring = straight-line distance, not a walking route.
          </p>
          {/* ~15-min bike reach ring around the pin, plus this area's mapped
              cycle-infrastructure index (context-only, never scored). */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCycleRadius((v) => !v)}
              aria-pressed={showCycleRadius}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors md:min-h-0 ${
                showCycleRadius
                  ? "border-[#0E7C86] bg-[#0E7C86] text-white"
                  : "border-surface-border text-ink-muted hover:border-[#0E7C86] hover:text-[#0E7C86]"
              }`}
            >
              <Bike className="h-3 w-3" aria-hidden />
              {showCycleRadius ? "Hide bike radius" : "Show ~15-min bike"}
            </button>
            {buyerPlace?.context?.cyclability && (
              <span className="text-[11px] text-ink-muted">
                Area cycle-infra:{" "}
                <b className="num text-ink">{buyerPlace.context.cyclability.index}</b>/100
              </span>
            )}
            {/* Honesty label: this ring is a crow-flies circle, NOT a routed
                isochrone - near the coast it overlaps water. Say so whenever
                it is visible (no coastline geometry is shipped to clip it). */}
            {showCycleRadius && (
              <span className="text-[11px] text-ink-muted">
                Approximate straight-line range - ignores roads and water.
              </span>
            )}
          </div>
          {/* Wrong-lot trust guard: the parcel outline under the pin + one-tap
              confirmation. Exact pins only (a suburb-centroid pin is not a
              property); hidden while the lookup is unresolved, and an explicit
              "could not identify the lot" state when it fails. The shape comes
              from buildReportFor's single per-pin parcel fetch. */}
          {buyerReport.mode === "pin" && buyerParcelShape !== undefined && (
            <ParcelConfirmCard
              key={`${buyerPin[0]},${buyerPin[1]}`}
              pin={buyerPin}
              shape={buyerParcelShape}
              confirmed={buyerReport.location.confirmedParcel ?? null}
              onConfirm={onConfirmParcel}
            />
          )}
          <BuyerReportPanel
            report={buyerReport}
            place={buyerPlace}
            variant="live"
            shareUrl={buyerShareUrl}
            onClear={clearBuyerPin}
            onSaveCheck={toggleSaveCheck}
            isSaved={currentCheckSaved}
          />
        </>
      )}
    </div>
  );

  // Safety choropleth is painted (no override layer) -> the legend labels the ramp
  // by crime direction (greener = less crime) instead of generic worse/better.
  const safetyLegend =
    activeDomain === "safety" &&
    !hazardLayer &&
    !walkAccessMode &&
    !cyclabilityMode &&
    !socialHousingMode &&
    !confidenceMode;

  const legendLabel = hazardLayer === "bushfire"
    ? "Bushfire-prone overlay share (context)"
    : hazardLayer === "flood"
      ? "Flood overlay share (context)"
      : walkAccessMode
        ? "15-min walk access (context, not in score)"
        : cyclabilityMode
          ? "Cyclability (context, not in score)"
          : socialHousingMode
            ? "Social-housing supply (context, not in score)"
            : confidenceMode
              ? "Data confidence (context, not in score)"
              : DOMAIN_LABELS[activeDomain];

  // The GeoJSON property currently painted on the choropleth - feeds the map
  // hover tooltip so it always reports the value the user is looking at.
  const paintedProp = hazardLayer
    ? `${hazardLayer}_share`
    : walkAccessMode
      ? "pct_walkaccess"
      : cyclabilityMode
        ? "pct_cyclability"
        : socialHousingMode
          ? "social_share"
          : confidenceMode
            ? "pct_confidence"
            : domainProperty(activeDomain);

  // Short label (no "context" suffix) for the selected-area mini-summary.
  const activeLayerLabel = hazardLayer === "bushfire"
    ? "Bushfire overlay"
    : hazardLayer === "flood"
      ? "Flood overlay"
      : walkAccessMode
        ? "15-min walk access"
        : cyclabilityMode
          ? "Cyclability"
          : socialHousingMode
            ? "Social housing"
            : confidenceMode
              ? "Data confidence"
              : DOMAIN_LABELS[activeDomain];

  const isHomeBuyer = interestView === "homeBuyer";

  // First-visit landing gate: rendered INSTEAD of the map UI, so the
  // OnboardingModal never mounts behind it. Landing sets the same
  // mlv-onboarded-v1 flag on every dismissal path, then onDismiss reveals the
  // map; a hero search pick additionally drives the existing buyer-pin seams.
  if (showLanding) {
    return (
      <Landing
        searchIndex={searchIndex}
        onGeocode={(r) => void selectFromAddress(r)}
        onAreaSelect={selectFromSearch}
        onDismiss={() => {
          landingHandledRef.current = true;
          setShowLanding(false);
        }}
        onProfileChoice={(choice) => {
          // Landing already persisted the raw choice (PROFILE_CHOICE_KEY); a
          // card click additionally opens the ProfileSetup sheet over the map.
          if (choice) setProfileSetup(choice);
        }}
      />
    );
  }

  return (
    <main
      className="flex h-screen w-screen flex-col overflow-hidden bg-bg text-ink"
      // Region seam markers. Both are OMITTED on the default melbourne path,
      // so the prerendered/e2e DOM stays identical.
      data-region={region !== DEFAULT_REGION ? region : undefined}
      data-region-fallback={fellBackFrom ?? undefined}
    >
      <h1 className="sr-only">
        {region === DEFAULT_REGION
          ? `${PRODUCT_NAME} - Greater Melbourne liveability map and pin-level Buyer Check`
          : `${PRODUCT_NAME} - ${getRegion(region).label} liveability map`}
      </h1>
      <TopBar
        searchIndex={searchIndex}
        onSearchSelect={selectFromSearch}
        onGeocode={selectFromAddress}
        region={region}
        onRegionSwitch={switchRegion}
      />

      {!landingHandledRef.current && (
      <OnboardingModal
        onPick={selectInterestView}
        onDismiss={() => {
          // Intro hand-off: the vignette's pin-zoom continues onto the REAL
          // map with a gentle flyTo to the region centre (focusTarget is
          // the existing search fly-to seam). Skipped when a shared URL
          // already framed something - never stomp a restored pin/selection.
          if (buyerMode || selected || initialBuyerPin) return;
          setFocusTarget({
            center: getRegion(region).mapCenter,
            nonce: Date.now(),
          });
        }}
      />
      )}

      {/* Post-landing profile setup sheet. Landing set the onboarded flag on
          every dismissal path, so the OnboardingModal never opens behind it. */}
      {profileSetup && (
        <ProfileSetup type={profileSetup} onClose={() => setProfileSetup(null)} />
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {/* Mount the map only once the region is resolved (synchronous for
              melbourne - identical render tree to today), so a probed region
              never initialises the camera/sources on the wrong city. The
              placeholder matches the dynamic-import loading state. */}
          {!regionState ? (
            <div className="absolute inset-0 grid place-items-center bg-surface-sunken text-sm text-ink-muted">
              Loading map...
            </div>
          ) : (
          <MelbourneMap
            className="absolute inset-0"
            region={regionState.region}
            activeDomain={activeDomain}
            confidenceMode={confidenceMode}
            walkAccessMode={walkAccessMode}
            cyclabilityMode={cyclabilityMode}
            socialHousingMode={socialHousingMode}
            colorblind={colorblindRamp}
            hazardLayer={hazardLayer}
            noLayer={noLayer}
            visiblePins={visiblePins}
            focusTarget={focusTarget}
            selectedSlug={selected?.slug ?? null}
            hoverProp={paintedProp}
            hoverLabel={activeLayerLabel}
            buyerMode={buyerMode}
            // A fell-back link's pin (validated against the URL's own region)
            // must not aim the camera outside the region actually mounted -
            // maxBounds would clamp it onto the envelope edge at zoom 14.5.
            initialBuyerPin={
              initialBuyerPin &&
              inRegionBBox(initialBuyerPin[0], initialBuyerPin[1], regionState.region)
                ? initialBuyerPin
                : null
            }
            buyerPin={buyerPin}
            anchorPoints={buyerMode ? profile?.anchors ?? [] : []}
            transitLines={buyerMode ? transitLines : []}
            showCycleRadius={showCycleRadius}
            onPinDrop={onPinDrop}
            onPlaceSelect={(props) => {
              const p = places.find(
                (x) => x.slug === props.slug || x.sa2Code === props.sa2Code
              );
              if (!p) return;
              // Click the already-selected area again to deselect (toggle) - a
              // quick way back to the clean map without hunting for the close X.
              if (selected?.slug === p.slug) setSelected(null);
              else selectPlace(p);
            }}
          />
          )}

          {/* Buyer-mode map legend: Big Build pins + (with a pin) nearby transit. */}
          {buyerMode && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-surface-border bg-surface/95 px-2.5 py-1.5 text-[11px] shadow-card backdrop-blur">
              <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-muted">
                On the map
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-white" style={{ background: "#D95F02" }} aria-hidden />
                  Big Build
                </span>
                {buyerPin && transitLines.length > 0 && (
                  <>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-4" style={{ background: "#2C6FB3" }} aria-hidden />
                      Train
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-4" style={{ background: "#1B9E77" }} aria-hidden />
                      Tram
                    </span>
                  </>
                )}
              </span>
            </div>
          )}

          {/* Buyer "Location Check" toggle - the headline interaction. */}
          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
            <button
              type="button"
              onClick={toggleBuyerMode}
              aria-pressed={buyerMode}
              className={`pointer-events-auto inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium shadow-card transition-colors md:min-h-0 ${
                buyerMode
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-surface-border bg-surface text-ink hover:border-accent hover:text-accent"
              }`}
            >
              <MapPin className="h-4 w-4" aria-hidden />
              {buyerMode ? "Exit location check" : "Check a location"}
            </button>
            {buyerMode && !buyerPin && (
              <p className="mt-2 rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-center text-xs text-ink-muted shadow-card">
                Click the map to drop a pin on a property
              </p>
            )}
          </div>

          {!buyerMode && !selected && <MapTip />}

          {/* Data-load failure - visible, recoverable (never a silent empty map). */}
          {loadError && (
            <div className="pointer-events-none absolute left-1/2 top-16 z-20 w-[min(92%,30rem)] -translate-x-1/2">
              <div
                role="alert"
                className="pointer-events-auto rounded-lg border border-[#C9DAF5] bg-[#EDF3FC] px-3 py-2 text-xs leading-snug text-[#1A43A8] shadow-card"
              >
                <span className="font-medium">Could not load area data.</span> Check your
                connection and{" "}
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="font-medium underline underline-offset-2"
                >
                  reload
                </button>
                .
              </div>
            </div>
          )}

          {/* Region fallback - visible and honest (never a silent Melbourne
              map after a link or switch whose dataset is not published yet).
              The data-load alert above covers the harder failure and wins. */}
          {fellBackFrom && !loadError && (
            <div className="pointer-events-none absolute left-1/2 top-16 z-20 w-[min(92%,30rem)] -translate-x-1/2">
              <p
                role="status"
                data-testid="region-fallback-note"
                className="pointer-events-auto rounded-lg border border-[#C9DAF5] bg-[#EDF3FC] px-3 py-2 text-xs leading-snug text-[#1A43A8] shadow-card"
              >
                <span className="font-medium">
                  {getRegion(fellBackFrom).label} is not available yet.
                </span>{" "}
                Showing Greater Melbourne instead.
              </p>
            </div>
          )}

          {/* Home-buyer caveat - visible on the map (not only the profile) so
              users never read the buyer lens as purchase-price guidance. */}
          {isHomeBuyer && !buyerMode && (
            <div className="pointer-events-none absolute left-1/2 top-16 z-10 w-[min(92%,30rem)] -translate-x-1/2">
              <p className="pointer-events-auto rounded-lg border border-surface-border border-l-[3px] border-l-accent bg-surface px-3 py-2 text-xs leading-snug text-ink shadow-card">
                <span className="font-medium text-ink">Home-buyer lens:</span>{" "}
                context only - sale/purchase prices are{" "}
                <span className="font-medium text-ink">not</span> included. This
                ranks liveability factors, not property value.
              </p>
            </div>
          )}

          {/* Floating layer-control card (top-right). Collapses to a "Layers"
              pill when an area is selected (or on demand) to keep the map clean. */}
          <div
            className={`absolute right-4 top-4 z-10 hidden md:block ${
              showLayers ? "max-h-[calc(100%-2rem)] w-56 overflow-y-auto" : ""
            }`}
          >
            {showLayers ? (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setShowLayers(false)}
                  className="flex w-full items-center justify-between rounded-lg border border-surface-border bg-surface/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted shadow-card backdrop-blur transition-colors hover:text-accent"
                  aria-expanded
                >
                  <span className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5" aria-hidden />
                    Layers
                  </span>
                  <span aria-hidden>Hide ×</span>
                </button>
                <LayerToggle
                  activeDomain={activeDomain}
                  onDomainChange={selectDomain}
                  noLayer={noLayer}
                  onNoLayerToggle={toggleNoLayer}
                  visiblePins={visiblePins}
                  onPinToggle={(pin) =>
                    setVisiblePins((v) => ({ ...v, [pin]: !v[pin] }))
                  }
                  onClearPins={() => setVisiblePins({})}
                  confidenceMode={confidenceMode}
                  onConfidenceToggle={toggleConfidenceMode}
                  walkAccessMode={walkAccessMode}
                  onWalkAccessToggle={toggleWalkAccessMode}
                  cyclabilityMode={cyclabilityMode}
                  onCyclabilityToggle={toggleCyclabilityMode}
                  socialHousingMode={socialHousingMode}
                  onSocialHousingToggle={toggleSocialHousingMode}
                  colorblindRamp={colorblindRamp}
                  onColorblindToggle={toggleColorblindRamp}
                  hazardLayer={hazardLayer}
                  onHazardSelect={selectHazardLayer}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowLayers(true)}
                aria-label="Show map layers"
                aria-expanded={false}
                className="flex items-center gap-2 rounded-full border border-surface-border bg-surface/95 px-3.5 py-1.5 text-sm font-medium text-ink shadow-card backdrop-blur transition-colors hover:border-accent hover:text-accent"
              >
                <Layers className="h-4 w-4" aria-hidden />
                Layers
              </button>
            )}
          </div>

          {/* Legend card (bottom-left) */}
          <div className="absolute bottom-4 left-4 z-10 hidden max-w-[16rem] space-y-2 md:block">
            <MapLegend
              domainLabel={legendLabel}
              visiblePins={visiblePins}
              risk={!!hazardLayer}
              social={socialHousingMode}
              safety={safetyLegend}
              colorblind={colorblindRamp}
              noLayer={noLayer}
/>
            <Attribution />
          </div>

          {/* Persistent selected-area mini-summary (desktop) - a lightweight
              map-side quick view; the rich profile lives on its own page. */}
          {selected && (
            <div className="absolute bottom-4 left-1/2 z-10 hidden w-[22rem] max-w-[calc(100%-2rem)] -translate-x-1/2 md:block">
              <SelectedSummaryCard
                place={selected}
                weights={weights}
                places={places}
                activeLayerLabel={activeLayerLabel}
                onClose={() => setSelected(null)}
                onShortlistChange={updateShortlist}
              />
            </div>
          )}

          {/* Collapse / expand the side panel (desktop) - sits on the map's right
              edge so it stays reachable whether the panel is open or hidden. */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? "Show side panel" : "Hide side panel"}
            aria-expanded={!sidebarCollapsed}
            className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 items-center rounded-l-lg border border-r-0 border-surface-border bg-surface px-1 py-3 text-ink-muted shadow-card transition-colors hover:text-accent md:flex"
          >
            {sidebarCollapsed ? (
              <PanelRightOpen className="h-4 w-4" aria-hidden />
            ) : (
              <PanelRightClose className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>

        {/* Desktop sidebar - explore tools only; ranked suburb lists are deferred
            to a future signed-in profile feature. Collapsible for a full-width map. */}
        <aside
          className={`hidden shrink-0 flex-col border-l border-surface-border bg-surface transition-[width] duration-300 ease-festra md:flex ${
            sidebarCollapsed
              ? "w-0 overflow-hidden border-l-0"
              : buyerMode
                ? "w-[460px] lg:w-[520px]"
                : "w-[372px]"
          }`}
        >
          {buyerMode ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{buyerPanel}</div>
          ) : (
            <MapSidebar
              places={places}
              onFocusPlace={focusPlace}
              controls={personalisationControls}
              shortlist={shortlist}
              onShortlistChange={updateShortlist}
              getShareUrl={getShareUrl}
            />
          )}
        </aside>
      </div>

      <MobileSheet
        buyerMode={buyerMode}
        // Half-open when there is something to show (area selection or a buyer
        // pin/report); otherwise the sheet peeks so the map stays unobscured.
        hasSelection={!!selected || (buyerMode && !!buyerPin)}
        explore={
          buyerMode ? (
            buyerPanel
          ) : (
            <div className="space-y-3">
              {selected && (
                <SelectedSummaryCard
                  place={selected}
                  weights={weights}
                  places={places}
                  activeLayerLabel={activeLayerLabel}
                  onClose={() => setSelected(null)}
                  onShortlistChange={updateShortlist}
                />
              )}
              <ExploreHint residentialCount={places.filter((p) => !p.nonResidential).length} />
            </div>
          )
        }
        search={
          <div className="space-y-3">
            {/* Capital switcher (mobile home - the top bar hides it below sm). */}
            <RegionSwitcher region={region} onSwitch={switchRegion} className="sm:hidden" />
            <SearchBox
              index={searchIndex}
              onSelect={(e) => selectFromSearch(e.slug)}
              onGeocode={selectFromAddress}
            />
            <p className="text-xs leading-snug text-ink-muted">
              Search a suburb or data area to jump the map there, or a full
              street address to drop an exact pin.
            </p>
            <ShortlistPanel
              slugs={shortlist}
              places={places}
              onChange={updateShortlist}
              onOpen={focusPlace}
            />
          </div>
        }
        layers={
          <div className="space-y-3">
            <LayerToggle
              activeDomain={activeDomain}
              onDomainChange={selectDomain}
                  noLayer={noLayer}
                  onNoLayerToggle={toggleNoLayer}
              visiblePins={visiblePins}
              onPinToggle={(pin) =>
                setVisiblePins((v) => ({ ...v, [pin]: !v[pin] }))
              }
              onClearPins={() => setVisiblePins({})}
              confidenceMode={confidenceMode}
              onConfidenceToggle={toggleConfidenceMode}
              walkAccessMode={walkAccessMode}
              onWalkAccessToggle={toggleWalkAccessMode}
              cyclabilityMode={cyclabilityMode}
              onCyclabilityToggle={toggleCyclabilityMode}
              socialHousingMode={socialHousingMode}
              onSocialHousingToggle={toggleSocialHousingMode}
              colorblindRamp={colorblindRamp}
              onColorblindToggle={toggleColorblindRamp}
              hazardLayer={hazardLayer}
              onHazardSelect={selectHazardLayer}
            />
            <MapLegend
              domainLabel={legendLabel}
              visiblePins={visiblePins}
              risk={!!hazardLayer}
              social={socialHousingMode}
              safety={safetyLegend}
              colorblind={colorblindRamp}
              noLayer={noLayer}
/>
          </div>
        }
        weights={
          <div className="space-y-3">
            {personalisationControls}
            <ShareViewButton getUrl={getShareUrl} label="Copy map link" />
          </div>
        }
      />
    </main>
  );
}

function TopBar({
  searchIndex,
  onSearchSelect,
  onGeocode,
  region,
  onRegionSwitch,
}: {
  searchIndex: ReturnType<typeof buildSearchIndex>;
  onSearchSelect: (slug: string) => void;
  onGeocode: (result: GeocodeResult) => void;
  region: RegionId;
  onRegionSwitch: (next: RegionId) => void;
}) {
  return (
    <header className="z-20 flex shrink-0 items-center gap-3 border-b border-surface-border bg-surface px-4 py-3">
      <Link href="/" className="flex shrink-0 items-center gap-2 text-ink">
        {/* Casement-F mark (same geometry as app/icon.svg), ink via currentColor */}
        <svg width="22" height="22" viewBox="0 0 26 28" aria-hidden="true" focusable="false">
          <g fill="currentColor"><circle cx="6" cy="4" r="1.9" /><circle cx="11" cy="4" r="1.9" /><circle cx="16" cy="4" r="1.9" /><circle cx="21" cy="4" r="1.9" /><circle cx="6" cy="9" r="1.9" /><circle cx="6" cy="14" r="1.9" /><circle cx="11" cy="14" r="1.9" /><circle cx="16" cy="14" r="1.9" /><circle cx="6" cy="19" r="1.9" /><circle cx="6" cy="24" r="1.9" /></g>
        </svg>
        <span className="text-base font-semibold uppercase tracking-[0.06em] text-accent">
          {PRODUCT_NAME}
        </span>
      </Link>
      <div className="hidden w-full max-w-sm flex-1 sm:block">
        <SearchBox
          index={searchIndex}
          onSelect={(e) => onSearchSelect(e.slug)}
          onGeocode={onGeocode}
        />
      </div>
      {/* Capital switcher - desktop top bar only; on mobile (<sm) it lives in
          the sheet's search controls so the 390px bar never overflows. */}
      <RegionSwitcher
        region={region}
        onSwitch={onRegionSwitch}
        className="hidden shrink-0 sm:block"
      />
      <nav className="ml-auto flex flex-wrap items-center gap-2 text-sm">
        <FeedbackButton />
        <NavLink href="/buyer">Buyer check</NavLink>
        <NavLink href="/compare">Compare</NavLink>
        <NavLink href="/account" hideOnSmall>
          Your data
        </NavLink>
        <NavLink href="/alerts" hideOnSmall>
          Alerts
        </NavLink>
        <NavLink href="/methodology" hideOnSmall>
          Methodology
        </NavLink>
        <NavLink href="/disclaimer" hideOnSmall>
          Disclaimer
        </NavLink>
      </nav>
    </header>
  );
}

function MapSidebar({
  places,
  onFocusPlace,
  controls,
  shortlist,
  onShortlistChange,
  getShareUrl,
}: {
  places: Place[];
  onFocusPlace: (p: Place) => void;
  controls: React.ReactNode;
  shortlist: string[];
  onShortlistChange: (slugs: string[]) => void;
  getShareUrl: () => string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 border-b border-surface-border px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Explore
        </h2>
        <p className="mt-1 text-sm leading-snug text-ink">
          Search where you want to live, or click the map to check a location.
        </p>
      </div>
      <div className="space-y-3 border-b border-surface-border p-3">
        <ShortlistPanel
          slugs={shortlist}
          places={places}
          onChange={onShortlistChange}
          onOpen={onFocusPlace}
        />
        <ShareViewButton getUrl={getShareUrl} label="Copy map link" />
      </div>
      <div className="space-y-3 p-3">{controls}</div>
    </div>
  );
}

function ExploreHint({ residentialCount }: { residentialCount: number }) {
  return (
    <p className="rounded-lg border border-surface-border bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-ink-muted">
      Tap the map or use Search to pick an area.
      {residentialCount > 0 && (
        <>
          {" "}
          We hold {residentialCount} residential SA2 suburbs. Saved &amp; synced
          lists are planned for signed-in profiles.
        </>
      )}
    </p>
  );
}

function NavLink({
  href,
  children,
  hideOnSmall,
}: {
  href: string;
  children: React.ReactNode;
  hideOnSmall?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md border border-surface-border px-3 py-1.5 text-ink transition-colors hover:border-accent hover:text-accent ${
        hideOnSmall ? "hidden lg:inline-block" : ""
      }`}
    >
      {children}
    </Link>
  );
}

