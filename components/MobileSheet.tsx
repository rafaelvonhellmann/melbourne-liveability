"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { ListOrdered, Search, Layers, SlidersHorizontal } from "lucide-react";

export type MobileTabId = "results" | "search" | "layers" | "weights";

type TabDef = {
  id: MobileTabId;
  label: string;
  icon: typeof ListOrdered;
};

// Results first — the review flagged that mobile buried the ranked list behind
// sliders/controls. Order here is the visible tab order, left to right.
const TABS: TabDef[] = [
  { id: "results", label: "Results", icon: ListOrdered },
  { id: "search", label: "Search", icon: Search },
  { id: "layers", label: "Layers", icon: Layers },
  { id: "weights", label: "Weights", icon: SlidersHorizontal },
];

type MobileSheetProps = {
  results: ReactNode;
  search: ReactNode;
  layers: ReactNode;
  weights: ReactNode;
};

/**
 * Compact mobile bottom sheet with explicit tabs (Results / Search / Layers /
 * Weights). Results is the default so the ranked list is reachable first.
 * Tabs follow the WAI-ARIA tabs pattern (tablist/tab/tabpanel + roving arrow
 * keys) and rely on the global focus-visible ring / reduced-motion handling.
 */
export function MobileSheet({ results, search, layers, weights }: MobileSheetProps) {
  const [active, setActive] = useState<MobileTabId>("results");
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const panels: Record<MobileTabId, ReactNode> = {
    results,
    search,
    layers,
    weights,
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = TABS.findIndex((t) => t.id === active);
    if (idx < 0) return;
    let nextIdx = idx;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = TABS.length - 1;
    else return;
    e.preventDefault();
    const next = TABS[nextIdx];
    setActive(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 md:hidden">
      <div className="pointer-events-auto rounded-t-2xl border border-surface-border bg-surface shadow-card">
        <div className="flex justify-center pt-2" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-surface-border" />
        </div>

        <div
          role="tablist"
          aria-label="Map panels"
          onKeyDown={onKeyDown}
          className="flex gap-1 border-b border-surface-border px-2 pb-2 pt-1"
        >
          {TABS.map((t) => {
            const selected = active === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                role="tab"
                id={`${baseId}-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                type="button"
                onClick={() => setActive(t.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  selected
                    ? "bg-accent text-accent-ink"
                    : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>

        {TABS.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={`${baseId}-panel-${t.id}`}
            aria-labelledby={`${baseId}-tab-${t.id}`}
            hidden={active !== t.id}
            tabIndex={0}
            className="max-h-[52vh] overflow-y-auto p-3"
          >
            {panels[t.id]}
          </div>
        ))}
      </div>
    </div>
  );
}
