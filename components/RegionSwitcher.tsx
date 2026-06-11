"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import REGIONS, {
  DEFAULT_REGION,
  REGION_IDS,
  type RegionId,
} from "@/lib/regions";
import { regionDataAvailable } from "@/lib/places-data";

/**
 * Short city name for the trigger button ("Greater Melbourne" -> "Melbourne",
 * "Canberra (ACT)" -> "Canberra"). The open list keeps the full registry label.
 */
export function regionCityName(id: RegionId): string {
  return REGIONS[id].label.replace(/^Greater /, "").replace(/\s*\(.*\)$/, "");
}

type RegionSwitcherProps = {
  /** The capital currently shown on the map. */
  region: RegionId;
  /** Fired with the target region id; the page owns URL + camera + data. */
  onSwitch: (next: RegionId) => void;
  /**
   * Availability probe, one verdict per region. Defaults to the session-cached
   * places-artifact HEAD probe (lib/places-data) - injected for tests.
   */
  checkAvailability?: (id: RegionId) => Promise<boolean>;
  className?: string;
};

/**
 * Quiet capital-city switcher for the top bar (and the mobile sheet's search
 * controls). Lists all eight greater capital regions; regions whose dataset is
 * not baked yet render disabled with a "Coming soon" hint. Availability
 * is probed lazily on first open (cached for the session in lib/places-data)
 * and never blocks the map.
 */
export function RegionSwitcher({
  region,
  onSwitch,
  checkAvailability = regionDataAvailable,
  className,
}: RegionSwitcherProps) {
  const [open, setOpen] = useState(false);
  // undefined = verdict not in yet (rendered disabled, no hint - probes are a
  // parallel HEAD per region and resolve in ms); melbourne and the current
  // region are always live without a probe.
  const [availability, setAvailability] = useState<
    Partial<Record<RegionId, boolean>>
  >({});
  const probedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Lazy availability probe - first open only. Verdicts land independently so
  // one slow region never holds the rest of the list back.
  useEffect(() => {
    if (!open || probedRef.current) return;
    probedRef.current = true;
    let live = true;
    for (const id of REGION_IDS) {
      void checkAvailability(id).then((ok) => {
        if (live) setAvailability((prev) => ({ ...prev, [id]: ok }));
      });
    }
    return () => {
      live = false;
    };
  }, [open, checkAvailability]);

  // Light dismissal: outside click or Escape closes the list.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      data-testid="region-switcher"
      className={`relative ${className ?? ""}`}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Switch capital city - current: ${REGIONS[region].label}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent md:min-h-0"
      >
        {regionCityName(region)}
        <ChevronDown
          className={`h-3.5 w-3.5 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Capital city"
          className="absolute left-0 top-full z-30 mt-1 w-60 rounded-lg border border-surface-border bg-surface p-1 shadow-card"
        >
          {REGION_IDS.map((id) => {
            // Melbourne is always baked; the shown region self-evidently is.
            const available =
              id === DEFAULT_REGION || id === region || availability[id] === true;
            const baking = !available && availability[id] === false;
            return (
              <li key={id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={id === region}
                  disabled={!available}
                  onClick={() => {
                    setOpen(false);
                    if (id !== region) onSwitch(id);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                    available
                      ? "text-ink hover:bg-surface-sunken hover:text-accent"
                      : "cursor-default text-ink-muted opacity-60"
                  }`}
                >
                  <span>{REGIONS[id].label}</span>
                  {id === region ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                  ) : baking ? (
                    <span className="shrink-0 text-[11px] text-ink-muted">
                      Coming soon
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
