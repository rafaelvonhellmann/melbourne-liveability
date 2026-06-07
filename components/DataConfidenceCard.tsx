import type { DataConfidence } from "@/lib/types";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function tier(score: number): { label: string } {
  if (score >= 90) return { label: "High" };
  if (score >= 75) return { label: "Moderate" };
  return { label: "Limited" };
}

export function DataConfidenceCard({ confidence }: { confidence?: DataConfidence }) {
  if (!confidence) return null;
  const t = tier(confidence.score);
  const c = confidence.counts;

  return (
    <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-medium text-ink">Data confidence</h2>
        </div>
        <span className="num text-2xl font-bold text-ink">
          {confidence.score.toFixed(0)}
          <span className="ml-2 text-sm font-normal text-ink-muted">{t.label}</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        How well-measured this area is - about our data pipeline, not a judgement of
        the place. Never affects the liveability rank.
      </p>

      <dl className="num mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <Stat label="Coverage" value={pct(confidence.coverage)} />
        <Stat label="Complete" value={pct(confidence.completeness)} />
        <Stat label="Fresh" value={pct(confidence.freshness)} />
        <Stat label="Method" value={pct(confidence.methodConfidence)} />
      </dl>

      <ul className="mt-3 flex flex-wrap gap-2 text-xs">
        <Pill label={`${c.direct} directly measured`} />
        {c.estimated > 0 && <Pill label={`${c.estimated} area-estimated`} />}
        {c.proximity > 0 && <Pill label={`${c.proximity} proximity`} />}
        {c.missing > 0 && <Pill label={`${c.missing} missing`} warn />}
        {c.stale > 0 && <Pill label={`${c.stale} stale`} warn />}
      </ul>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function Pill({ label, warn }: { label: string; warn?: boolean }) {
  return (
    <li
      className={`rounded-full px-2.5 py-0.5 ${
        warn
          ? "border border-[#E9C8B4] bg-[#FBEEE6] text-[#9A552F]"
          : "border border-surface-border bg-surface-sunken text-ink-muted"
      }`}
    >
      {label}
    </li>
  );
}
