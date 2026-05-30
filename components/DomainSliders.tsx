"use client";

import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import type { DomainId, ScoreWeights } from "@/lib/types";

type DomainSlidersProps = {
  weights: ScoreWeights;
  onChange: (weights: ScoreWeights) => void;
  onReset: () => void;
};

export function DomainSliders({ weights, onChange, onReset }: DomainSlidersProps) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised/95 p-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-200">Your weights</span>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-emerald-400 hover:underline"
        >
          Reset defaults
        </button>
      </div>
      <ul className="space-y-3">
        {V1_SCORED_DOMAINS.map((id) => {
          const cfg = getDomain(id)!;
          const val = weights[id] ?? cfg.defaultWeight;
          return (
            <li key={id}>
              <label className="flex justify-between text-xs text-slate-400">
                <span>{cfg.label}</span>
                <span>{val}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={60}
                value={val}
                className="mt-1 w-full accent-emerald-500"
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
