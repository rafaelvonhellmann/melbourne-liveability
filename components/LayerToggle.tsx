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
      className="rounded-lg border border-surface-border bg-surface-raised/95 p-3 shadow-lg backdrop-blur"
      role="group"
      aria-label="Map layers"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
        <Layers className="h-4 w-4" aria-hidden />
        Domains
      </div>
      <ul className="space-y-1">
        {DOMAIN_REGISTRY.filter((d) => d.scored && d.layer !== "context").map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onDomainChange(d.id)}
              className={`w-full rounded px-2 py-1.5 text-left text-sm transition ${
                activeDomain === d.id
                  ? "bg-emerald-900/50 text-emerald-100"
                  : "text-slate-300 hover:bg-surface-border/50"
              }`}
              aria-pressed={activeDomain === d.id}
            >
              <span className="font-medium">{d.label}</span>
              <span className="ml-1 text-xs text-slate-500">
                {d.defaultWeight}%
              </span>
            </button>
            {d.pinTypes && d.pinTypes.length > 0 && activeDomain === d.id && (
              <ul className="ml-3 mt-1 space-y-0.5 border-l border-surface-border pl-2">
                {d.pinTypes.map((pin) => (
                  <li key={pin}>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={visiblePins[pin] ?? true}
                        onChange={() => onPinToggle(pin)}
                        className="rounded border-surface-border"
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
        <div className="mt-3 space-y-1 border-t border-surface-border pt-2">
          <div className="mb-1 text-xs font-medium text-slate-400">Context layers</div>
          {onWalkAccessToggle && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={walkAccessMode}
                onChange={onWalkAccessToggle}
                className="rounded border-surface-border"
              />
              15-min walk access
              <span className="text-xs text-slate-500">(not in score)</span>
            </label>
          )}
          {onCyclabilityToggle && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={cyclabilityMode}
                onChange={onCyclabilityToggle}
                className="rounded border-surface-border"
              />
              Cyclability
              <span className="text-xs text-slate-500">(not in score)</span>
            </label>
          )}
          {onConfidenceToggle && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={confidenceMode}
                onChange={onConfidenceToggle}
                className="rounded border-surface-border"
              />
              Data confidence
              <span className="text-xs text-slate-500">(not in score)</span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
