import Link from "next/link";
import type { IndicatorValue } from "@/lib/types";
import type { MetricDef } from "@/lib/metric-catalog";
import { formatMetricValue } from "@/lib/metric-catalog";
import type { BenchmarkStats } from "@/lib/benchmarks";
import { getSource } from "@/lib/sources";
import { percentileToColor } from "@/lib/colors";
import { StalenessBadge } from "./StalenessBadge";

type MetricCardProps = {
  def: MetricDef;
  /** This SA2's indicator value (raw + percentile + provenance). */
  value?: IndicatorValue;
  /** Greater-Melbourne distribution for the raw indicator. */
  benchmark?: BenchmarkStats;
  /** Optional deep-link to view this domain layer on the map. */
  mapHref?: string | null;
};

/**
 * Rich metric card adapted from the Analisa.pt category-tab card anatomy:
 * name + value + unit, honest direction, a Greater-Melbourne benchmark band
 * (GM median + P25–P75 range with this area's value and percentile), source +
 * staleness, and an explicit "no trend data" note (we hold a single period).
 */
export function MetricCard({ def, value, benchmark, mapHref }: MetricCardProps) {
  const source = getSource(value?.sourceId);
  const measured = value != null && !value.missing && value.raw != null;
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
          No data held for this SA2 — omitted from the benchmark.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-surface-border pt-2.5">
        <div className="min-w-0 text-[11px] text-ink-muted">
          <span className="text-ink-muted">Source: </span>
          {source ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="text-ink-muted underline decoration-dotted underline-offset-2 hover:text-accent"
            >
              {source.name.split(" — ")[0]}
            </a>
          ) : (
            <span className="text-ink">{value?.sourceId ?? "—"}</span>
          )}
        </div>
        <StalenessBadge period={source?.period} stale={value?.stale} />
      </div>

      <p className="mt-2 text-[11px] text-ink-muted">
        <span aria-hidden>•</span> Single period — no trend data held.
      </p>

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
  const p75Pos = pos(p75, min, max);
  const medianPos = pos(median, min, max);
  const fmt = (v: number) => formatMetricValue(v, def.format);

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-ink-muted">
        <span>vs Greater Melbourne ({benchmark.count} SA2s)</span>
        {percentile != null && (
          <span className="num font-medium text-ink">
            {percentile.toFixed(0)} percentile
          </span>
        )}
      </div>

      <div
        className="relative h-3 rounded bg-surface-sunken"
        role="img"
        aria-label={`${def.label}: this area ${fmt(raw)} ${def.unit}${
          percentile != null ? `, ${percentile.toFixed(0)}th percentile` : ""
        }. Greater Melbourne P25 ${fmt(p25)}, median ${fmt(median)}, P75 ${fmt(
          p75
        )}, range ${fmt(min)} to ${fmt(max)}.`}
      >
        {/* P25–P75 interquartile range */}
        <span
          className="absolute top-0 h-full rounded bg-ink-muted/25"
          style={{ left: `${p25Pos}%`, width: `${Math.max(0, p75Pos - p25Pos)}%` }}
        />
        {/* GM median marker */}
        <span
          className="absolute top-[-2px] h-[calc(100%+4px)] w-px bg-ink-muted"
          style={{ left: `${medianPos}%` }}
          aria-hidden
        />
        {/* This area's value */}
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
          style={{
            left: `${valuePos}%`,
            background: percentileToColor(percentile),
          }}
          aria-hidden
        />
      </div>

      <div className="num mt-1.5 flex justify-between text-[10px] text-ink-muted">
        <span>{fmt(min)}</span>
        <span>
          P25 {fmt(p25)} · med {fmt(median)} · P75 {fmt(p75)}
        </span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}
