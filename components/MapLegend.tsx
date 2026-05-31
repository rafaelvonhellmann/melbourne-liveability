import { DATA_PALETTE, NO_DATA_COLOR } from "@/lib/colors";

type MapLegendProps = {
  domainLabel: string;
};

export function MapLegend({ domainLabel }: MapLegendProps) {
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
        No resident data
      </div>
    </div>
  );
}
