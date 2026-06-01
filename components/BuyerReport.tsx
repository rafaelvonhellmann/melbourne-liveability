import Link from "next/link";
import type { Place } from "@/lib/types";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import { percentileToColor } from "@/lib/colors";
import { WALK_CATEGORIES, type WalkCategoryId } from "@/lib/walk-access";
import { POI_CATEGORY_BY_ID } from "@/lib/poi-categories";

export type AmenityByCat = Record<string, { count: number; nearestKm: number }>;

type BuyerReportProps = {
  place: Place;
  /** Amenities within ~1.2 km of the dropped pin (or SA2 centroid for samples). */
  amenitiesByCat: AmenityByCat;
  /** "live" = real dropped pin; "sample" = static demo at the SA2 centroid. */
  variant?: "live" | "sample";
};

const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
const fmtPct = (v: number | null | undefined) =>
  v != null && Number.isFinite(v) ? `${v.toFixed(1)}%` : null;

/**
 * Buyer "Location Check" due-diligence report — a context + risk-indicator
 * dossier around a location, NOT property/financial/legal/insurance advice and
 * NOT part of the scored liveability composite. Every section states its
 * geographic precision, source/freshness and a "verify this" action.
 */
export function BuyerReport({ place, amenitiesByCat, variant = "live" }: BuyerReportProps) {
  const hazards = place.domains.hazards?.subIndicators;
  const safety = place.domains.safety?.subIndicators;
  const community = place.context?.community;
  const equity = place.context?.equity;

  return (
    <div className="space-y-4 text-ink">
      {/* Not-advice banner */}
      <div className="rounded-lg border border-[#E9C8B4] border-l-[3px] border-l-accent bg-[#FBEEE6] px-3 py-2 text-xs leading-relaxed text-[#9A552F]">
        <b>Location context &amp; risk indicators — not advice.</b> A second opinion to help
        you decide what to <b>verify</b> before you inspect or offer. Not property, financial,
        legal, or insurance advice. {variant === "sample" && "Sample report at the SA2 centroid."}
      </div>

      {/* On foot */}
      <Section
        title="On foot (~15-min walk)"
        precision="Point-level · straight-line from the pin"
        source="OpenStreetMap (ODbL)"
        note="Straight-line, not street-network — overstates real walking access; OSM coverage is uneven."
      >
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {WALK_CATEGORIES.map((c) => {
            const hit = amenitiesByCat[c.id as WalkCategoryId];
            const color = POI_CATEGORY_BY_ID[c.id as keyof typeof POI_CATEGORY_BY_ID]?.color;
            return (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: hit ? color : "var(--ink-muted, #9a948a)", opacity: hit ? 1 : 0.3 }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-ink-muted">{c.label}</span>
                <span className="num shrink-0 text-ink">
                  {hit ? `${hit.count} · ${fmtKm(hit.nearestKm)}` : "none ≤1.2 km"}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Liveability snapshot */}
      <Section
        title="Liveability snapshot"
        precision="SA2-level (the suburb/area, not the parcel)"
        source="See methodology"
        note="Percentile ranks within Greater Melbourne — one optional lens, never an authority."
      >
        <div className="space-y-1">
          {V1_SCORED_DOMAINS.map((d) => {
            const pct = place.domains[d]?.percentile ?? null;
            return (
              <div key={d} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 text-ink-muted">{getDomain(d)?.label ?? d}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded bg-surface-sunken">
                  {pct != null && (
                    <span
                      className="absolute inset-y-0 left-0 rounded"
                      style={{ width: `${pct}%`, background: percentileToColor(pct) }}
                    />
                  )}
                </span>
                <span className="num w-7 shrink-0 text-right text-ink">
                  {pct != null ? Math.round(pct) : "—"}
                </span>
              </div>
            );
          })}
        </div>
        <Link
          href={`/places/${place.slug}`}
          className="mt-2 inline-flex text-xs font-medium text-accent hover:underline"
        >
          Full area profile →
        </Link>
      </Section>

      {/* Risk indicators */}
      <Section
        title="Risk indicators"
        precision="Hazards: planning overlay share of the SA2 · Crime: LGA-level"
        source="Vic planning overlays · VCSA"
        note="Regulatory overlays + recorded-offence rates — indicators, not predictions of this property."
      >
        <Row
          k="Bushfire-overlay land"
          v={fmtPct(hazards?.bushfirePct?.raw) ?? "—"}
          verify="Verify the property's specific overlay + insurance with council/insurer."
        />
        <Row
          k="Flood-overlay land"
          v={fmtPct(hazards?.floodPct?.raw) ?? "—"}
          verify="Check the parcel's flood overlay (LSIO/SBO) on the planning scheme + insurer."
        />
        <Row
          k="Property crime (GM percentile)"
          v={safety?.propertyCrime?.percentile != null ? `${Math.round(safety.propertyCrime.percentile)}` : "—"}
          verify="Crime is recorded at suburb/LGA level — check the immediate street locally."
        />
        <Row
          k="Violent crime (GM percentile)"
          v={safety?.violentCrime?.percentile != null ? `${Math.round(safety.violentCrime.percentile)}` : "—"}
        />
      </Section>

      {/* Community context */}
      <Section
        title="Community context"
        precision="SA2-level"
        source="ABS Census 2021 / SEIFA"
        note="Demographic context only — never a judgement of an area or its residents."
      >
        <Row k="Renter households" v={fmtPct(community?.renterPct) ?? "—"} />
        <Row
          k="Owner-occupied (approx)"
          v={community?.renterPct != null ? `~${Math.max(0, 100 - community.renterPct).toFixed(1)}%` : "—"}
        />
        <Row k="Apartment dwellings" v={fmtPct(community?.apartmentPct) ?? "—"} />
        {community?.year12Pct != null && (
          <Row k="Completed Year 12" v={fmtPct(community.year12Pct) ?? "—"} />
        )}
        <Row k="SEIFA IRSAD decile" v={equity?.irsadDecile != null ? `${equity.irsadDecile}/10` : "—"} />
      </Section>

      {/* Verify checklist */}
      <Section
        title="Before you offer — verify"
        precision="Action checklist"
        source="—"
        note="These are the checks this tool cannot do for you."
      >
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-muted">
          <li>Planning scheme zone + overlays for the exact parcel (council / VicPlan).</li>
          <li>Flood &amp; bushfire exposure and the resulting insurance quote (insurer).</li>
          <li>Building &amp; pest inspection; for apartments, the body-corporate / owners-corp records.</li>
          <li>School zone, confirmed with the school (catchments change yearly).</li>
          <li>Title, easements, covenants and the Section 32 (conveyancer / solicitor).</li>
          <li>Nearby development applications &amp; major-project plans (council / Big Build).</li>
        </ul>
      </Section>

      <p className="text-[11px] leading-relaxed text-ink-muted">
        Compiled from open government &amp; OpenStreetMap data. Geographic precision varies by
        row (point-level for amenities; SA2 for liveability/community; LGA for crime; overlay
        share for hazards). Not relocation, financial, property, legal, or insurance advice —
        verify everything material with the relevant professional before acting.
      </p>
    </div>
  );
}

function Section({
  title,
  precision,
  source,
  note,
  children,
}: {
  title: string;
  precision: string;
  source: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
        {precision} · src: {source}
      </p>
      <div className="mt-2.5">{children}</div>
      {note && <p className="mt-2 text-[11px] leading-snug text-ink-muted">{note}</p>}
    </section>
  );
}

function Row({ k, v, verify }: { k: string; v: string; verify?: string }) {
  return (
    <div className="border-b border-surface-border py-1.5 last:border-0">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-muted">{k}</span>
        <span className="num font-medium text-ink">{v}</span>
      </div>
      {verify && <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">↳ {verify}</p>}
    </div>
  );
}
