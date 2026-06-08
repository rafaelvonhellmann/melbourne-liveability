"use client";

import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import type { ScoreWeights } from "@/lib/types";

type DomainSlidersProps = {
  weights: ScoreWeights;
  onChange: (weights: ScoreWeights) => void;
  onReset: () => void;
};

export function DomainSliders({ weights, onChange, onReset }: DomainSlidersProps) {
  // Sliders hold RAW weights; the label shows each one's SHARE of the score, so a
  // drag never rescales the others' handles (only the score does the normalising).
  const total = V1_SCORED_DOMAINS.reduce(
    (s, id) => s + (weights[id] ?? getDomain(id)!.defaultWeight),
    0
  );
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-ink-muted">
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
        Drag to set how much each factor matters; the % is its share of your match score. Separate from
        which layer is painted on the map.
      </p>
      <ul className="space-y-3">
        {V1_SCORED_DOMAINS.map((id) => {
          const cfg = getDomain(id)!;
          const val = weights[id] ?? cfg.defaultWeight;
          const share = total > 0 ? Math.round((val / total) * 100) : 0;
          return (
            <li key={id}>
              <label className="flex justify-between text-xs text-ink-muted">
                <span>{cfg.label}</span>
                <span className="num">{share}%</span>
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
