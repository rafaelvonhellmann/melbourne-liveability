import Link from "next/link";
import type { IndicatorValue } from "@/lib/types";
import type { MetricDef } from "@/lib/metric-catalog";
import { formatMetricValue } from "@/lib/metric-catalog";
import type { BenchmarkStats } from "@/lib/benchmarks";
import type { PlaceSeries } from "@/lib/timeseries";
import { MIN_TREND_POINTS } from "@/lib/timeseries";
import { getSource, shortSourceName } from "@/lib/sources";
import { percentileToColor } from "@/lib/colors";
import { Sparkline } from "./Sparkline";

type MetricCardProps = {
  def: MetricDef;
  value?: IndicatorValue;
  benchmark?: BenchmarkStats;
  series?: PlaceSeries;
  mapHref?: string | null;
};

export function MetricCard({ def, value, benchmark, series, mapHref }: MetricCardProps) {
  const source = getSource(value?.sourceId);
  const measured = value != null && !value.missing && value.raw != null;
  const hasTrend = series != null && series.points.length >= MIN_TREND_POINTS;
  const directionLabel = def.higherIsBetter
    ? "Higher is better"
    : "Lower is better";

  return (
    <article className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-display text-base font-medium leading-tight text-ink">
            {def.label}
          </h4>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-sunken px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
            <span aria-hidden>{def.higherIsBetter ? "▲" : "▼"}</span>
            {directionLabel}
          </span>
        </div>
        <div className="text-right">
          <div className="num text-2xl font-semibold leading-none text-ink">
            {measured ? formatMetricValue(value!.raw, def.format) : "—"}
          </div>
          <div className="text-[11px] text-ink-muted">{def.unit}</div>
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-muted">{def.description}</p>

      {measured && benchmark ? (
        <BenchmarkBand
          def={def}
          raw={value!.raw!}
          percentile={value!.percentile}
          benchmark={benchmark}
        />
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-surface-border bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
          No data held for this area - omitted from the benchmark.
        </p>
      )}

      <div className="mt-3 border-t border-surface-border pt-2.5 text-[11px] text-ink-muted">
        <span className="text-ink-muted">Source: </span>
        {source ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-ink-muted underline decoration-dotted underline-offset-2 hover:text-accent"
          >
            {shortSourceName(source.name)}
          </a>
        ) : (
          <span className="text-ink">{value?.sourceId ?? "—"}</span>
        )}
        {source?.period && <span> · as of {source.period}</span>}
        {value?.stale && <span className="text-[#9A552F]"> · may be out of date</span>}
      </div>

      {hasTrend && (
        <Sparkline
          series={series!}
          format={(v) => formatMetricValue(v, def.format)}
        />
      )}

      {mapHref && (
        <Link
          href={mapHref}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          Show on map →
        </Link>
      )}
    </article>
  );
}

function pos(v: number, min: number, max: number): number {
  if (!(max > min)) return 50;
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
}

function BenchmarkBand({
  def,
  raw,
  percentile,
  benchmark,
}: {
  def: MetricDef;
  raw: number;
  percentile: number | null;
  benchmark: BenchmarkStats;
}) {
  const { min, p25, median, p75, max } = benchmark;
  const valuePos = pos(raw, min, max);
  const p25Pos = pos(p25, min, max);
  const medPos = pos(median, min, max);
  const p75Pos = pos(p75, min, max);
  const dotColor =
    percentile != null ? percentileToColor(percentile) : "var(--ink-muted)";

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between text-[11px] text-ink-muted">
        <span>Greater Melbourne</span>
        {percentile != null && (
          <span className="num font-medium text-ink">{Math.round(percentile)}th pct</span>
        )}
      </div>
      <div
        className="relative h-3 rounded bg-surface-sunken"
        role="img"
        aria-label={`${def.label}: this area ${formatMetricValue(raw, def.format)} ${def.unit}${
          percentile != null ? `, ${Math.round(percentile)}th percentile` : ""
        }. Greater Melbourne median ${formatMetricValue(median, def.format)}, 25th to 75th percentile ${formatMetricValue(
          p25,
          def.format
        )} to ${formatMetricValue(p75, def.format)}.`}
      >
        <div
          className="absolute top-0 h-full rounded bg-ink-muted/25"
          style={{ left: `${p25Pos}%`, width: `${Math.max(0, p75Pos - p25Pos)}%` }}
        />
        <div
          className="absolute top-[-2px] h-[calc(100%+4px)] w-px bg-ink-muted"
          style={{ left: `${medPos}%` }}
          title={`Greater Melbourne median: ${formatMetricValue(median, def.format)}`}
        />
        <div
          className="absolute top-[-3px] h-[calc(100%+6px)] w-1.5 rounded-full border border-white shadow-sm"
          style={{ left: `${valuePos}%`, marginLeft: -3, background: dotColor }}
          title="This area"
        />
      </div>
      <div className="num mt-1 flex justify-between text-[10px] text-ink-muted">
        <span>Lower 25% {formatMetricValue(p25, def.format)}</span>
        <span>Median {formatMetricValue(median, def.format)}</span>
        <span>Top 25% {formatMetricValue(p75, def.format)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border border-white"
            style={{ background: dotColor }}
            aria-hidden
          />
          this area
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-px bg-ink-muted" aria-hidden /> Greater Melbourne median
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-ink-muted/25" aria-hidden />{" "}
          middle 50%
        </span>
      </div>
    </div>
  );
}
