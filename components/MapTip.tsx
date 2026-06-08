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

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-surface-border bg-surface/95 px-3.5 py-1.5 text-xs text-ink shadow-card backdrop-blur md:flex">
      <span>
        <b className="font-medium">Tip:</b> click anywhere on the map to check a location, or
        search a suburb above.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss tip"
        className="shrink-0 rounded-full p-0.5 text-ink-muted transition-colors hover:text-accent"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
