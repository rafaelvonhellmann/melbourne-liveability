"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Pin-anchored floating panel (desktop only). Renders absolutely inside the
 * map's `relative` container and positions itself BESIDE an anchor point given
 * in container pixels - right of it by default, flipping left near the map's
 * right edge, always clamped inside the map. A small caret on the pin-facing
 * edge tracks the anchor vertically so the card reads as attached to the pin.
 *
 * The anchor prop is expected to update on map move/zoom (the page feeds it
 * from MelbourneMap's rAF-throttled `onPinScreenMove`); placement is applied
 * straight to the DOM in a layout effect, so re-anchoring never flashes.
 */

export type FloatingAnchor = { x: number; y: number };

export type FloatingPlacement = {
  left: number;
  top: number;
  /** Which side of the anchor the panel sits on. */
  side: "right" | "left";
  /** Caret offset from the panel's top edge (px). */
  caretTop: number;
};

/** Horizontal clearance from the anchor point - enough that the panel never
 * covers the ~27px-wide map marker centred on the pin. */
export const PANEL_GAP = 24;
/** Minimum inset from the map container's edges. */
export const PANEL_MARGIN = 12;
/** Caret square edge length (see .floating-panel-caret in globals.css). */
export const CARET_SIZE = 12;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Pure placement maths - unit-tested separately from the DOM wiring. */
export function computeFloatingPlacement(args: {
  anchor: FloatingAnchor;
  panelWidth: number;
  panelHeight: number;
  containerWidth: number;
  containerHeight: number;
}): FloatingPlacement {
  const { anchor, panelWidth, panelHeight, containerWidth, containerHeight } = args;
  // Prefer the right side of the pin; flip left only when the panel would
  // spill past the map's right edge AND the left side actually fits. When
  // neither fits (very narrow map) stay right and let the clamp handle it.
  const rightLeft = anchor.x + PANEL_GAP;
  const leftLeft = anchor.x - PANEL_GAP - panelWidth;
  const fitsRight = rightLeft + panelWidth <= containerWidth - PANEL_MARGIN;
  const fitsLeft = leftLeft >= PANEL_MARGIN;
  const side: FloatingPlacement["side"] = fitsRight || !fitsLeft ? "right" : "left";
  const left = clamp(
    side === "right" ? rightLeft : leftLeft,
    PANEL_MARGIN,
    containerWidth - panelWidth - PANEL_MARGIN
  );
  // Centre the panel on the pin vertically, clamped inside the map area.
  const top = clamp(
    anchor.y - panelHeight / 2,
    PANEL_MARGIN,
    containerHeight - panelHeight - PANEL_MARGIN
  );
  // The caret keeps pointing at the pin even when the panel is edge-clamped.
  const caretTop = clamp(
    anchor.y - top - CARET_SIZE / 2,
    PANEL_MARGIN,
    panelHeight - PANEL_MARGIN - CARET_SIZE
  );
  return { left, top, side, caretTop };
}

export function FloatingPanel({
  anchor,
  label,
  children,
}: {
  /** Anchor point in the parent container's pixel space, or null to hide. */
  anchor: FloatingAnchor | null;
  /** Accessible name for the panel region. */
  label: string;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<FloatingAnchor | null>(anchor);

  const applyPlacement = useCallback(() => {
    const el = rootRef.current;
    const parent = el?.parentElement;
    const a = anchorRef.current;
    if (!el || !parent || !a) return;
    const p = computeFloatingPlacement({
      anchor: a,
      panelWidth: el.offsetWidth,
      panelHeight: el.offsetHeight,
      containerWidth: parent.clientWidth,
      containerHeight: parent.clientHeight,
    });
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
    el.dataset.side = p.side;
    if (caretRef.current) caretRef.current.style.top = `${p.caretTop}px`;
  }, []);

  // Re-place before paint on every render: the anchor prop changes per camera
  // frame, and content changes (report sections loading in) change the height.
  useLayoutEffect(() => {
    anchorRef.current = anchor;
    applyPlacement();
  });

  // Content can also resize without a React render of THIS component (e.g.
  // images/fonts inside the report) - track it so the clamp stays correct.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(applyPlacement);
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyPlacement]);

  if (!anchor) return null;

  return (
    <div
      ref={rootRef}
      role="complementary"
      aria-label={label}
      data-testid="floating-report-panel"
      // hidden md:block keeps this strictly desktop - mobile owns the sheet.
      className="floating-panel-enter absolute z-10 hidden w-[360px] md:block"
      style={{ left: 0, top: 0 }}
    >
      <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-surface-border bg-surface-raised p-3 shadow-card">
        {children}
      </div>
      {/* Connector caret on the pin-facing edge (after the card so it paints
          over the hairline border). Position set imperatively above. */}
      <div ref={caretRef} aria-hidden className="floating-panel-caret" />
    </div>
  );
}
