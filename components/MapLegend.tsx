type MapLegendProps = {
  domainLabel: string;
};

export function MapLegend({ domainLabel }: MapLegendProps) {
  return (
    <div
      className="rounded-lg border border-surface-border bg-surface-raised/95 px-3 py-2 text-xs backdrop-blur"
      aria-label="Map legend"
    >
      <div className="mb-1 font-medium text-slate-200">{domainLabel}</div>
      <div className="flex items-center gap-2">
        <span className="text-slate-500">Low</span>
        <div
          className="h-2 flex-1 rounded"
          style={{
            background:
              "linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)",
          }}
        />
        <span className="text-slate-500">High</span>
      </div>
      <div className="mt-1 flex gap-3 text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-slate-600" />
          No data
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-slate-500" />
          Non-residential
        </span>
      </div>
    </div>
  );
}
