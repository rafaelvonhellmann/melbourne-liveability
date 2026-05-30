import type { PlaceContext } from "@/lib/types";

export function ContextPanels({ context }: { context?: PlaceContext }) {
  if (!context) return null;

  return (
    <section className="mt-8 space-y-4">
      <h2 className="text-lg font-medium text-slate-100">Context (not in score)</h2>
      <p className="text-xs text-slate-500">
        These panels are for transparency only. They do not change the liveability rank.
      </p>

      {context.equity && (
        <Panel title="Equity">
          <Row label="IRSAD decile (advantage)" value={context.equity.irsadDecile} />
          <Row label="IRSD decile (disadvantage)" value={context.equity.irsdDecile} />
          <p className="mt-2 text-xs text-slate-500">
            ABS SEIFA 2021 · {context.equity.period}
          </p>
        </Panel>
      )}

      {context.community && (
        <Panel title="Community">
          <Row label="Renter %" value={fmtPct(context.community.renterPct)} />
          <Row label="Apartment dwellings %" value={fmtPct(context.community.apartmentPct)} />
          <Row
            label="First Nations %"
            value={fmtPct(context.community.firstNationsPct)}
          />
          <p className="mt-2 text-xs text-slate-500">
            ABS Census 2021 · {context.community.period}
          </p>
        </Panel>
      )}

      {context.environment && (
        <Panel title="Environment">
          <p className="text-sm text-slate-400">{context.environment.note}</p>
        </Panel>
      )}

      {context.politics && (
        <Panel title="Politics / civic">
          <p className="text-sm text-slate-400">{context.politics.note}</p>
        </Panel>
      )}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised/40 p-4">
      <h3 className="text-sm font-medium text-slate-200">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200">{value ?? "—"}</span>
    </div>
  );
}

function fmtPct(v: number | null): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${v.toFixed(1)}%`;
}
