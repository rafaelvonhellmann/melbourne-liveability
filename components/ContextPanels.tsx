import type { PlaceContext } from "@/lib/types";

export function ContextPanels({ context }: { context?: PlaceContext }) {
  if (!context) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-medium text-ink">
          Context panels
        </h2>
        <p className="text-xs text-ink-muted">
          For transparency only — these never change the liveability rank.
        </p>
      </div>

      {context.equity && (
        <Panel title="Equity">
          <Row label="IRSAD decile (advantage)" value={context.equity.irsadDecile} />
          <Row label="IRSD decile (disadvantage)" value={context.equity.irsdDecile} />
          <p className="mt-2 text-xs text-ink-muted">
            ABS SEIFA 2021 · {context.equity.period}
          </p>
        </Panel>
      )}

      {context.community && (
        <Panel title="Community">
          <TenureSplit renterPct={context.community.renterPct} />
          <Row label="Renter households" value={fmtPct(context.community.renterPct)} />
          <Row
            label="Owner-occupied (approx)"
            value={ownerApprox(context.community.renterPct)}
          />
          <Row
            label="Apartment dwellings %"
            value={fmtPct(context.community.apartmentPct)}
          />
          <Row
            label="First Nations %"
            value={fmtPct(context.community.firstNationsPct)}
          />
          {context.community.year12Pct != null && (
            <Row
              label="Completed Year 12 %"
              value={fmtPct(context.community.year12Pct)}
            />
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Owner-occupied is the non-renter remainder (owned outright + with mortgage +
            other). ABS Census 2021 · {context.community.period}
          </p>
        </Panel>
      )}

      {context.socialHousing && context.socialHousing.socialPct != null && (
        <Panel title="Social housing supply">
          <Row label="Social housing %" value={fmtPct(context.socialHousing.socialPct)} />
          <Row
            label="Public (state authority) %"
            value={fmtPct(context.socialHousing.statePct)}
          />
          <Row label="Community housing %" value={fmtPct(context.socialHousing.communityPct)} />
          {context.socialHousing.dwellings != null && (
            <Row
              label="Social-housing dwellings"
              value={context.socialHousing.dwellings.toLocaleString()}
            />
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Share of occupied private dwellings rented from a state/territory housing
            authority or a community housing provider — a housing-supply mix, not a
            measure of the people who live here. ABS Census 2021 ·{" "}
            {context.socialHousing.period}
          </p>
        </Panel>
      )}

      {context.environment && (
        <Panel title="Environment">
          <p className="text-sm text-ink-muted">{context.environment.note}</p>
        </Panel>
      )}

      {context.politics && (
        <Panel title="Politics / civic">
          <p className="text-sm text-ink-muted">{context.politics.note}</p>
        </Panel>
      )}
    </section>
  );
}

export function ContextTag() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-surface-border bg-surface-sunken px-2.5 py-0.5 text-[10px] text-ink-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-muted" aria-hidden />
      context only · not in score
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {title}
        </h3>
        <ContextTag />
      </div>
      <div>{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-surface-border py-1.5 text-sm last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className="num font-medium text-ink">{value ?? "—"}</span>
    </div>
  );
}

function fmtPct(v: number | null): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${v.toFixed(1)}%`;
}

function ownerApprox(renterPct: number | null): string | null {
  if (renterPct == null || !Number.isFinite(renterPct)) return null;
  return `~${Math.max(0, 100 - renterPct).toFixed(1)}%`;
}

/** Visual renter-vs-owner split — a quick read of whether an area is rental- or
 * owner-occupier-dominated (a useful buyer / affordability signal). */
function TenureSplit({ renterPct }: { renterPct: number | null }) {
  if (renterPct == null || !Number.isFinite(renterPct)) return null;
  const renter = Math.max(0, Math.min(100, renterPct));
  const owner = 100 - renter;
  return (
    <div className="mb-3">
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={`Tenure: ${renter.toFixed(0)}% renters, about ${owner.toFixed(0)}% owner-occupied or other`}
      >
        <div className="bg-accent" style={{ width: `${renter}%` }} />
        <div className="bg-ink-muted/30" style={{ width: `${owner}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-muted">
        <span>Renters {renter.toFixed(0)}%</span>
        <span>Owner / other ~{owner.toFixed(0)}%</span>
      </div>
    </div>
  );
}
