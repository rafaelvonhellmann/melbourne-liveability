"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ListOrdered, Search, Layers, SlidersHorizontal } from "lucide-react";

export type MobileTabId = "explore" | "search" | "layers" | "weights";

/** Sheet height states: peek (header only), half (~52vh), full (~92dvh). */
export type SheetPosition = "peek" | "half" | "full";

const POSITIONS: SheetPosition[] = ["peek", "half", "full"];

const POSITION_LABEL: Record<SheetPosition, string> = {
  peek: "collapsed",
  half: "half height",
  full: "full screen",
};

type TabDef = {
  id: MobileTabId;
  label: string;
  icon: typeof ListOrdered;
};

// No ranked "Results" tab - the scored ranking is deferred to a future signed-in
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
  /**
   * A selection / buyer report exists. The sheet opens at half when this turns
   * true (never shrinking a manual full) and collapses back to peek when it
   * clears, so the map is unobscured whenever there is nothing to show.
   */
  hasSelection?: boolean;
};

/** Pointer travel (px) past which a handle gesture is a drag, not a tap. */
const DRAG_PX = 32;

/**
 * Compact mobile bottom sheet with explicit tabs (Explore / Search / Layers /
 * Weights) and three height positions (peek / half / full).
 * Tabs follow the WAI-ARIA tabs pattern (tablist/tab/tabpanel + roving arrow
 * keys); the drag handle cycles positions on tap (keyboard-activatable) and
 * steps one position per drag. Relies on the global focus-visible ring /
 * reduced-motion handling in globals.css.
 */
export function MobileSheet({
  explore,
  search,
  layers,
  weights,
  buyerMode = false,
  hasSelection = false,
}: MobileSheetProps) {
  const [active, setActive] = useState<MobileTabId>("explore");
  const [position, setPosition] = useState<SheetPosition>(hasSelection ? "half" : "peek");
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dragStartY = useRef<number | null>(null);
  const suppressClick = useRef(false);

  // Follow the selection: a new selection/report opens the sheet to half;
  // clearing it collapses back to peek so the map is fully visible again.
  useEffect(() => {
    setPosition((p) => (hasSelection ? (p === "peek" ? "half" : p) : "peek"));
  }, [hasSelection]);

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

  /** Step one position up (+1) or down (-1), clamped at the ends. */
  const step = (dir: 1 | -1) => {
    setPosition((p) => {
      const idx = POSITIONS.indexOf(p) + dir;
      return POSITIONS[Math.max(0, Math.min(POSITIONS.length - 1, idx))];
    });
  };

  // Drag the handle: a pointer release within DRAG_PX is left to the click
  // handler (tap / Enter / Space -> cycle); past it the sheet steps one
  // position toward the drag and the synthetic click that follows is swallowed.
  const onHandlePointerDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onHandlePointerUp = (e: React.PointerEvent) => {
    if (dragStartY.current == null) return;
    const dy = e.clientY - dragStartY.current;
    dragStartY.current = null;
    if (Math.abs(dy) > DRAG_PX) {
      step(dy < 0 ? 1 : -1);
      suppressClick.current = true;
    }
  };
  const onHandleClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setPosition((p) => POSITIONS[(POSITIONS.indexOf(p) + 1) % POSITIONS.length]);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 md:hidden">
      <div
        data-position={position}
        className={`pointer-events-auto flex flex-col rounded-t-2xl border border-surface-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-card transition-[height] duration-300 ease-sheet ${
          position === "full" ? "h-[92dvh]" : ""
        }`}
      >
        <button
          type="button"
          onClick={onHandleClick}
          onPointerDown={onHandlePointerDown}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={() => {
            dragStartY.current = null;
          }}
          aria-label={`Resize panel (${POSITION_LABEL[position]})`}
          className="flex h-7 w-full shrink-0 cursor-grab touch-none items-center justify-center pt-1 active:cursor-grabbing"
        >
          <span className="h-1 w-10 rounded-full bg-surface-border" aria-hidden />
        </button>

        <div
          role="tablist"
          aria-label="Map panels"
          onKeyDown={onKeyDown}
          className="flex shrink-0 gap-1 border-b border-surface-border px-2 pb-2 pt-1"
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
                onClick={() => {
                  setActive(t.id);
                  // Picking a tab from peek must reveal its panel (the e2e
                  // journeys rely on this: tab click -> panel visible).
                  setPosition((p) => (p === "peek" ? "half" : p));
                }}
                className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
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
            hidden={position === "peek" || activeId !== t.id}
            tabIndex={0}
            className={`overflow-y-auto p-3 ${
              position === "full" ? "min-h-0 flex-1" : "max-h-[52vh]"
            }`}
          >
            {panels[t.id]}
          </div>
        ))}
      </div>
    </div>
  );
}
