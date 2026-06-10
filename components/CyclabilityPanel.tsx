import type { Cyclability } from "@/lib/types";

export function CyclabilityPanel({ cyclability }: { cyclability?: Cyclability }) {
  if (!cyclability) return null;

  const { cyclewayKm, separatedKm, onRoadKm, densityKmPerKm2, index, segments } =
    cyclability;

  return (
    <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-medium text-ink">Cyclability</h2>
        </div>
        <span className="num text-2xl font-bold text-ink">
          {index}
          <span className="text-base font-normal text-ink-muted">/100</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Mapped cycling infrastructure density in this area.
      </p>

      <dl className="num mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-ink-muted">Cycle infrastructure</dt>
          <dd className="text-ink">{cyclewayKm.toFixed(1)} km</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Density</dt>
          <dd className="text-ink">{densityKmPerKm2.toFixed(2)} km/km²</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Separated paths</dt>
          <dd className="text-ink">{separatedKm.toFixed(1)} km</dd>
        </div>
        <div>
          <dt className="text-ink-muted">On-road lanes</dt>
          <dd className="text-ink">{onRoadKm.toFixed(1)} km</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-ink-muted">
        Method: total length of OpenStreetMap cycleways, on-road bike lanes
        (<code>cycleway=*</code>) and bicycle-designated paths whose midpoint
        falls in this area ({segments} segments), divided by land area. It is
        an <em>infrastructure-density</em> measure, not a safety, comfort or
        connectivity rating - separated paths and painted lanes are both counted.
        OSM cycle tagging is community-maintained and uneven. © OpenStreetMap
        contributors (ODbL).
      </p>
    </section>
  );
}
