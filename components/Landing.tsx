"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { SearchBox } from "@/components/SearchBox";
import { SiteFooter } from "@/components/SiteFooter";
import {
  LandingMap,
  NEARBY_DOT_COLORS,
  type AmenityDot,
  type CameraKeyframe,
  type LandingMapHandle,
} from "@/components/landing/LandingMap";
import { useScrollScene, type ScrollSceneState } from "@/components/landing/useScrollScene";
import {
  CaptionCard,
  CompareTable,
  GlimpsePanel,
  ReportSheet,
} from "@/components/landing/scenes";
import { PRODUCT_NAME } from "@/lib/brand";
import { DEFAULT_REGION } from "@/lib/regions";
import { parseMapUrlState } from "@/lib/share-url";
import { track } from "@/lib/analytics";
import type { SearchIndexEntry } from "@/lib/search";
import type { GeocodeResult } from "@/lib/geocode";

/**
 * Same flag the OnboardingModal reads/sets. It no longer gates the landing
 * (the landing shows on every plain visit - founder decision 2026-06); the
 * landing still WRITES it on every dismissal path so the lens-picker modal
 * never fires for a visitor the landing already oriented (e.g. a later
 * share-link entry, which bypasses the landing).
 */
export const ONBOARDED_KEY = "mlv-onboarded-v1";
/** Where the final-band profile choice is persisted for the profile flow. */
export const PROFILE_CHOICE_KEY = "mlv-profile-choice-v1";

export type LandingProfileChoice = "buyer" | "agent" | null;

type LandingProps = {
  /** Suburb / data-area search index (the same one the map's TopBar uses). */
  searchIndex: SearchIndexEntry[];
  /** Exact-address pick -> the buyer pin seam (page.tsx selectFromAddress). */
  onGeocode: (result: GeocodeResult) => void;
  /** Suburb / data-area pick -> area-centroid buyer check (selectFromSearch). */
  onAreaSelect: (slug: string) => void;
  /** Fired once on every dismissal path, after the onboarded flag is set. */
  onDismiss: () => void;
  /**
   * Final-band profile choice; null = skipped. The choice is persisted under
   * PROFILE_CHOICE_KEY before this fires - the full profile flow builds on it.
   */
  onProfileChoice: (type: LandingProfileChoice) => void;
};

/**
 * Landing gate for the map route. A plain visit to "/" ALWAYS shows the
 * landing (founder decision 2026-06: the landing greets every visit; entering
 * the map is the landing's own job - CTAs, hero search, Escape, skip link).
 * The ONLY bypass is URL state: any share / deep link that restores something
 * onto the map (?buyer, ?lat/?lng pin, ?select, ?layer, ?view + legacy
 * ?persona, ?w weights, ?list shortlist, or a non-default ?region) goes
 * straight to the map - breaking share links is not acceptable.
 *
 * Supersedes the old region-only decision of record: with the landing on
 * every plain visit, a ?region= link must deep-link to that capital's map or
 * the recipient would meet the intro on every open.
 *
 * Pure URL decision - no localStorage read, so the gate behaves identically
 * for first-time and returning visitors.
 */
export function shouldShowLanding(search: string): boolean {
  const url = parseMapUrlState(search);
  return !(
    url.buyer ||
    url.pin !== null ||
    url.select !== null ||
    url.layer !== null ||
    url.view !== null ||
    url.weights !== null ||
    url.shortlist.length > 0 ||
    url.region !== DEFAULT_REGION
  );
}

function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Pin-dot F mark (same geometry as app/icon.svg), accent via currentColor. */
function FMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 28) / 26)}
      viewBox="0 0 26 28"
      aria-hidden="true"
      focusable="false"
      className="text-accent"
    >
      <g fill="currentColor">
        <circle cx="6" cy="4" r="1.9" />
        <circle cx="11" cy="4" r="1.9" />
        <circle cx="16" cy="4" r="1.9" />
        <circle cx="21" cy="4" r="1.9" />
        <circle cx="6" cy="9" r="1.9" />
        <circle cx="6" cy="14" r="1.9" />
        <circle cx="11" cy="14" r="1.9" />
        <circle cx="16" cy="14" r="1.9" />
        <circle cx="6" cy="19" r="1.9" />
        <circle cx="6" cy="24" r="1.9" />
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * Camera script. Four resting points; five scenes drive between them:
 *   scene 1 (hero)     holds "hero" (all Australia),
 *   scene 2 (pinning)  flies hero -> approach -> pin as the user scrolls,
 *   scenes 3-5         push in gently from "pin" to "hold" across all three.
 * ------------------------------------------------------------------------- */

const KEYFRAMES: CameraKeyframe[] = [
  { id: "hero", center: [134.0, -27.2], zoom: 3.9 },
  { id: "approach", center: [144.95, -37.81], zoom: 8.5 },
  { id: "pin", center: [144.9764, -37.7699], zoom: 13.8 },
  { id: "hold", center: [144.9764, -37.7699], zoom: 14.2 },
];

/** Where the accent pin lands - Brunswick East. */
const PIN: [number, number] = [144.9764, -37.7699];

/**
 * REAL amenities around the pin, straight from the baked POI tile
 * (public/data/report-tiles/pois/14/14790/10050.json) wearing each category's
 * live map colour - so the landing shows exactly what the app would show here.
 */
const AMENITY_DOTS: AmenityDot[] = [
  { lngLat: [144.97598, -37.76945], color: "#117733" }, // Fleming Park, 62 m
  { lngLat: [144.97634, -37.77049], color: "#A6761D" }, // Joan Specialty Coffee, 65 m
  { lngLat: [144.97958, -37.77028], color: "#E6AB02" }, // Nexus Performance, 282 m
  { lngLat: [144.97959, -37.76747], color: "#377EB8" }, // East Brunswick Medical Centre, 389 m
  { lngLat: [144.98097, -37.76585], color: "#D95F02" }, // Montessori Beginnings childcare, 603 m
  { lngLat: [144.97957, -37.76479], color: "#E7298A" }, // Brunswick East Primary School, 633 m
];

/**
 * Scene section heights in vh - MUST match the h-[..vh] classes below. Used to
 * remap the hook's raw section progress onto the scene's ACTIVE window (the
 * stretch where the viewport midline is inside the section), so the camera is
 * continuous across scene handoffs: each scene's drive starts exactly where
 * the previous scene's drive ended.
 */
const SCENE_VH = [100, 150, 120, 120, 120] as const;

/**
 * Raw section progress t (0 = top at viewport bottom, 1 = bottom at viewport
 * top) -> 0..1 across the section's active window. r = height / viewport.
 */
export function sceneLocalT(t: number, heightVh: number): number {
  const r = heightVh / 100;
  const u = (t * (1 + r) - 0.5) / r;
  return u < 0 ? 0 : u > 1 ? 1 : u;
}

/** How far through scene 2's fly-in the pin drops, then the dots follow. */
const PIN_AT = 0.7;
const DOTS_AT = 0.85;

/**
 * The landing for the map route, shown on EVERY plain visit (only stateful
 * share / deep links skip it - see shouldShowLanding): the app brought
 * forward. A live (non-interactive) map is the full-screen backdrop; five
 * scroll scenes drive its camera from all-Australia down to a Brunswick East
 * pin, then preview the real product surfaces - the glimpse panel, the
 * sourced report, the compare table - before the three-door close band
 * (explore free / paid report / profile). Rendered INSTEAD of the map UI
 * (see the gating seam in app/(map)/page.tsx); every dismissal path sets
 * ONBOARDED_KEY - the same flag the OnboardingModal uses - so the modal never
 * fires afterwards.
 */
export function Landing({
  searchIndex,
  onGeocode,
  onAreaSelect,
  onDismiss,
  onProfileChoice,
}: LandingProps) {
  const rootRef = useRef<HTMLElement>(null);
  const rigRef = useRef<LandingMapHandle>(null);
  const closeBandRef = useRef<HTMLElement>(null);

  const s0 = useRef<HTMLElement>(null);
  const s1 = useRef<HTMLElement>(null);
  const s2 = useRef<HTMLElement>(null);
  const s3 = useRef<HTMLElement>(null);
  const s4 = useRef<HTMLElement>(null);
  const sceneRefs = useMemo(() => [s0, s1, s2, s3, s4], []);

  // Pin + dots flip on when scene 2's fly-in passes the zoom threshold
  // (scrub-style: scrolling back above the threshold lifts them again). These
  // are the ONLY scroll-derived React state - discrete flips, not progress.
  const [pinVisible, setPinVisible] = useState(false);
  const [dotsVisible, setDotsVisible] = useState(false);

  // Last --scene-t written per scene, so unchanged values skip the DOM write.
  const sceneTRef = useRef<number[]>([]);

  /**
   * Per-frame scroll work, entirely off the React render path: scrub each
   * scene's --scene-t custom property (CSS derives the entrance/exit ramps),
   * drive the camera piecewise with matching endpoints at every handoff
   * (scene 1 exits ON "pin"; scene 2 enters AT "pin", so the pose never jumps
   * when the active scene flips), then update the two threshold booleans -
   * same-value sets bail out of rendering, so steady scrolling re-renders
   * nothing.
   */
  const onSceneFrame = useCallback(
    ({ activeScene, progress }: ScrollSceneState) => {
      for (let i = 0; i < sceneRefs.length; i++) {
        const t = activeScene === i ? progress : activeScene > i ? 1 : 0;
        if (sceneTRef.current[i] !== t) {
          sceneTRef.current[i] = t;
          sceneRefs[i].current?.style.setProperty("--scene-t", t.toFixed(4));
        }
      }
      const rig = rigRef.current;
      if (rig) {
        if (activeScene === 0) {
          rig.setSceneProgress("hero", "approach", 0);
        } else if (activeScene === 1) {
          const u = sceneLocalT(progress, SCENE_VH[1]);
          if (u < 0.5) rig.setSceneProgress("hero", "approach", u * 2);
          else rig.setSceneProgress("approach", "pin", u * 2 - 1);
        } else {
          const u = sceneLocalT(progress, SCENE_VH[activeScene] ?? 120);
          rig.setSceneProgress("pin", "hold", (activeScene - 2 + u) / 3);
        }
      }
      const flyT =
        activeScene > 1 ? 1 : activeScene === 1 ? sceneLocalT(progress, SCENE_VH[1]) : 0;
      setPinVisible(flyT >= PIN_AT);
      setDotsVisible(flyT >= DOTS_AT);
    },
    [sceneRefs]
  );

  useScrollScene(rootRef, sceneRefs, onSceneFrame);

  // A11y: the landing is dismissible from the keyboard without scrolling -
  // Escape opens the map (same flag-then-dismiss contract as every other
  // path). Two polite exceptions: the search combobox consumed the event to
  // close its popup (defaultPrevented), or a non-empty input should clear
  // natively (type="search" Escape behaviour) before the page-level dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target;
      if (t instanceof HTMLInputElement && t.value !== "") return;
      markOnboarded();
      track("landing_escape");
      onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const pickAddress = (r: GeocodeResult) => {
    markOnboarded();
    track("landing_search", { kind: "address" });
    onGeocode(r);
    onDismiss();
  };

  const pickArea = (entry: SearchIndexEntry) => {
    markOnboarded();
    track("landing_search", { kind: "area" });
    onAreaSelect(entry.slug);
    onDismiss();
  };

  const explore = () => {
    markOnboarded();
    track("landing_explore");
    onDismiss();
  };

  /** Close-band free door - same dismissal contract, its own analytics event. */
  const openMap = () => {
    markOnboarded();
    track("landing_open_map");
    onDismiss();
  };

  /** Skip link (first focusable): straight past the scroll story to the map. */
  const skipToMap = () => {
    markOnboarded();
    track("landing_skip_link");
    onDismiss();
  };

  const chooseProfile = (type: "buyer" | "agent") => {
    try {
      localStorage.setItem(PROFILE_CHOICE_KEY, type);
    } catch {
      /* ignore */
    }
    markOnboarded();
    track("landing_profile", { choice: type });
    onProfileChoice(type);
    onDismiss();
  };

  const skipProfile = () => {
    markOnboarded();
    track("landing_profile", { choice: "skip" });
    onProfileChoice(null);
    onDismiss();
  };

  return (
    <main ref={rootRef} className="min-h-screen bg-bg text-ink">
      {/* A11y: first focusable element - keyboard/AT users skip the scroll
          story entirely (same flag-then-dismiss contract as every path). */}
      <button
        type="button"
        onClick={skipToMap}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-ink"
      >
        Skip to map
      </button>
      <div className="relative">
        {/* The live map backdrop - sticky for the whole scroll story, scrolled
            away naturally by the close band. Non-interactive; the scroll owns
            the camera via the rig's setSceneProgress seam. */}
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          <LandingMap
            ref={rigRef}
            keyframes={KEYFRAMES}
            pin={PIN}
            pinVisible={pinVisible}
            amenityDots={AMENITY_DOTS}
            dotsVisible={dotsVisible}
          />
          {/* Soft Crema veil so cards and copy stay readable over any tile. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg/30 via-transparent to-bg/20"
          />
        </div>

        {/* The five scroll scenes, overlaid on the sticky map. Sections are
            pointer-events-none so the basemap attribution stays clickable;
            interactive cards re-enable themselves. */}
        <div className="relative z-10 -mt-[100vh]">
          {/* Scene 1 - hero: wordmark + the big search over all Australia. */}
          <section
            ref={s0}
            data-testid="landing-scene-1"
            className="landing-scene pointer-events-none relative flex h-screen flex-col items-center justify-center px-4"
          >
            <Link
              href="/signin"
              onClick={() => track("landing_sign_in")}
              className="landing-el pointer-events-auto absolute right-4 top-4 rounded-md border border-surface-border bg-bg/70 px-3 py-1.5 text-sm text-ink backdrop-blur-sm transition-colors hover:border-accent hover:text-accent sm:right-6 sm:top-6"
            >
              Sign in
            </Link>

            <div className="landing-el pointer-events-auto w-full max-w-2xl rounded-lg border border-surface-border bg-bg/85 p-6 shadow-card backdrop-blur-sm sm:p-8">
              <div className="flex items-center justify-center gap-2.5">
                <FMark size={28} />
                <h1 className="font-display text-2xl font-semibold uppercase tracking-[0.06em] text-accent">
                  {PRODUCT_NAME}
                </h1>
              </div>
              <div className="mt-6 [&_form]:bg-surface-raised [&_form]:px-4 [&_form]:py-3 [&_form]:shadow-card [&_input]:text-base">
                <SearchBox
                  index={searchIndex}
                  onSelect={pickArea}
                  onGeocode={pickAddress}
                  placeholder="A window onto your new home"
                />
              </div>
              <div className="mt-5 flex flex-col items-center gap-1.5 text-sm">
                <span className="flex items-center gap-1 text-ink-muted">
                  or scroll to see how it works
                  <ChevronDown
                    className="h-4 w-4 motion-safe:animate-bounce"
                    aria-hidden
                  />
                </span>
                <button
                  type="button"
                  onClick={explore}
                  className="font-medium text-accent underline-offset-2 hover:underline"
                >
                  Explore the map
                </button>
              </div>
            </div>
          </section>

          {/* Scene 2 - pinning: the camera flies Australia -> Melbourne ->
              Brunswick East; the pin drops past the zoom threshold. */}
          <section
            ref={s1}
            data-testid="landing-scene-2"
            className="landing-scene pointer-events-none relative h-[150vh]"
          >
            <div className="sticky top-0 flex h-screen flex-col justify-end p-4 pb-10 sm:justify-center sm:p-10 lg:p-16">
              <CaptionCard
                heading="Drop a pin anywhere in Australia"
                body="Type an address or tap the map. Festra opens a window on that exact spot - here, Brunswick East."
                footnote="Every Australian capital, scored from open data."
              />
            </div>
          </section>

          {/* Scene 3 - glimpse: the right-side panel aesthetic slides in over
              the held map (bottom sheet on mobile, the app's own metaphor). */}
          <section
            ref={s2}
            data-testid="landing-scene-3"
            className="landing-scene pointer-events-none relative h-[120vh]"
          >
            <div className="sticky top-0 flex h-screen flex-col justify-end overflow-hidden sm:block">
              <div className="p-4 sm:absolute sm:left-10 sm:top-1/2 sm:max-w-sm sm:-translate-y-1/2 sm:p-0 lg:left-16">
                <CaptionCard
                  heading="Read the area in one glance"
                  body="Amenities within a walk, planning rules and noise - the picture the listing leaves out, straight off the map."
                />
              </div>
              {/* Outer div owns the desktop centering transform; the slide-in
                  animation transform lives on .landing-sheet inside so the two
                  never fight. Height hugs the content - no dead cream below. */}
              <div className="w-full sm:absolute sm:right-0 sm:top-1/2 sm:w-[340px] sm:-translate-y-1/2">
                <div className="landing-sheet pointer-events-auto max-h-[52vh] w-full overflow-y-auto overflow-x-hidden rounded-t-lg border border-surface-border bg-bg shadow-card sm:max-h-[88vh] sm:rounded-l-lg sm:rounded-tr-none sm:border-r-0">
                  <GlimpsePanel />
                </div>
              </div>
            </div>
          </section>

          {/* Scene 4 - report: the glimpse recedes; the sourced report sheet
              rises. Every line carries its source and date. */}
          <section
            ref={s3}
            data-testid="landing-scene-4"
            className="landing-scene pointer-events-none relative h-[120vh]"
          >
            {/* Desktop: the report sheet owns the centre-left; the caption sits
                clear of it on the RIGHT so it never covers the report (owner). */}
            <div className="sticky top-0 flex h-screen flex-col justify-end gap-3 overflow-hidden p-4 lg:block lg:p-0">
              <div className="lg:absolute lg:left-[7%] lg:top-1/2 lg:w-full lg:max-w-xl lg:-translate-y-1/2">
                <ReportSheet />
              </div>
              <div className="order-first lg:absolute lg:right-12 lg:top-1/2 lg:w-[340px] lg:-translate-y-1/2">
                <CaptionCard
                  heading="Go deep when you are serious"
                  body="Every line carries its source and date, so you can verify each fact before you act on it."
                />
              </div>
            </div>
          </section>

          {/* Scene 5 - compare: the table rises; shortlist and decide. */}
          <section
            ref={s4}
            data-testid="landing-scene-5"
            className="landing-scene pointer-events-none relative h-[120vh]"
          >
            {/* Mirror of scene 4: table centre-right, caption clear on the LEFT. */}
            <div className="sticky top-0 flex h-screen flex-col justify-end gap-3 overflow-hidden p-4 lg:block lg:p-0">
              {/* Owner: hard right - the table must sit clear of the pin ring. */}
              <div className="w-full sm:ml-auto sm:max-w-xl lg:absolute lg:right-4 lg:top-1/2 lg:w-full lg:-translate-y-1/2">
                <CompareTable />
              </div>
              <div className="order-first lg:absolute lg:left-12 lg:top-1/2 lg:w-[340px] lg:-translate-y-1/2">
                <CaptionCard
                  heading="Compare before you commit"
                  body="Shortlist areas as you go, compare before you commit - side by side, with Greater Melbourne as the baseline."
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Close band - the sign-in anchor and the three doors out: explore
          free, the paid report, or save a profile. Solid Crema; the sticky map
          backdrop releases here and scrolls away naturally. */}
      <section
        ref={closeBandRef}
        id="get-started"
        aria-labelledby="get-started-heading"
        className="relative z-10 border-t border-surface-border bg-bg px-4 pb-16 pt-14"
      >
        <div className="mx-auto max-w-5xl">
          <h2
            id="get-started-heading"
            className="font-display text-2xl font-semibold text-accent-focus"
          >
            Set up your window
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            The map is free to explore. Go deeper on one address when you are
            serious, or tell us who you are and the window starts shaped around it.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {/* Free door - everything already live, no gate. */}
            <div className="flex flex-col rounded-lg border border-surface-border bg-surface-raised p-5 shadow-card">
              <h3 className="font-display text-lg font-semibold text-ink">
                Explore free
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                The live map, area glimpses, suburb pages and side-by-side
                comparisons - all of it, today.
              </p>
              <p className="mt-2 text-xs text-ink-muted">No account needed.</p>
              <div className="mt-auto pt-4">
                <button
                  type="button"
                  onClick={openMap}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
                >
                  Open the map
                </button>
              </div>
            </div>

            {/* Paid door - the one-off report. No payment wiring yet; the
                sample page shows exactly what $39 buys. */}
            <div className="flex flex-col rounded-lg border border-surface-border bg-surface-raised p-5 shadow-card">
              <h3 className="font-display text-lg font-semibold text-ink">
                Buyer Report Snapshot - $39
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                A full provenance report for one specific address - every fact
                sourced and dated, a what-to-verify checklist, printable for your
                records.
              </p>
              <p className="mt-2 text-xs text-ink-muted">Available at launch.</p>
              <div className="mt-auto pt-4">
                <Link
                  href="/buyer/sample-report"
                  onClick={() => track("landing_sample_report")}
                  className="inline-block rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-accent-ink"
                >
                  See a sample report
                </Link>
              </div>
            </div>

            {/* Profile door - the compact chooser; ProfileSetup opens over the
                map after dismissal (the onProfileChoice seam in page.tsx). */}
            <div className="flex flex-col rounded-lg border border-surface-border bg-surface-raised p-5 shadow-card">
              <h3 className="font-display text-lg font-semibold text-ink">
                Save your search
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                Pick how you use {PRODUCT_NAME} and the map starts shaped around
                it.
              </p>
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => chooseProfile("buyer")}
                  className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  I am buying a home
                </button>
                <button
                  type="button"
                  onClick={() => chooseProfile("agent")}
                  className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  I work with buyers
                </button>
              </div>
              <button
                type="button"
                onClick={skipProfile}
                className="mt-2 self-start text-sm text-ink-muted underline-offset-2 hover:text-accent hover:underline"
              >
                Skip for now
              </button>
              <p className="mt-auto pt-3 text-xs text-ink-muted">
                Profiles live on this device for now - accounts are coming.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 bg-bg">
        <SiteFooter />
      </div>
    </main>
  );
}
