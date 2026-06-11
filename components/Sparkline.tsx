import Link from "next/link";
import type { PlaceSeries } from "@/lib/timeseries";
import { geoLabel } from "@/lib/timeseries";

type SparklineProps = {
  series: PlaceSeries;
  /** Formats a raw value for display (e.g. metric-catalog `formatMetricValue`). */
  format: (v: number) => string;
  width?: number;
  height?: number;
  /** Stretch the chart to fill its container (the wide /places trend cards). */
  fluid?: boolean;
};

/**
 * Lightweight inline-SVG sparkline for a real, multi-period indicator series —
 * NO chart library, fully static-export safe. Context only: these trends are
 * never fed into any score.
 *
 * Honesty: plots only the real points held (no interpolation/extrapolation),
 * labels the series' true geography (so an LGA trend never implies SA2
 * precision), and states the period range. Direction is encoded redundantly
 * (arrow glyph + sign + a colourblind-safe blue/orange pair, never colour
 * alone). No animation - reduced-motion friendly by construction.
 */
export function Sparkline({ series, format, width = 132, height = 34, fluid = false }: SparklineProps) {
  const pts = series.points;
  const first = pts[0];
  const last = pts[pts.length - 1];

  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 3;
  const span = max - min;

  const x = (i: number) =>
    pts.length <= 1 ? width / 2 : pad + (i / (pts.length - 1)) * (width - 2 * pad);
  const y = (v: number) =>
    span <= 0 ? height / 2 : height - pad - ((v - min) / span) * (height - 2 * pad);

  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${x(pts.length - 1).toFixed(1)},${(height - pad).toFixed(
    1
  )} L${x(0).toFixed(1)},${(height - pad).toFixed(1)} Z`;

  // Direction relative to "good": improving vs worsening for this indicator.
  const delta = last.value - first.value;
  const pctChange = first.value !== 0 ? (delta / Math.abs(first.value)) * 100 : null;
  const rising = delta > 0;
  const flat = delta === 0;
  const better = flat ? null : rising === series.higherIsBetter;

  // Colourblind-safe: blue (#2c7fb8, "data-4") for better, orange accent for
  // worse, neutral ink for flat. Always paired with an arrow + sign below.
  // "Better" blue darkened from #2c7fb8 to meet WCAG 4.5:1 on the cream surface
  // (the small delta text was 4.12:1); "worse" orange + flat grey already pass.
  const color = flat ? "#5C5C6E" : better ? "#1f6aa6" : "#B42318";
  const arrow = flat ? "→" : rising ? "▲" : "▼";

  const deltaText =
    pctChange == null
      ? `${rising ? "+" : ""}${format(delta)}`
      : `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(pctChange >= 10 || pctChange <= -10 ? 0 : 1)}%`;

  const directionWord = flat ? "no change" : better ? "improving" : "worsening";

  const ariaLabel =
    `${series.label} trend (${geoLabel(series.geo).toLowerCase()}): ` +
    `${format(first.value)} ${series.unit} in ${first.period} to ` +
    `${format(last.value)} ${series.unit} in ${last.period}, ` +
    `${directionWord} ${pctChange != null ? `${Math.abs(pctChange).toFixed(0)}%` : ""} ` +
    `across ${pts.length} periods. ${series.periodLabel}.`;

  return (
    <figure className="mt-3 m-0">
      <div className="flex items-center gap-2.5">
        <svg
          width={fluid ? "100%" : width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          className={`overflow-visible ${fluid ? "w-full min-w-0 flex-1" : "shrink-0"}`}
          preserveAspectRatio="none"
        >
          <path d={areaPath} fill={color} fillOpacity={0.1} stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={x(pts.length - 1)}
            cy={y(last.value)}
            r={3.4}
            fill={color}
            stroke="#FDFDFD"
            strokeWidth={1.2}
          />
        </svg>
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span
              className="num inline-flex items-center gap-0.5 text-xs font-semibold"
              style={{ color }}
            >
              <span aria-hidden>{arrow}</span>
              {deltaText}
            </span>
            {/* Say the good/bad meaning in a word, so it never rests on colour alone. */}
            {!flat && (
              <span className="text-[10px] font-medium" style={{ color }}>
                {better ? "better" : "worse"}
              </span>
            )}
            <span className="num text-[11px] text-ink-muted">
              {first.period} → {last.period}
            </span>
          </div>
          <figcaption className="text-[10px] leading-tight text-ink-muted">
            {geoLabel(series.geo)} · {pts.length} points
            {series.compareMode === "decile-only" && " · deciles only"}
          </figcaption>
        </div>
      </div>
    </figure>
  );
}

/**
 * The ONE "how this trend is built" methodology note for a trend card. Rendered
 * by the card - after its source line, never per-chart - so a card with several
 * sparklines (e.g. rent + mortgage) carries exactly one note and the note never
 * sits above the source attribution.
 */
export function TrendMethodNote({
  series,
}: {
  series: (PlaceSeries | undefined)[];
}) {
  if (!series.some((s) => s?.boundaryNote)) return null;
  return (
    <p className="mt-1.5 text-[10px] leading-tight text-ink-muted">
      <Link
        href="/methodology#profile"
        className="underline decoration-dotted underline-offset-2 hover:text-accent"
      >
        How this trend is built (geography &amp; boundary notes)
      </Link>
    </p>
  );
}
