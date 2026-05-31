import { DATA_PALETTE, NO_DATA_COLOR } from "@/lib/colors";
import { POI_CATEGORIES } from "@/lib/poi-categories";

type MapLegendProps = {
  domainLabel: string;
  visiblePins?: Record<string, boolean>;
};

export function MapLegend({ domainLabel, visiblePins = {} }: MapLegendProps) {
  const activePins = POI_CATEGORIES.filter((c) => visiblePins[c.id]);

  return (
    <div
      className="rounded-lg border border-surface-border bg-surface/95 px-3 py-2 text-xs text-ink-muted shadow-card backdrop-blur"
      aria-label="Map legend"
    >
      <div className="mb-1 font-medium text-ink">{domainLabel}</div>
      <div className="flex gap-0.5">
        {DATA_PALETTE.map((c) => (
          <span
            key={c}
            className="h-2.5 w-6 rounded-sm"
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="num mt-1 flex justify-between">
        <span>0</span>
        <span>100</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-3 rounded-sm"
          style={{ background: NO_DATA_COLOR }}
        />
        No / low resident data
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
