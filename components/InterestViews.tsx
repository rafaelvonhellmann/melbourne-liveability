"use client";

import { INTEREST_VIEWS, type InterestViewId } from "@/lib/interest-views";

type InterestViewsProps = {
  active: InterestViewId;
  onSelect: (id: InterestViewId) => void;
};

export function InterestViews({ active, onSelect }: InterestViewsProps) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised/95 p-3 backdrop-blur">
      <p className="text-sm font-medium text-slate-200">Interest view</p>
      <p className="mt-0.5 text-xs text-slate-500">
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
              className={`rounded border px-2 py-1 text-xs ${
                active === id
                  ? "border-emerald-700 bg-emerald-900/40 text-emerald-100"
                  : "border-surface-border text-slate-300 hover:border-emerald-700"
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
