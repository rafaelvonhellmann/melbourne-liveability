import { getScoreRamp, NO_DATA_COLOR, RISK_PALETTE, SOCIAL_PALETTE } from "@/lib/colors";
import { POI_CATEGORIES } from "@/lib/poi-categories";

type MapLegendProps = {
  domainLabel: string;
  visiblePins?: Record<string, boolean>;
  /** Hazard overlay-share layer active → use the Reds risk ramp + "less/more". */
  risk?: boolean;
  /** Social-housing supply layer active → use the Purples ramp + "less/more". */
  social?: boolean;
  /** Colourblind-safe score ramp (RdYlBu) instead of the default RdYlGn. */
  colorblind?: boolean;
};

export function MapLegend({
  domainLabel,
  visiblePins = {},
  risk = false,
  social = false,
  colorblind = false,
}: MapLegendProps) {
  const activePins = POI_CATEGORIES.filter((c) => visiblePins[c.id]);
  const stepGrad = (palette: readonly string[]) =>
    `linear-gradient(to right, ${palette
      .map((c, i) => `${c} ${(i / (palette.length - 1)) * 100}%`)
      .join(", ")})`;
  const gradient = risk
    ? stepGrad(RISK_PALETTE)
    : social
      ? stepGrad(SOCIAL_PALETTE)
      : `linear-gradient(to right, ${getScoreRamp(colorblind)
          .map(([p, c]) => `${c} ${p}%`)
          .join(", ")})`;
  const sequential = risk || social;

  return (
    <div
      className="rounded-lg border border-surface-border bg-surface/95 px-3 py-2 text-xs text-ink-muted shadow-card backdrop-blur"
      aria-label="Map legend"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        Showing on map
      </div>
      <div className="mb-1 font-medium text-ink">{domainLabel}</div>
      <div className="h-2.5 w-full rounded-sm" style={{ background: gradient }} />
      <div className="mt-1 flex justify-between text-[10px]">
        {sequential ? (
          <>
            <span>Less</span>
            <span>More</span>
          </>
        ) : (
          <>
            <span>worse</span>
            <span>better</span>
          </>
        )}
      </div>
      {risk && (
        <div className="mt-0.5 text-[10px] leading-snug">
          Share of the area under the planning overlay - not a parcel-level result.
        </div>
      )}
      {social && (
        <div className="mt-0.5 text-[10px] leading-snug">
          Share of dwellings that are social housing (public + community) - supply,
          not a measure of residents.
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-3 rounded-sm"
          style={{ background: NO_DATA_COLOR }}
        />
        {risk ? "No overlay mapped" : "No / low resident data"}
      </div>

      {activePins.length > 0 && (
        <div className="mt-2 border-t border-surface-border pt-2">
          <div className="mb-1 font-medium text-ink">Pins</div>
          <ul className="space-y-0.5">
            {activePins.map((c) => (
              <li key={c.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
                  style={{ background: c.color }}
                  aria-hidden
                />
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
