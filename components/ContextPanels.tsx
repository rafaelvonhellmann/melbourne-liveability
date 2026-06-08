import type { PlaceContext } from "@/lib/types";
import type { GmContext } from "@/lib/benchmarks";
import { presentOverlays, CONSERVATION_OVERLAY_META } from "@/lib/planning-overlays";

export function ContextPanels({
  context,
  gmContext,
}: {
  context?: PlaceContext;
  gmContext?: GmContext;
}) {
  if (!context) return null;

  const overlays = context.planning
    ? presentOverlays(context.planning.overlays, 1)
    : [];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-medium text-ink">
          Context panels
        </h2>
        <p className="text-xs text-ink-muted">
          For transparency only - these never change the liveability rank.
        </p>
      </div>

      {context.equity && (
        <Panel title="Socio-economic ranking">
          <Row
            label="Socio-economic ranking (1-10)"
            value={context.equity.irsadDecile}
            gm={gmContext?.irsadDecile != null ? String(Math.round(gmContext.irsadDecile)) : null}
          />
          <p className="mt-2 text-xs text-ink-muted">
            Where this area sits on the ABS socio-economic scale: <b className="text-ink">1</b> =
            among the most disadvantaged areas in Australia, <b className="text-ink">10</b> = among
            the most advantaged. It blends local income, education and occupation - a description of
            the area, not the people who live here. ABS SEIFA 2021 · {context.equity.period}
          </p>
        </Panel>
      )}

      {context.population && (context.population.count != null || context.population.densityPerKm2 != null) && (
        <Panel title="Population">
          <Row
            label="Resident population"
            value={context.population.count != null ? context.population.count.toLocaleString() : null}
          />
          <Row
            label="Density (people / km²)"
            value={
              context.population.densityPerKm2 != null
                ? context.population.densityPerKm2.toLocaleString()
                : null
            }
            gm={
              gmContext?.densityPerKm2 != null
                ? Math.round(gmContext.densityPerKm2).toLocaleString()
                : null
            }
          />
          {context.population.areaKm2 != null && (
            <Row label="Land area (km²)" value={context.population.areaKm2.toLocaleString()} />
          )}
          <p className="mt-2 text-xs text-ink-muted">
            ABS Estimated Resident Population per square km of land. Population trend over
            time is on the area profile. ABS estimate · {context.population.period}
          </p>
        </Panel>
      )}

      {context.community && (
        <Panel title="Community">
          <TenureSplit renterPct={context.community.renterPct} />
          <Row
            label="Renter households"
            value={fmtPct(context.community.renterPct)}
            gm={fmtPct(gmContext?.renterPct ?? null)}
          />
          <Row
            label="Owner-occupied (approx)"
            value={ownerApprox(context.community.renterPct)}
          />
          <Row
            label="Apartment dwellings %"
            value={fmtPct(context.community.apartmentPct)}
            gm={fmtPct(gmContext?.apartmentPct ?? null)}
          />
          <Row
            label="First Nations %"
            value={fmtPct(context.community.firstNationsPct)}
            gm={fmtPct(gmContext?.firstNationsPct ?? null)}
          />
          {context.community.year12Pct != null && (
            <Row
              label="Completed Year 12 %"
              value={fmtPct(context.community.year12Pct)}
              gm={fmtPct(gmContext?.year12Pct ?? null)}
            />
          )}
          {context.community.bachelorPlusPct != null && (
            <Row
              label="Bachelor degree or higher"
              value={fmtPct(context.community.bachelorPlusPct)}
              gm={fmtPct(gmContext?.bachelorPlusPct ?? null)}
            />
          )}
          {context.community.postgradPct != null && (
            <Row
              label="Postgraduate degree"
              value={fmtPct(context.community.postgradPct)}
              gm={fmtPct(gmContext?.postgradPct ?? null)}
            />
          )}
          {context.community.volunteerPct != null && (
            <Row
              label="Volunteers (did voluntary work)"
              value={fmtPct(context.community.volunteerPct)}
              gm={fmtPct(gmContext?.volunteerPct ?? null)}
            />
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Owner-occupied is the non-renter remainder (owned outright + with mortgage +
            other). ABS Census 2021 · {context.community.period}
          </p>
          {context.community.bachelorPlusPct != null && (
            <p className="mt-2 text-xs text-ink-muted">
              Education shares are measured among residents who hold a post-school
              (non-school) qualification - <b className="text-ink">not</b> all adults - so
              they read higher than a whole-of-population rate. ABS Census 2021 (G49).
            </p>
          )}
        </Panel>
      )}

      {context.schools &&
        context.schools.government + context.schools.catholic + context.schools.independent > 0 && (
          <Panel title="Schools in this area">
            <Row label="Government" value={context.schools.government} />
            <Row label="Catholic" value={context.schools.catholic} />
            <Row label="Independent" value={context.schools.independent} />
            <p className="mt-2 text-xs text-ink-muted">
              Open schools located inside this area, counted by sector (not enrolment numbers).
              A count of what&apos;s here - enrolment zones still decide where a child can go, so
              check findmyschool.vic.gov.au for the address. VIC Dept of Education 2025.
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
            authority or a community housing provider - a housing-supply mix, not a
            measure of the people who live here. ABS Census 2021 ·{" "}
            {context.socialHousing.period}
          </p>
        </Panel>
      )}

      {context.housingStress &&
        (context.housingStress.rentStressPct != null ||
          context.housingStress.mortgageStressPct != null) && (
          <Panel title="Housing stress">
            <Row
              label="Renters paying >30% of income"
              value={fmtPct(context.housingStress.rentStressPct)}
            />
            <Row
              label="Mortgaged paying >30% of income"
              value={fmtPct(context.housingStress.mortgageStressPct)}
            />
            <p className="mt-2 text-xs text-ink-muted">
              Share of households (by tenure) spending more than 30% of income on
              housing - the ABS housing-stress threshold. A cost-pressure signal,
              separate from the rent-vs-income score. ABS Census 2021 ·{" "}
              {context.housingStress.period}
            </p>
          </Panel>
        )}

      {context.planning &&
        ((context.planning.heritageOverlayPct != null &&
          Math.round(context.planning.heritageOverlayPct) >= 1) ||
          overlays.length > 0) && (
          <Panel title="Planning overlays">
            {context.planning.heritageOverlayPct != null &&
              Math.round(context.planning.heritageOverlayPct) >= 1 && (
              <>
                <Row
                  label="Area within a Heritage Overlay"
                  value={fmtPct(context.planning.heritageOverlayPct)}
                />
                <p className="mt-2 text-xs text-ink-muted">
                  Share of this area inside a Heritage Overlay, which
                  can restrict demolition, external changes and subdivision. This is
                  an <b className="text-ink">area share, not a parcel-level result</b>{" "}
                  - always check the planning certificate for the specific property.
                </p>
              </>
            )}
            {overlays.length > 0 && (
              <div
                className={context.planning.heritageOverlayPct != null ? "mt-3" : ""}
              >
                {overlays.map((o) => (
                  <Row
                    key={o.code}
                    label={`Area within ${CONSERVATION_OVERLAY_META[o.code].name} (${o.code})`}
                    value={fmtPct(context.planning!.overlays?.[o.code] ?? null)}
                  />
                ))}
                <p className="mt-2 text-xs text-ink-muted">
                  Conservation and restriction overlays control development and
                  vegetation; an Environmental Audit Overlay can flag possible
                  contamination, and a Public Acquisition Overlay can mean the land is
                  reserved for a public work. Each figure is an{" "}
                  <b className="text-ink">area share, not a parcel-level result</b> -
                  confirm the exact overlays on the property&apos;s planning
                  certificate.
                </p>
              </div>
            )}
            <p className="mt-2 text-[11px] text-ink-muted">
              Vicplan · {context.planning.period}
            </p>
          </Panel>
        )}

      {context.waterRetailer && (
        <Panel title="Water supply">
          <Row label="Water retailer" value={context.waterRetailer.name} />
          <p className="mt-2 text-xs text-ink-muted">
            The corporation that bills your water and sewerage at this location. Confirm on a
            current rates notice - a few boundary streets can differ.
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-ink-muted">
          {title}
        </h3>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  gm,
}: {
  label: string;
  value: string | number | null;
  /** Preformatted "typical Greater Melbourne area" comparator, if available. */
  gm?: string | null;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-surface-border py-1.5 text-sm last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right">
        <span className="num font-medium text-ink">{value ?? "—"}</span>
        {gm != null && (
          <span className="num mt-0.5 block text-[10px] font-normal text-ink-muted">
            Greater Melbourne median {gm}
          </span>
        )}
      </span>
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

/** Visual renter-vs-owner split - a quick read of whether an area is rental- or
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
