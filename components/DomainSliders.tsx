"use client";

import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import type { ScoreWeights } from "@/lib/types";

type DomainSlidersProps = {
  weights: ScoreWeights;
  onChange: (weights: ScoreWeights) => void;
  onReset: () => void;
};

export function DomainSliders({ weights, onChange, onReset }: DomainSlidersProps) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Your priorities
        </span>
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-medium text-accent hover:underline"
        >
          Reset defaults
        </button>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-ink-muted">
        These weights drive the ranked list. They are separate from which layer
        is painted on the map.
      </p>
      <ul className="space-y-3">
        {V1_SCORED_DOMAINS.map((id) => {
          const cfg = getDomain(id)!;
          const val = weights[id] ?? cfg.defaultWeight;
          return (
            <li key={id}>
              <label className="flex justify-between text-xs text-ink-muted">
                <span>{cfg.label}</span>
                <span className="num">{val}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={60}
                value={val}
                className="mt-1 w-full accent-accent"
                onChange={(e) =>
                  onChange({ ...weights, [id]: Number(e.target.value) })
                }
                aria-label={`${cfg.label} weight`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
