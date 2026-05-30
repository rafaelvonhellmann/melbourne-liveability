import type { DataConfidence } from "@/lib/types";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function tier(score: number): { label: string; cls: string } {
  if (score >= 90) return { label: "High", cls: "text-emerald-300" };
  if (score >= 75) return { label: "Moderate", cls: "text-amber-200" };
  return { label: "Limited", cls: "text-orange-300" };
}

export function DataConfidenceCard({ confidence }: { confidence?: DataConfidence }) {
  if (!confidence) return null;
  const t = tier(confidence.score);
  const c = confidence.counts;

  return (
    <section className="mt-8 rounded-lg border border-surface-border bg-surface-raised/40 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-medium text-slate-100">Data confidence</h2>
        <span className={`text-2xl font-bold ${t.cls}`}>
          {confidence.score.toFixed(0)}
          <span className="ml-2 text-sm font-normal text-slate-500">{t.label}</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        How well-measured this area is — about our data pipeline, not a judgement of
        the place. Never affects the liveability rank.
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <Stat label="Coverage" value={pct(confidence.coverage)} />
        <Stat label="Complete" value={pct(confidence.completeness)} />
        <Stat label="Fresh" value={pct(confidence.freshness)} />
        <Stat label="Method" value={pct(confidence.methodConfidence)} />
      </dl>

      <ul className="mt-3 flex flex-wrap gap-2 text-xs">
        <Pill label={`${c.direct} directly measured`} cls="bg-emerald-900/40 text-emerald-200" />
        {c.estimated > 0 && (
          <Pill label={`${c.estimated} area-estimated`} cls="bg-sky-900/40 text-sky-200" />
        )}
        {c.proximity > 0 && (
          <Pill label={`${c.proximity} proximity`} cls="bg-slate-700/50 text-slate-300" />
        )}
        {c.missing > 0 && (
          <Pill label={`${c.missing} missing`} cls="bg-orange-900/40 text-orange-200" />
        )}
        {c.stale > 0 && (
          <Pill label={`${c.stale} stale`} cls="bg-amber-900/40 text-amber-200" />
        )}
      </ul>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200">{value}</dd>
    </div>
  );
}

function Pill({ label, cls }: { label: string; cls: string }) {
  return <li className={`rounded px-2 py-0.5 ${cls}`}>{label}</li>;
}
