"use client";

import {
  INTEREST_VIEWS,
  DISPLAYED_LENSES,
  type InterestViewId,
} from "@/lib/interest-views";

type InterestViewsProps = {
  active: InterestViewId;
  onSelect: (id: InterestViewId) => void;
};

/**
 * The "Lens" picker - one unified set of one-tap starting points (formerly split
 * across Interest views + Persona presets). Each lens sets the default map layer
 * and the priority weights for how you're exploring.
 */
export function InterestViews({ active, onSelect }: InterestViewsProps) {
  const activeCfg = INTEREST_VIEWS[active];
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3 shadow-card">
      <p className="text-xs font-semibold tracking-wide text-ink-muted">
        Lens
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        A one-tap starting point - sets the map layer and priority weights for how
        you&apos;re looking. Fine-tune below any time.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {DISPLAYED_LENSES.map((id) => {
          const v = INTEREST_VIEWS[id];
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              title={v.description}
              aria-pressed={isActive}
              onClick={() => onSelect(id)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                isActive
                  ? "border-accent bg-accent font-medium text-accent-ink"
                  : "border-surface-border bg-surface-sunken text-ink hover:border-accent hover:text-accent"
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </div>
      {activeCfg && (
        <p className="mt-2 text-[11px] leading-snug text-ink-muted">
          {activeCfg.description}
        </p>
      )}
    </div>
  );
}
