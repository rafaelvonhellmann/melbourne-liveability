"use client";

import { Layers } from "lucide-react";
import { DOMAIN_REGISTRY } from "@/lib/domains";
import type { DomainId } from "@/lib/types";

type LayerToggleProps = {
  activeDomain: DomainId;
  onDomainChange: (id: DomainId) => void;
  visiblePins: Record<string, boolean>;
  onPinToggle: (pinType: string) => void;
  confidenceMode?: boolean;
  onConfidenceToggle?: () => void;
  walkAccessMode?: boolean;
  onWalkAccessToggle?: () => void;
  cyclabilityMode?: boolean;
  onCyclabilityToggle?: () => void;
};

export function LayerToggle({
  activeDomain,
  onDomainChange,
  visiblePins,
  onPinToggle,
  confidenceMode = false,
  onConfidenceToggle,
  walkAccessMode = false,
  onWalkAccessToggle,
  cyclabilityMode = false,
  onCyclabilityToggle,
}: LayerToggleProps) {
  return (
    <div
      className="rounded-lg border border-surface-border bg-surface/95 p-2.5 shadow-card backdrop-blur"
      role="group"
      aria-label="Map layers"
    >
      <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <Layers className="h-3.5 w-3.5" aria-hidden />
        Map layer
      </div>
      <ul className="space-y-1">
        {DOMAIN_REGISTRY.filter((d) => d.scored && d.layer !== "context").map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onDomainChange(d.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                activeDomain === d.id
                  ? "bg-accent font-semibold text-accent-ink"
                  : "text-ink hover:bg-surface-sunken"
              }`}
              aria-pressed={activeDomain === d.id}
            >
              <span>{d.label}</span>
              <span
                className={`num text-xs ${
                  activeDomain === d.id ? "text-accent-ink/80" : "text-ink-muted"
                }`}
              >
                {d.defaultWeight}%
              </span>
            </button>
            {d.pinTypes && d.pinTypes.length > 0 && activeDomain === d.id && (
              <ul className="ml-3 mt-1 space-y-0.5 border-l border-surface-border pl-2">
                {d.pinTypes.map((pin) => (
                  <li key={pin}>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
                      <input
                        type="checkbox"
                        checked={visiblePins[pin] ?? true}
                        onChange={() => onPinToggle(pin)}
                        className="rounded border-surface-border accent-accent"
                      />
                      {pin} pins
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {(onConfidenceToggle || onWalkAccessToggle || onCyclabilityToggle) && (
        <div className="mt-2.5 space-y-1.5 border-t border-surface-border pt-2.5">
          <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Context layers
          </div>
          {onWalkAccessToggle && (
            <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-ink">
              <input
                type="checkbox"
                checked={walkAccessMode}
                onChange={onWalkAccessToggle}
                className="rounded border-surface-border accent-accent"
              />
              15-min walk access
              <span className="text-xs text-ink-muted">(not in score)</span>
            </label>
          )}
          {onCyclabilityToggle && (
            <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-ink">
              <input
                type="checkbox"
                checked={cyclabilityMode}
                onChange={onCyclabilityToggle}
                className="rounded border-surface-border accent-accent"
              />
              Cyclability
              <span className="text-xs text-ink-muted">(not in score)</span>
            </label>
          )}
          {onConfidenceToggle && (
            <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-ink">
              <input
                type="checkbox"
                checked={confidenceMode}
                onChange={onConfidenceToggle}
                className="rounded border-surface-border accent-accent"
              />
              Data confidence
              <span className="text-xs text-ink-muted">(not in score)</span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
