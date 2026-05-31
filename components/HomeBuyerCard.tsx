import type { Place } from "@/lib/types";
import { computeHomeBuyerIndex } from "@/lib/home-buyer";
import { percentileToColor } from "@/lib/colors";

/**
 * Home-buyer index — a context lens built from existing indicators. Shows the
 * Greater-Melbourne percentile of the blended composite plus the factors that
 * drove it, with an explicit caveat that it is NOT part of the official score
 * and uses NO sale-price data.
 */
export function HomeBuyerCard({
  place,
  gmPercentile,
}: {
  place: Place;
  /** Percentile rank of the composite within Greater Melbourne (0–100). */
  gmPercentile: number | null;
}) {
  const idx = computeHomeBuyerIndex(place);
  if (idx.value == null) return null;

  return (
    <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-medium text-ink">
            Home buyer index
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-surface-border bg-surface-sunken px-2.5 py-0.5 text-[10px] text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-muted" aria-hidden />
            context lens · not in score
          </span>
        </div>
        <span className="num text-2xl font-bold text-ink">
          {gmPercentile != null ? gmPercentile.toFixed(0) : idx.value.toFixed(0)}
          <span className="ml-2 text-sm font-normal text-ink-muted">
            {gmPercentile != null ? "/100 in Greater Melb" : "/100 blend"}
          </span>
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        A buyer-oriented blend of indicators we already hold — weighted toward
        affordability/cost-pressure, safety, schools, transport and low hazard
        exposure. Percentile within Greater Melbourne.
      </p>

      <ul className="mt-3 space-y-1.5">
        {idx.factors.map((f) => (
          <li key={f.id} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-ink">
                {f.label}
                <span className="ml-1.5 text-ink-muted">· {Math.round(f.weight * 100)}%</span>
              </span>
              <span className="num text-ink-muted">
                {f.missing ? "no data" : (f.value ?? 0).toFixed(0)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-surface-sunken">
              <div
                className="h-full rounded"
                style={{
                  width: `${f.missing ? 0 : f.value ?? 0}%`,
                  background: percentileToColor(f.missing ? null : f.value),
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
        <b className="text-ink">Caveat:</b> a context lens, not part of the locked
        7-domain liveability score or its weights. It uses{" "}
        <b className="text-ink">no dwelling sale-price data</b> — &ldquo;affordability&rdquo;
        here is the existing rent-to-income cost-pressure proxy, so this is not a
        price, value-for-money, or capital-growth estimate.
        {idx.measured < idx.total
          ? ` Based on ${idx.measured}/${idx.total} factors held for this SA2.`
          : ""}
      </p>
    </section>
  );
}
