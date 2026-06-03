"use client";

import Link from "next/link";
import { Printer, X, ShieldAlert, CheckCircle2, HelpCircle, Info, Bookmark, BookmarkCheck } from "lucide-react";
import type { BuyerReport, BuyerFinding, BuyerConfidence, BuyerGeography } from "@/lib/buyer-report";
import { AMENITY_GROUPS } from "@/lib/buyer-report";
import { formatSourceDate } from "@/lib/source-manifest";
import { withBase } from "@/lib/asset-path";
import { track } from "@/lib/analytics";
import { POI_CATEGORY_BY_ID, type PoiCategoryId } from "@/lib/poi-categories";
import type { Place } from "@/lib/types";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import { percentileToColor } from "@/lib/colors";
import { ShareViewButton } from "@/components/ShareViewButton";

type BuyerReportPanelProps = {
  report: BuyerReport;
  /** SA2 record for the snapshot + community sections (null if pin is off-coverage). */
  place?: Place | null;
  variant?: "live" | "sample" | "embedded";
  /** Path+query (incl. base path) for the "Copy share link" action; omit to hide. */
  shareUrl?: string;
  /** Clear-pin handler (live map only); omit to hide. */
  onClear?: () => void;
  /** Save-this-check handler (live map only); omit to hide the save button. */
  onSaveCheck?: () => void;
  /** Whether the current pin is already in the user's saved checks. */
  isSaved?: boolean;
  className?: string;
};

const fmtDist = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const fmtPct = (v: number | null | undefined) =>
  v != null && Number.isFinite(v) ? `${v.toFixed(1)}%` : null;

const GEO_LABEL: Record<BuyerGeography, string> = {
  pin: "this point",
  "poi-radius": "within ~1.2 km",
  sa2: "suburb / SA2 area",
  lga: "council / LGA area",
  gccsa: "Greater Melbourne",
  unknown: "not determined",
};

export function BuyerReportPanel({
  report,
  place = null,
  variant = "live",
  shareUrl,
  onClear,
  onSaveCheck,
  isSaved = false,
  className = "",
}: BuyerReportPanelProps) {
  const hasPin = report.location.lat != null && report.location.lng != null;
  const verify = report.findings.filter((f) => f.kind === "red_flag" || f.kind === "verify");
  const positives = report.findings.filter((f) => f.kind === "positive");
  const unavailable = report.findings.filter((f) => f.kind === "unavailable");
  const neutral = report.findings.filter((f) => f.kind === "neutral");
  const community = place?.context?.community;
  const equity = place?.context?.equity;
  const generated = report.generatedAt?.slice(0, 10) || "—";
  // Paid-tier precise walk routing recomputes "nearby" against a street-network
  // isochrone; the free tier uses a straight-line radius. Drive the copy off it.
  const precise = report.accessMode === "precise";
  const reachLabel = precise ? "reachable on foot" : "within ~1.2 km";

  return (
    <div className={`space-y-4 text-ink ${className}`}>
      {/* Header + actions */}
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-ink">Buyer Location Check</h2>
            <p className="text-xs text-ink-muted">
              A sourced, plain-English screening report for this location.
            </p>
          </div>
          <ConfidenceBadge confidence={report.summary.confidence} />
        </div>
        <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-ink-muted">
          {report.location.sa2Name && (
            <div>
              <dt className="inline font-medium text-ink">Area:</dt>{" "}
              <dd className="inline">
                {report.location.sa2Name}
                {report.location.lgaName ? `, ${report.location.lgaName}` : ""}
              </dd>
            </div>
          )}
          {report.location.lat != null && report.location.lng != null && (
            <div>
              <dt className="inline font-medium text-ink">Pin:</dt>{" "}
              <dd className="num inline">
                {report.location.lat.toFixed(5)}, {report.location.lng.toFixed(5)}
              </dd>
            </div>
          )}
          <div>
            <dt className="inline font-medium text-ink">Generated:</dt>{" "}
            <dd className="num inline">{generated}</dd>
          </div>
        </dl>
        {(variant !== "embedded") && (
          <div className="no-print flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                track("buyer_report_print");
                if (typeof window !== "undefined") window.print();
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-surface-border px-2.5 py-1 text-xs text-ink transition-colors hover:border-accent hover:text-accent"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden /> Print / Save as PDF
            </button>
            {onSaveCheck && hasPin && (
              <button
                type="button"
                onClick={onSaveCheck}
                aria-pressed={isSaved}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  isSaved
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-surface-border text-ink hover:border-accent hover:text-accent"
                }`}
              >
                {isSaved ? (
                  <BookmarkCheck className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Bookmark className="h-3.5 w-3.5" aria-hidden />
                )}{" "}
                {isSaved ? "Saved" : "Save this check"}
              </button>
            )}
            {shareUrl && <ShareViewButton getUrl={() => shareUrl} label="Copy share link" />}
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1.5 rounded-md border border-surface-border px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent"
              >
                <X className="h-3.5 w-3.5" aria-hidden /> Clear pin
              </button>
            )}
          </div>
        )}
      </header>

      {/* Printable region begins */}
      <div className="buyer-print-root space-y-4">
        {/* Not-advice banner */}
        <div className="rounded-lg border border-[#E9C8B4] border-l-[3px] border-l-accent bg-[#FBEEE6] px-3 py-2 text-xs leading-relaxed text-[#9A552F]">
          <b>Information only - verify before buying.</b> A second opinion to help you decide what
          to <b>verify</b>. Not financial, property, legal, insurance or planning advice.
          {variant === "sample" && " Sample report - not a report for a specific property."}
        </div>

        {/* 1. Executive summary */}
        <Section title="Executive summary">
          <p className="text-sm font-medium text-ink">{report.summary.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{report.summary.subheadline}</p>
        </Section>

        {/* 1a. Decision TL;DR - the most material checks, ranked. */}
        {report.priorityChecks.length > 0 && (
          <Section title="Before you offer, check these first">
            <ol className="space-y-2">
              {report.priorityChecks.map((f, i) => (
                <li key={f.id} className="flex gap-2.5">
                  <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-ink">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{f.title}</p>
                    <p className="text-xs leading-snug text-ink-muted">
                      {f.verifyAction || f.summary}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] text-ink-muted">
              Ranked by how much they affect a buy decision. Full detail, sources and
              caveats are below.
            </p>
          </Section>
        )}

        {/* 1b. Personal fit (only when a profile is set) */}
        {report.fit && (report.fit.hits.length > 0 || report.fit.notes.length > 0) && (
          <Section title={report.fit.mode === "agent" ? "For your client" : "Fit for your life"}>
            {report.fit.hits.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-ink">
                  {report.fit.mode === "agent"
                    ? "Client-specific checks to verify here:"
                    : "Your deal-breakers to verify here:"}
                </p>
                <ul className="space-y-1.5">
                  {report.fit.hits.map((h) => (
                    <li
                      key={h.id}
                      className="rounded-md border border-l-[3px] border-surface-border border-l-accent bg-surface-sunken px-2.5 py-1.5"
                    >
                      <span className="text-sm font-medium text-ink">{h.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-ink-muted">
                        {h.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.fit.notes.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                {report.fit.notes.map((n, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span aria-hidden>·</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] leading-snug text-ink-muted">
              Based on your saved preferences - these re-frame the facts, they never change
              the score, and a flag means &ldquo;verify&rdquo;, not a verdict.
            </p>
          </Section>
        )}

        {/* 2. Things to verify */}
        {verify.length > 0 && (
          <Section title="Things to verify" count={verify.length}>
            <div className="space-y-2.5">
              {verify.map((f) => (
                <FindingCard key={f.id} f={f} />
              ))}
            </div>
          </Section>
        )}

        {/* 3. What looks positive */}
        {positives.length > 0 && (
          <Section title="What looks positive" count={positives.length}>
            <div className="space-y-2.5">
              {positives.map((f) => (
                <FindingCard key={f.id} f={f} />
              ))}
            </div>
          </Section>
        )}

        {/* 4. Nearby amenities */}
        <Section
          title="Nearby amenities"
          precision={
            precise
              ? "Point-level · street-network ~15-min walk · src: OpenRouteService + OpenStreetMap (ODbL)"
              : "Point-level · straight-line from the pin · src: OpenStreetMap (ODbL)"
          }
        >
          {report.nearbyAmenities.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No mapped amenities {precise ? "reachable within a ~15-minute walk" : "within ~1.2 km"} in
              the available open data, or no pin dropped yet.
            </p>
          ) : (
            <div className="space-y-3">
              {AMENITY_GROUPS.map((g) => {
                const items = [...report.nearbyAmenities]
                  .filter((a) => g.categories.includes(a.category as PoiCategoryId))
                  // Nearest-first, but float hospitals to the top when present
                  // (founder: hospitals are the priority health item). Other groups
                  // sort purely by distance, so the nearest item is never hidden.
                  .sort((a, b) => {
                    const ah = a.category === "hospital" ? 0 : 1;
                    const bh = b.category === "hospital" ? 0 : 1;
                    return ah - bh || a.distanceMeters - b.distanceMeters;
                  })
                  .slice(0, 4);
                const total = g.categories.reduce(
                  (n, c) => n + (report.amenityCountsByCategory[c] ?? 0),
                  0
                );
                if (total === 0) return null;
                return (
                  <div key={g.id}>
                    <p className="text-xs font-semibold text-ink">
                      {g.label}{" "}
                      <span className="font-normal text-ink-muted">
                        · {total} {reachLabel}
                      </span>
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {items.map((a) => (
                        <li key={a.id} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ background: POI_CATEGORY_BY_ID[a.category as PoiCategoryId]?.color ?? "#8A857B" }}
                              aria-hidden
                            />
                            <span className="truncate text-ink-muted">{a.name}</span>
                          </span>
                          <span className="num shrink-0 text-ink">{fmtDist(a.distanceMeters)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <p className="text-[11px] leading-snug text-ink-muted">
                {precise
                  ? "Street-network ~15-minute walk isochrone (OpenRouteService); the distance shown to each amenity is still straight-line."
                  : "Straight-line, not street-network walking time."}{" "}
                Public-transport stop proximity is reflected in the Transport score below, not in this
                pin-level list yet.
              </p>
            </div>
          )}
        </Section>

        {/* 5. Area liveability snapshot */}
        {place && (
          <Section
            title="Area liveability snapshot"
            precision="SA2-level (the suburb/area, not the parcel) · src: see methodology"
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
            <p className="mt-1 text-[11px] leading-snug text-ink-muted">
              Percentile ranks within Greater Melbourne - one optional lens, never an authority.
            </p>
          </Section>
        )}

        {/* 6. Community & census context */}
        {place && (
          <Section title="Community & census context" precision="SA2-level · src: ABS Census 2021 / SEIFA">
            <Row k="Renter households" v={fmtPct(community?.renterPct) ?? "—"} />
            <Row k="Apartment dwellings" v={fmtPct(community?.apartmentPct) ?? "—"} />
            {community?.year12Pct != null && (
              <Row k="Completed Year 12" v={fmtPct(community.year12Pct) ?? "—"} />
            )}
            <Row k="Socio-economic ranking (SEIFA)" v={equity?.irsadDecile != null ? `${equity.irsadDecile}/10` : "—"} />
            <p className="mt-2 text-[11px] leading-snug text-ink-muted">
              SEIFA decile: 1 = most disadvantaged, 10 = most advantaged, ranked against all of
              Australia (ABS) - area context, not a judgement of residents.
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">
              This describes area-level demographic and tenure context. It is not a judgement about
              residents or future price performance.
            </p>
          </Section>
        )}

        {/* (neutral findings, e.g. data confidence) */}
        {neutral.length > 0 && (
          <Section title="Data notes">
            <div className="space-y-2.5">
              {neutral.map((f) => (
                <FindingCard key={f.id} f={f} />
              ))}
            </div>
          </Section>
        )}

        {/* 7. Sources & confidence */}
        <Section title="Sources and confidence">
          <ul className="space-y-1.5">
            {report.sourceRefs.map((s) => (
              <li key={s.id} className="text-xs leading-snug">
                {s.url ? (
                  <a
                    href={s.url.startsWith("http") ? s.url : withBase(s.url)}
                    className="font-medium text-accent hover:underline"
                    target={s.url.startsWith("http") ? "_blank" : undefined}
                    rel={s.url.startsWith("http") ? "noopener noreferrer" : undefined}
                  >
                    {s.label}
                  </a>
                ) : (
                  <span className="font-medium text-ink">{s.label}</span>
                )}
                <span className="text-ink-muted">
                  {" - "}
                  {formatSourceDate(s)}
                  {s.licence ? ` · ${s.licence}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {unavailable.length > 0 && (
            <p className="mt-2 text-[11px] leading-snug text-ink-muted">
              <b className="text-ink">Known limitations:</b>{" "}
              {unavailable.map((f) => f.title).join("; ")}. Geographic precision varies by row
              (point-level for amenities; SA2 for liveability/community; LGA for crime; SA2 overlay
              share for hazards).
            </p>
          )}
        </Section>

        {/* 8. Disclaimer */}
        <div className="rounded-lg border border-surface-border bg-surface-sunken px-3 py-2.5">
          {report.disclaimers.map((d, i) => (
            <p key={i} className="text-[11px] leading-relaxed text-ink-muted">
              {d}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: BuyerConfidence }) {
  const map: Record<BuyerConfidence, { label: string; cls: string }> = {
    high: { label: "High confidence", cls: "border-[#117733]/30 bg-[#117733]/10 text-[#117733]" },
    medium: { label: "Medium confidence", cls: "border-[#9A552F]/30 bg-[#FBEEE6] text-[#9A552F]" },
    low: { label: "Low confidence", cls: "border-surface-border bg-surface-sunken text-ink-muted" },
    unknown: { label: "Confidence unknown", cls: "border-surface-border bg-surface-sunken text-ink-muted" },
  };
  const c = map[confidence];
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function FindingCard({ f }: { f: BuyerFinding }) {
  const Icon =
    f.kind === "positive"
      ? CheckCircle2
      : f.kind === "red_flag"
        ? ShieldAlert
        : f.kind === "unavailable" || f.confidence === "unknown"
          ? HelpCircle
          : f.kind === "neutral"
            ? Info
            : ShieldAlert;
  const accent =
    f.severity === "high"
      ? "border-l-[#E31A1C]"
      : f.kind === "positive"
        ? "border-l-[#117733]"
        : f.severity === "medium"
          ? "border-l-accent"
          : "border-l-surface-border";
  return (
    <div className={`rounded-md border border-surface-border border-l-[3px] ${accent} bg-surface px-3 py-2`}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{f.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{f.summary}</p>
          {/* "Why it matters" is detail - keep the on-screen card direct and
              show it only in the printable PDF. */}
          {f.whyItMatters && (
            <p className="mt-1 hidden text-[11px] leading-snug text-ink-muted print:block">
              <span className="font-medium text-ink">Why it matters:</span> {f.whyItMatters}
            </p>
          )}
          {/* The action stays on screen - it's the useful, direct part. */}
          {f.verifyAction && (
            <p className="mt-1 text-[11px] leading-snug text-ink-muted">
              <span className="font-medium text-ink">Verify:</span> {f.verifyAction}
            </p>
          )}
          {/* Full caveat lives in the PDF + methodology; on screen it's noise. */}
          {f.caveat && (
            <p className="mt-1 hidden text-[11px] italic leading-snug text-ink-muted print:block">
              {f.caveat}
            </p>
          )}
          {/* Provenance (confidence / geography / source) is PDF detail, not part
              of the on-screen scan. Founder: the screen must be digestible for
              someone checking 10-20 properties a day; full sourcing lives in the
              printable report + the "Sources and confidence" section below. */}
          <div className="mt-1.5 hidden flex-wrap gap-x-3 gap-y-0.5 text-[10px] uppercase tracking-wide text-ink-muted print:flex">
            <span>Confidence: {f.confidence}</span>
            <span>Geography: {GEO_LABEL[f.geography]}</span>
            {f.sourceRefs && f.sourceRefs.length > 0 && (
              <span className="normal-case">Source: {f.sourceRefs.map((s) => s.label.split(" - ")[0]).join("; ")}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  precision,
  count,
  children,
}: {
  title: string;
  precision?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
        {count != null && <span className="num text-xs text-ink-muted">{count}</span>}
      </div>
      {precision && (
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-muted">{precision}</p>
      )}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-surface-border py-1.5 text-sm last:border-0">
      <span className="text-ink-muted">{k}</span>
      <span className="num font-medium text-ink">{v}</span>
    </div>
  );
}
