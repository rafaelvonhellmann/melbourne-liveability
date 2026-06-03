import type { Place } from "@/lib/types";
import { buildDataCoverage } from "@/lib/data-coverage";

/**
 * "Data coverage" - a compact, honest statement of what the data actually
 * represents for this SA2 (vs the drawn geography it's joined to). Transparency
 * only; never a score. Derived entirely from existing place fields.
 */
export function DataCoverageCard({ place }: { place: Place }) {
  const c = buildDataCoverage(place);

  return (
    <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-medium text-ink">Data coverage</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-surface-border bg-surface-sunken px-2.5 py-0.5 text-[10px] text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-muted" aria-hidden />
            transparency · not a score
          </span>
        </div>
        <span className="num text-sm text-ink-muted">
          {c.measuredDomains}/{c.totalDomains} domains measured
        </span>
      </div>

      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Everything is joined to this ABS SA2 polygon, but the underlying data is
        collected at different real granularities. Here&apos;s what we actually
        hold for this area
        {c.confidenceTier ? (
          <>
            {" "}— overall data confidence{" "}
            <b className="text-ink">
              {c.confidenceTier}
              {c.confidenceScore != null ? ` (${c.confidenceScore})` : ""}
            </b>
          </>
        ) : null}
        .
      </p>

      {c.nonResidential && (
        <p className="mt-2 rounded-lg border border-[#E9C8B4] bg-[#FBEEE6] px-3 py-2 text-xs leading-relaxed text-[#9A552F]">
          Low / no resident data - this SA2 is below the population threshold and
          is excluded from rankings and percentile baselines. Treat any values
          here as indicative only.
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {c.domains.map((d) => (
          <li
            key={d.domain}
            className="border-b border-surface-border pb-2 text-xs last:border-0 last:pb-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink">{d.label}</span>
              <span className="flex items-center gap-1.5">
                {d.stale && (
                  <span className="rounded-full border border-[#E9C8B4] bg-[#FBEEE6] px-1.5 py-0.5 text-[10px] text-[#9A552F]">
                    stale vintage
                  </span>
                )}
                <span
                  className={`num ${d.measured ? "text-ink-muted" : "text-[#9A552F]"}`}
                >
                  {d.measured
                    ? `${d.measuredIndicators}/${d.totalIndicators} measured`
                    : "no data here"}
                </span>
              </span>
            </div>
            <p className="mt-0.5 leading-snug text-ink-muted">{d.granularity}</p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
        &ldquo;Measured&rdquo; counts sub-indicators we hold for this SA2; the
        note states the real aggregation level behind each domain. This describes
        our data, not the place, and never changes the liveability rank.
      </p>
    </section>
  );
}
