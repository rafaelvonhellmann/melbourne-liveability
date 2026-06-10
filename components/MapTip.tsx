"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const TIP_KEY = "mlv-map-tip-v1";

/**
 * A single dismissible one-line orientation tip on the map - the lightweight
 * replacement for the old forced /welcome scroll-story. Shown once (localStorage),
 * never to returning visitors who have dismissed it.
 */
export function MapTip() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(TIP_KEY) !== "1");
    } catch {
      /* storage blocked - just don't show the tip */
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(TIP_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  // Mobile: sits above the bottom sheet's peek header (safe-area aware) so
  // first-time phone users get the same one-line orientation as desktop.
  return (
    <div className="pointer-events-auto absolute bottom-[calc(7rem+env(safe-area-inset-bottom))] left-1/2 z-10 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-surface-border bg-surface/95 px-3.5 py-1.5 text-xs text-ink shadow-card backdrop-blur md:bottom-4 md:rounded-full">
      <span>
        <b className="font-medium">Tip:</b> click anywhere on the map to check a location, or
        search a suburb above.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss tip"
        className="-my-3 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-accent"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
