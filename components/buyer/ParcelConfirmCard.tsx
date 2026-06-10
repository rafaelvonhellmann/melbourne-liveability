"use client";

import { useEffect, useState } from "react";
import { fetchParcelShapeAt, type ParcelShape } from "@/lib/parcel";

/**
 * Parcel confirmation - the wrong-lot trust guard (P1-5). After a pin drops we
 * fetch the Vicmap parcel polygon under it and show a tiny static outline +
 * lot area, asking "Is this the property?". One tap records the confirmation
 * (threaded into report.location.confirmedParcel by the caller); a wrong lot
 * is fixed by moving the pin, not by arguing with the card.
 *
 * Honesty rules: when the parcel lookup fails the card says so explicitly
 * (parcel findings fall back to the pin location - the user should verify the
 * lot on VicPlan) instead of silently omitting; it never blocks or degrades
 * the report. The card only disappears entirely while a lookup is still in
 * flight (or when there is no pin at all - the callers' guard). No map
 * instance: the outline is a plain SVG path projected from the polygon ring.
 *
 * The owning page can pass the already-fetched `shape` down (single parcel
 * fetch per pin); without the prop the card fetches standalone (back-compat).
 */

const VIEW = 96; // square viewBox edge
const PAD = 5;

/** Project a lng/lat ring + pin into viewBox coords (metre-true aspect). */
export function projectRingToSvg(
  ring: [number, number][],
  pin: [number, number]
): { path: string; pinX: number; pinY: number } | null {
  if (ring.length < 4) return null;
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const [x, y] of ring) {
    if (x < minLng) minLng = x;
    if (x > maxLng) maxLng = x;
    if (y < minLat) minLat = y;
    if (y > maxLat) maxLat = y;
  }
  // Metres per degree differ for lng vs lat - correct so the lot isn't squashed.
  const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)) || 1;
  const spanX = (maxLng - minLng) * kx;
  const spanY = maxLat - minLat;
  const span = Math.max(spanX, spanY);
  if (!(span > 0)) return null;
  const scale = (VIEW - PAD * 2) / span;
  // Centre the smaller dimension inside the square box.
  const offX = PAD + ((VIEW - PAD * 2) - spanX * scale) / 2;
  const offY = PAD + ((VIEW - PAD * 2) - spanY * scale) / 2;
  const px = (lng: number) => offX + (lng - minLng) * kx * scale;
  const py = (lat: number) => offY + (maxLat - lat) * scale;
  const path =
    ring
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(1)} ${py(y).toFixed(1)}`)
      .join(" ") + " Z";
  return { path, pinX: px(pin[0]), pinY: py(pin[1]) };
}

export function ParcelConfirmCard({
  pin,
  confirmed,
  onConfirm,
  adjustHint = "Is this the property? Drag the pin to adjust.",
  shape,
}: {
  /** The dropped pin, [lng, lat]. */
  pin: [number, number];
  /** Already-confirmed state (report.location.confirmedParcel), if any. */
  confirmed?: { areaM2: number; confirmedAt: string } | null;
  onConfirm?: (c: { areaM2: number; confirmedAt: string }) => void;
  /** The "wrong lot?" instruction - differs between the map and /buyer/report. */
  adjustHint?: string;
  /**
   * Parcel shape already resolved by the owning page (one WFS fetch per pin,
   * shared with the report build). `null` = the owner's lookup failed; omit
   * the prop entirely to let the card fetch standalone (back-compat).
   */
  shape?: ParcelShape | null;
}) {
  const standalone = shape === undefined;
  // undefined = standalone fetch still in flight; null = lookup failed.
  const [fetched, setFetched] = useState<ParcelShape | null | undefined>(undefined);

  useEffect(() => {
    if (!standalone) return; // the owner already fetched the shape - never re-fetch
    let live = true;
    setFetched(undefined);
    const ctrl = new AbortController();
    void fetchParcelShapeAt(pin[0], pin[1], ctrl.signal).then((p) => {
      if (live) setFetched(p);
    });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [pin, standalone]);

  const parcel = standalone ? fetched : shape;
  // Still resolving -> nothing yet (the report itself is never blocked).
  if (parcel === undefined) return null;
  const proj = parcel ? projectRingToSvg(parcel.ring, pin) : null;
  // Lookup failed / nothing usable under the pin -> say so explicitly instead
  // of vanishing: parcel-level findings stand on the pin location, so the user
  // must know there is no confirmed lot behind them.
  if (!parcel || !proj) {
    return (
      <div className="rounded-lg border border-surface-border bg-surface p-3 text-xs leading-relaxed text-ink-muted">
        <p className="font-medium text-ink">Could not identify the lot at this pin</p>
        <p className="mt-0.5">
          Parcel-level findings use the pin location; verify the lot on{" "}
          <a
            href="https://mapshare.vic.gov.au/vicplan/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            VicPlan
          </a>
          .
        </p>
      </div>
    );
  }

  const m2 = Math.round(parcel.areaM2).toLocaleString("en-AU");
  const lotLabel = parcel.lot
    ? `Lot ${parcel.lot}${parcel.plan ? ` ${parcel.plan}` : ""}`
    : null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3">
      <div className="flex items-start gap-3">
        <svg
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          className="h-20 w-20 shrink-0 text-accent"
          role="img"
          aria-label="Outline of the land parcel under the pin"
        >
          <path
            d={proj.path}
            fill="currentColor"
            fillOpacity={0.08}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <circle cx={proj.pinX} cy={proj.pinY} r={3.5} fill="currentColor" />
        </svg>
        <div className="min-w-0 flex-1 text-xs leading-relaxed text-ink-muted">
          <p className="font-medium text-ink">The lot under your pin</p>
          <p className="mt-0.5">
            About <b className="num text-ink">{m2} m2</b>
            {lotLabel ? <> ({lotLabel})</> : null}.
          </p>
          {confirmed ? (
            <p className="mt-1.5 font-medium text-ink">
              <span aria-hidden>&#10003;</span> Confirmed as the property you&apos;re checking.
            </p>
          ) : (
            <>
              <p className="mt-1.5">{adjustHint}</p>
              <button
                type="button"
                onClick={() =>
                  onConfirm?.({
                    areaM2: parcel.areaM2,
                    confirmedAt: new Date().toISOString(),
                  })
                }
                className="mt-1.5 rounded-md border border-accent bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink transition-colors hover:bg-accent-focus"
              >
                Yes - this is the property
              </button>
            </>
          )}
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-ink-muted">
        Vicmap parcel boundary (CC BY 4.0) under the dropped point - indicative, a single
        parcel, not a substitute for the title.
      </p>
    </div>
  );
}
