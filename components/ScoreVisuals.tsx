import { percentileToColor, percentileTextColor } from "@/lib/colors";

type ScoreBadgeProps = {
  /** 0–100 value. */
  value: number | null;
  size?: number;
  caption?: string;
};

/** Square score badge filled from the YlGnBu data palette (data channel). */
export function ScoreBadge({ value, size = 70, caption = "score" }: ScoreBadgeProps) {
  const display = value == null ? "—" : value.toFixed(0);
  return (
    <div
      className="num flex shrink-0 flex-col items-center justify-center rounded-lg font-semibold"
      style={{
        width: size,
        height: size,
        background: percentileToColor(value),
        color: percentileTextColor(value),
      }}
    >
      <span style={{ fontSize: size * 0.42, lineHeight: 1 }}>{display}</span>
      {caption && (
        <span
          className="mt-0.5 tracking-wide opacity-85"
          style={{ fontSize: Math.max(7, size * 0.12) }}
        >
          {caption}
        </span>
      )}
    </div>
  );
}

type DomainBarProps = {
  label: string;
  /** 0–100 percentile. */
  percentile: number | null;
  /** Optional weight % suffix. */
  weight?: number;
};

/** Labelled breakdown bar with a YlGnBu fill. */
export function DomainBar({ label, percentile, weight }: DomainBarProps) {
  const pct = percentile ?? 0;
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="num text-xs text-ink-muted">
          {percentile == null ? "—" : percentile.toFixed(0)}
          {weight != null ? ` · ${weight}%` : ""}
        </span>
      </div>
      <div className="h-[7px] overflow-hidden rounded bg-surface-sunken">
        <div
          className="h-full rounded"
          style={{
            width: `${percentile == null ? 0 : pct}%`,
            background: percentileToColor(percentile),
          }}
        />
      </div>
    </div>
  );
}
