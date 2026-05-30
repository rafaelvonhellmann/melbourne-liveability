import type { Cyclability } from "@/lib/types";

export function CyclabilityPanel({ cyclability }: { cyclability?: Cyclability }) {
  if (!cyclability) return null;

  const { cyclewayKm, separatedKm, onRoadKm, densityKmPerKm2, index, segments } =
    cyclability;

  return (
    <section className="mt-8 rounded-lg border border-surface-border bg-surface-raised/40 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-medium text-slate-100">Cyclability</h2>
        <span className="text-2xl font-bold text-sky-300">
          {index}
          <span className="text-base font-normal text-slate-500">/100</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Mapped cycling infrastructure density in this SA2. Context only — never
        part of the liveability score.
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-slate-500">Cycle infrastructure</dt>
          <dd className="text-slate-200">{cyclewayKm.toFixed(1)} km</dd>
        </div>
        <div>
          <dt className="text-slate-500">Density</dt>
          <dd className="text-slate-200">
            {densityKmPerKm2.toFixed(2)} km/km²
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Separated paths</dt>
          <dd className="text-slate-200">{separatedKm.toFixed(1)} km</dd>
        </div>
        <div>
          <dt className="text-slate-500">On-road lanes</dt>
          <dd className="text-slate-200">{onRoadKm.toFixed(1)} km</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-slate-500">
        Method: total length of OpenStreetMap cycleways, on-road bike lanes
        (<code>cycleway=*</code>) and bicycle-designated paths whose midpoint
        falls in this SA2 ({segments} segments), divided by SA2 land area. It is
        an <em>infrastructure-density</em> measure, not a safety, comfort or
        connectivity rating — separated paths and painted lanes are both counted.
        OSM cycle tagging is community-maintained and uneven. © OpenStreetMap
        contributors (ODbL).
      </p>
    </section>
  );
}
