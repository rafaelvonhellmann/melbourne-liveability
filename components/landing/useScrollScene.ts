"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Scroll-scene resolution for the landing's scroll-driven map rig
 * (components/landing/LandingMap.tsx). The landing renders N scene sections
 * over a sticky full-viewport map; this hook turns the scroll position into
 * { activeScene, progress } frames which the landing consumes IMPERATIVELY
 * (writing --scene-t custom properties and driving the map rig's
 * setSceneProgress seam). Progress deliberately never flows through React
 * state: a setState per scroll tick would re-render the whole landing tree
 * up to 60 times a second - the callback keeps scroll work off the render
 * path entirely (the landing flips real state only at discrete thresholds).
 *
 * The math lives in two exported pure functions (sceneProgress /
 * pickActiveScene) so it is unit-testable without a DOM; the hook is the thin
 * wiring layer: IntersectionObserver for activation nudges + a passive scroll
 * listener with a rAF throttle for the intra-scene 0..1 progress. SSR-safe -
 * nothing touches window at module scope, and jsdom without
 * IntersectionObserver simply runs on the scroll listener alone.
 */

/** Viewport-relative box of one scene section (getBoundingClientRect subset). */
export type SceneRect = { top: number; height: number };

export type ScrollSceneState = { activeScene: number; progress: number };

/**
 * Travel progress of a section through the viewport, clamped to 0..1:
 * 0 when its top edge sits at the viewport bottom (about to enter),
 * 1 when its bottom edge reaches the viewport top (fully passed).
 */
export function sceneProgress(top: number, height: number, viewportH: number): number {
  const travel = viewportH + height;
  if (travel <= 0) return 0;
  const t = (viewportH - top) / travel;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Which scene owns the viewport right now: the section containing the
 * viewport midline; when the midline falls in a gap (or past either end),
 * the section whose centre is nearest. Empty input -> scene 0.
 */
export function pickActiveScene(rects: SceneRect[], viewportH: number): number {
  if (rects.length === 0) return 0;
  const mid = viewportH / 2;
  let nearest = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const { top, height } = rects[i];
    if (top <= mid && top + height > mid) return i;
    const dist = Math.abs(top + height / 2 - mid);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = i;
    }
  }
  return nearest;
}

/**
 * Calls `onFrame` with { activeScene, progress } for the scene sections under
 * `sceneRefs` - once on mount (restored scroll) and then at most once per
 * animation frame while the position changes. Identical consecutive frames
 * are skipped. `containerRef` is the landing scroll root - listened to when
 * it is its own scroll container; the window listener covers the (default)
 * document scroller. Listeners are passive, measurement is rAF-throttled,
 * everything is cleaned up on unmount. The latest `onFrame` is always used
 * without re-binding listeners.
 */
export function useScrollScene(
  containerRef: RefObject<HTMLElement | null>,
  sceneRefs: ReadonlyArray<RefObject<HTMLElement | null>>,
  onFrame: (state: ScrollSceneState) => void
): void {
  // Latest refs/callback without re-binding listeners when identities churn.
  const sceneRefsRef = useRef(sceneRefs);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    sceneRefsRef.current = sceneRefs;
    onFrameRef.current = onFrame;
  });

  const sceneCount = sceneRefs.length;

  useEffect(() => {
    if (typeof window === "undefined" || sceneCount === 0) return;
    let frame: number | null = null;
    let last: ScrollSceneState | null = null;

    const measure = () => {
      frame = null;
      const viewportH = window.innerHeight || 1;
      const rects: SceneRect[] = [];
      for (const r of sceneRefsRef.current) {
        const el = r.current;
        if (!el) return; // a scene not mounted yet - measure on the next event
        const b = el.getBoundingClientRect();
        rects.push({ top: b.top, height: b.height });
      }
      const activeScene = pickActiveScene(rects, viewportH);
      const progress = sceneProgress(
        rects[activeScene].top,
        rects[activeScene].height,
        viewportH
      );
      if (last && last.activeScene === activeScene && last.progress === progress) {
        return;
      }
      last = { activeScene, progress };
      onFrameRef.current(last);
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(measure);
    };

    measure(); // initial position (e.g. restored scroll)

    const container = containerRef.current;
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    if (container) container.addEventListener("scroll", schedule, { passive: true });

    // Activation nudges: cheap wake-ups as sections enter/leave, so progress
    // stays honest even for scroll-less jumps (anchor links, find-in-page).
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(schedule, { threshold: [0, 0.25, 0.5, 0.75, 1] });
      for (const r of sceneRefsRef.current) {
        if (r.current) io.observe(r.current);
      }
    }

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (container) container.removeEventListener("scroll", schedule);
      io?.disconnect();
    };
  }, [containerRef, sceneCount]);
}
