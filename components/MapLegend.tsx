import { getScoreRamp, NO_DATA_COLOR, RISK_PALETTE } from "@/lib/colors";
import { POI_CATEGORIES } from "@/lib/poi-categories";

type MapLegendProps = {
  domainLabel: string;
  visiblePins?: Record<string, boolean>;
  /** Hazard overlay-share layer active → use the Reds risk ramp + "less/more". */
  risk?: boolean;
  /** Colourblind-safe score ramp (RdYlBu) instead of the default RdYlGn. */
  colorblind?: boolean;
};

export function MapLegend({
  domainLabel,
  visiblePins = {},
  risk = false,
  colorblind = false,
}: MapLegendProps) {
  const activePins = POI_CATEGORIES.filter((c) => visiblePins[c.id]);
  const gradient = risk
    ? `linear-gradient(to right, ${RISK_PALETTE.map(
        (c, i) => `${c} ${(i / (RISK_PALETTE.length - 1)) * 100}%`
      ).join(", ")})`
    : `linear-gradient(to right, ${getScoreRamp(colorblind)
        .map(([p, c]) => `${c} ${p}%`)
        .join(", ")})`;

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
        {risk ? (
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
          Share of the area under the planning overlay — not a parcel-level result.
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
