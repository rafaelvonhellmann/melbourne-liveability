"use client";

import { useState } from "react";
import { Layers, MapPin, Info } from "lucide-react";
import { DOMAIN_REGISTRY, getDomain } from "@/lib/domains";
import type { DomainId } from "@/lib/types";
import { POI_CATEGORIES, POI_GROUPS, POI_CATEGORY_BY_ID } from "@/lib/poi-categories";

type LayerToggleProps = {
  activeDomain: DomainId;
  onDomainChange: (id: DomainId) => void;
  visiblePins: Record<string, boolean>;
  onPinToggle: (pinType: string) => void;
  onClearPins?: () => void;
  confidenceMode?: boolean;
  onConfidenceToggle?: () => void;
  walkAccessMode?: boolean;
  onWalkAccessToggle?: () => void;
  cyclabilityMode?: boolean;
  onCyclabilityToggle?: () => void;
  socialHousingMode?: boolean;
  onSocialHousingToggle?: () => void;
  colorblindRamp?: boolean;
  onColorblindToggle?: () => void;
  hazardLayer?: "bushfire" | "flood" | null;
  onHazardSelect?: (layer: "bushfire" | "flood") => void;
  /** "No layer": areas shown in outline only (basemap, no choropleth). */
  noLayer?: boolean;
  onNoLayerToggle?: () => void;
};

export function LayerToggle({
  activeDomain,
  onDomainChange,
  visiblePins,
  onPinToggle,
  onClearPins,
  confidenceMode = false,
  onConfidenceToggle,
  walkAccessMode = false,
  onWalkAccessToggle,
  cyclabilityMode = false,
  onCyclabilityToggle,
  socialHousingMode = false,
  onSocialHousingToggle,
  colorblindRamp = false,
  onColorblindToggle,
  hazardLayer = null,
  onHazardSelect,
  noLayer = false,
  onNoLayerToggle,
}: LayerToggleProps) {
  // Which layer's explainer to show (hover or keyboard-focus of its info button).
  const [describe, setDescribe] = useState<DomainId | null>(null);
  const activePinCount = POI_CATEGORIES.filter(
    (c) => visiblePins[c.id]
  ).length;
  const activeContext =
    walkAccessMode || cyclabilityMode || socialHousingMode || confidenceMode || !!hazardLayer;
  const activeLabel = noLayer
    ? "No layer (outlines only)"
    : activeContext
    ? hazardLayer === "bushfire"
      ? "Bushfire overlay"
      : hazardLayer === "flood"
        ? "Flood overlay"
        : walkAccessMode
          ? "15-min walk access"
          : cyclabilityMode
            ? "Cyclability"
            : socialHousingMode
              ? "Social housing"
              : "Data confidence"
    : (getDomain(activeDomain)?.label ?? activeDomain);
  return (
    <div
      className="rounded-lg border border-surface-border bg-surface/95 p-2.5 shadow-card backdrop-blur"
      role="group"
      aria-label="Map layer (what is painted on the map)"
    >
      <div className="mb-0.5 flex items-center gap-2 px-1 text-xs font-semibold tracking-wide text-ink-muted">
        <Layers className="h-3.5 w-3.5" aria-hidden />
        Showing on map
      </div>
      <p className="mb-2 px-1 text-[11px] leading-snug text-ink-muted">
        Recolours the map only - this does not change your ranking.{" "}
        <span className="text-ink">{activeLabel}</span>
      </p>
      <ul className="space-y-1">
        <li className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNoLayerToggle?.()}
            className={`flex flex-1 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
              noLayer ? "bg-accent font-semibold text-accent-ink" : "text-ink hover:bg-surface-sunken"
            }`}
            aria-pressed={noLayer}
          >
            <span>No layer</span>
            {noLayer && (
              <span className="text-[10px] font-medium tracking-wide text-accent-ink">
                On map
              </span>
            )}
          </button>
        </li>
        {DOMAIN_REGISTRY.filter((d) => d.scored && d.layer !== "context").map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-1"
            onMouseEnter={() => setDescribe(d.id)}
            onMouseLeave={() => setDescribe((cur) => (cur === d.id ? null : cur))}
          >
            <button
              type="button"
              onClick={() => onDomainChange(d.id)}
              className={`flex flex-1 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                !activeContext && !noLayer && activeDomain === d.id
                  ? "bg-accent font-semibold text-accent-ink"
                  : "text-ink hover:bg-surface-sunken"
              }`}
              aria-pressed={!activeContext && !noLayer && activeDomain === d.id}
            >
              <span>{d.label}</span>
              {!activeContext && !noLayer && activeDomain === d.id && (
                <span className="text-[10px] font-medium tracking-wide text-accent-ink">
                  On map
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label={`What does the ${d.label} layer show?`}
              onFocus={() => setDescribe(d.id)}
              onBlur={() => setDescribe((cur) => (cur === d.id ? null : cur))}
              className="shrink-0 rounded p-1 text-ink-muted transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Info className="h-3.5 w-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {describe && (
        <p
          role="status"
          aria-live="polite"
          className="mt-1.5 rounded-md border border-surface-border bg-surface-sunken px-2 py-1.5 text-[11px] leading-snug text-ink-muted"
        >
          <span className="font-medium text-ink">{getDomain(describe)?.label}:</span>{" "}
          {getDomain(describe)?.description}
        </p>
      )}

      {/* Points of interest - user-controlled, off by default, colour-coded by
          category (a categorical palette, separate from the YlGnBu data ramp). */}
      <div className="mt-2.5 border-t border-surface-border pt-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-muted">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            Pins
          </span>
          {activePinCount > 0 && onClearPins && (
            <button
              type="button"
              onClick={onClearPins}
              className="rounded px-1.5 py-0.5 text-[11px] text-ink-muted transition-colors hover:text-accent"
            >
              Clear ({activePinCount})
            </button>
          )}
        </div>
        {activePinCount === 0 && (
          <p className="mb-1.5 px-1 text-[11px] leading-snug text-ink-muted">
            None shown. Tick a category to drop its pins on the map.
          </p>
        )}
        <div className="space-y-1.5">
          {POI_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-1 text-[10px] font-semibold tracking-wide text-ink-muted">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.ids.map((id) => {
                  const cat = POI_CATEGORY_BY_ID[id];
                  if (!cat) return null;
                  const on = visiblePins[cat.id] ?? false;
                  return (
                    <li key={cat.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-ink hover:bg-surface-sunken">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => onPinToggle(cat.id)}
                          className="rounded border-surface-border accent-accent"
                        />
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
                          style={{ background: cat.color }}
                          aria-hidden
                        />
                        <span className="flex-1">{cat.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {(onConfidenceToggle ||
        onWalkAccessToggle ||
        onCyclabilityToggle ||
        onSocialHousingToggle ||
        onHazardSelect) && (
        <div className="mt-2.5 space-y-1.5 border-t border-surface-border pt-2.5">
          <div className="mb-1 px-1 text-xs font-semibold tracking-wide text-ink-muted">
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
          {onSocialHousingToggle && (
            <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-ink">
              <input
                type="checkbox"
                checked={socialHousingMode}
                onChange={onSocialHousingToggle}
                className="rounded border-surface-border accent-accent"
              />
              Social housing
              <span className="text-xs text-ink-muted">(supply %)</span>
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
          {onHazardSelect && (
            <>
              <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={hazardLayer === "bushfire"}
                  onChange={() => onHazardSelect("bushfire")}
                  className="rounded border-surface-border accent-accent"
                />
                Bushfire risk
                <span className="text-xs text-ink-muted">(overlay share)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={hazardLayer === "flood"}
                  onChange={() => onHazardSelect("flood")}
                  className="rounded border-surface-border accent-accent"
                />
                Flood risk
                <span className="text-xs text-ink-muted">(overlay share)</span>
              </label>
            </>
          )}
        </div>
      )}

      {onColorblindToggle && (
        <div className="mt-2.5 space-y-1.5 border-t border-surface-border pt-2.5">
          <div className="mb-1 px-1 text-xs font-semibold tracking-wide text-ink-muted">
            Display
          </div>
          <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-ink">
            <input
              type="checkbox"
              checked={colorblindRamp}
              onChange={onColorblindToggle}
              className="rounded border-surface-border accent-accent"
            />
            Colourblind-safe colours
            <span className="text-xs text-ink-muted">(red→blue)</span>
          </label>
        </div>
      )}
    </div>
  );
}
