import type { WalkAccess } from "@/lib/types";
import { WALK_CATEGORIES } from "@/lib/walk-access";

export function WalkAccessPanel({ walkAccess }: { walkAccess?: WalkAccess }) {
  if (!walkAccess) return null;

  return (
    <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-medium text-ink">
            15-minute walk access
          </h2>
        </div>
        <span className="num text-2xl font-bold text-ink">
          {walkAccess.reachable}
          <span className="text-base font-normal text-ink-muted">
            /{walkAccess.total}
          </span>
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Everyday amenities reachable within about a 15-minute walk
        (~{walkAccess.thresholdKm} km). Context only - never part of the
        liveability score.
      </p>

      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {WALK_CATEGORIES.map((c) => {
          const n = walkAccess.categories[c.id] ?? 0;
          const reachable = n > 0;
          return (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 border-b border-surface-border py-1 last:border-0"
            >
              <span className={reachable ? "text-ink" : "text-ink-muted"}>
                {reachable ? "✓" : "·"} {c.label}
              </span>
              <span className="num text-xs text-ink-muted">
                {reachable ? `${n} nearby` : "none"}
              </span>
            </li>
          );
        })}
      </ul>

      <dl className="num mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="text-ink-muted">Categories reachable</dt>
          <dd className="text-ink">{walkAccess.accessPct.toFixed(0)}%</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Walkability index</dt>
          <dd className="text-ink">{walkAccess.walkabilityIndex}/100</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-ink-muted">
        Method: straight-line distance from the SA2 population-weighted centroid
        to OpenStreetMap amenities - it overstates real walking access (street
        network, rivers, freeways and rail crossings are not modelled) and OSM
        coverage is community-maintained and uneven. © OpenStreetMap
        contributors (ODbL).
      </p>
    </section>
  );
}
