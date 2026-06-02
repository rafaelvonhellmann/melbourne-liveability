"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { ListOrdered, Search, Layers, SlidersHorizontal } from "lucide-react";

export type MobileTabId = "explore" | "search" | "layers" | "weights";

type TabDef = {
  id: MobileTabId;
  label: string;
  icon: typeof ListOrdered;
};

// No ranked "Results" tab — the scored ranking is deferred to a future signed-in
// profile feature (matches the desktop sidebar, which carries explore tools only).
const TABS: TabDef[] = [
  { id: "explore", label: "Explore", icon: ListOrdered },
  { id: "search", label: "Search", icon: Search },
  { id: "layers", label: "Layers", icon: Layers },
  { id: "weights", label: "Weights", icon: SlidersHorizontal },
];

// In Buyer Check mode the "Weights" (domain sliders) tab is hidden: Buyer Mode is
// a context lens and must never surface the scored composite. Explore (the buyer
// panel), Search and Layers (map backdrop + POI pins) stay.
const BUYER_HIDDEN_TABS: MobileTabId[] = ["weights"];

type MobileSheetProps = {
  explore: ReactNode;
  search: ReactNode;
  layers: ReactNode;
  weights: ReactNode;
  /** When true, hide the scored Weights tab (lens-not-scored). */
  buyerMode?: boolean;
};

/**
 * Compact mobile bottom sheet with explicit tabs (Explore / Results / Search /
 * Layers / Weights).
 * Tabs follow the WAI-ARIA tabs pattern (tablist/tab/tabpanel + roving arrow
 * keys) and rely on the global focus-visible ring / reduced-motion handling.
 */
export function MobileSheet({ explore, search, layers, weights, buyerMode = false }: MobileSheetProps) {
  const [active, setActive] = useState<MobileTabId>("explore");
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const tabs = buyerMode ? TABS.filter((t) => !BUYER_HIDDEN_TABS.includes(t.id)) : TABS;
  // If the active tab is hidden (e.g. just entered buyer mode while on Results),
  // fall back to the first visible tab.
  const activeId = tabs.some((t) => t.id === active) ? active : tabs[0].id;

  const panels: Record<MobileTabId, ReactNode> = {
    explore,
    search,
    layers,
    weights,
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = tabs.findIndex((t) => t.id === activeId);
    if (idx < 0) return;
    let nextIdx = idx;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = tabs.length - 1;
    else return;
    e.preventDefault();
    const next = tabs[nextIdx];
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
          {tabs.map((t) => {
            const selected = activeId === t.id;
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

        {tabs.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={`${baseId}-panel-${t.id}`}
            aria-labelledby={`${baseId}-tab-${t.id}`}
            hidden={activeId !== t.id}
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
