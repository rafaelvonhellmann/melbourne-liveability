"use client";

import { INTEREST_VIEWS, type InterestViewId } from "@/lib/interest-views";

type InterestViewsProps = {
  active: InterestViewId;
  onSelect: (id: InterestViewId) => void;
};

export function InterestViews({ active, onSelect }: InterestViewsProps) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Interest view
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Tailors default layer and weights to how you are exploring.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(INTEREST_VIEWS) as InterestViewId[]).map((id) => {
          const v = INTEREST_VIEWS[id];
          return (
            <button
              key={id}
              type="button"
              title={v.description}
              onClick={() => onSelect(id)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active === id
                  ? "border-accent bg-accent font-medium text-accent-ink"
                  : "border-surface-border bg-surface-sunken text-ink hover:border-accent hover:text-accent"
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
