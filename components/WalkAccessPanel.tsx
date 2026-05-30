import type { WalkAccess } from "@/lib/types";
import { WALK_CATEGORIES } from "@/lib/walk-access";

export function WalkAccessPanel({ walkAccess }: { walkAccess?: WalkAccess }) {
  if (!walkAccess) return null;

  return (
    <section className="mt-8 rounded-lg border border-surface-border bg-surface-raised/40 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-medium text-slate-100">
          15-minute walk access
        </h2>
        <span className="text-2xl font-bold text-emerald-300">
          {walkAccess.reachable}
          <span className="text-base font-normal text-slate-500">
            /{walkAccess.total}
          </span>
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Everyday amenities reachable within about a 15-minute walk
        (~{walkAccess.thresholdKm} km). Context only — never part of the
        liveability score.
      </p>

      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {WALK_CATEGORIES.map((c) => {
          const n = walkAccess.categories[c.id] ?? 0;
          const reachable = n > 0;
          return (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 border-b border-surface-border/40 py-0.5"
            >
              <span
                className={reachable ? "text-slate-200" : "text-slate-500"}
              >
                {reachable ? "✓" : "·"} {c.label}
              </span>
              <span className="text-xs text-slate-500">
                {reachable ? `${n} nearby` : "none"}
              </span>
            </li>
          );
        })}
      </ul>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="text-slate-500">Categories reachable</dt>
          <dd className="text-slate-200">{walkAccess.accessPct.toFixed(0)}%</dd>
        </div>
        <div>
          <dt className="text-slate-500">Walkability index</dt>
          <dd className="text-slate-200">{walkAccess.walkabilityIndex}/100</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-slate-500">
        Method: straight-line distance from the SA2 population-weighted centroid
        to OpenStreetMap amenities — it overstates real walking access (street
        network, rivers, freeways and rail crossings are not modelled) and OSM
        coverage is community-maintained and uneven. © OpenStreetMap
        contributors (ODbL).
      </p>
    </section>
  );
}
