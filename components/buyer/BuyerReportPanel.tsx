"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { X, ShieldAlert, CheckCircle2, HelpCircle, Info, Bookmark, BookmarkCheck } from "lucide-react";
import type { BuyerReport, BuyerFinding, BuyerConfidence, BuyerGeography } from "@/lib/buyer-report";
import { anchorKindLabel, bandLabel } from "@/lib/anchors";
import { SunPathDiagram } from "./SunPathDiagram";
// 3D building/sun view is heavy (MapLibre) - load it only when the user opens it.
const SunShadowView = dynamic(
  () => import("./SunShadowView").then((m) => m.SunShadowView),
  { ssr: false, loading: () => <p className="mt-3 text-xs text-ink-muted">Loading 3D view...</p> }
);
// Reachability ("how far can you get") is also MapLibre-heavy + fires routing
// calls - load + run it only when the user opens it.
const ReachabilityCard = dynamic(
  () => import("./ReachabilityCard").then((m) => m.ReachabilityCard),
  { ssr: false, loading: () => <p className="mt-3 text-xs text-ink-muted">Loading map...</p> }
);
import { AMENITY_GROUPS } from "@/lib/buyer-report";
import { isReachabilityConfigured } from "@/lib/reachability";
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
  sa2: "suburb / area",
  lga: "council area",
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
  // Negatives ("What to weigh up") = measured downsides (engine tone "concern")
  // plus red flags. Checks ("Things to verify") = neutral due-diligence prompts
  // with no positive/negative read yet. Positives are their own group.
  const negatives = report.findings.filter((f) => f.kind === "red_flag" || f.tone === "concern");
  const checks = report.findings.filter((f) => f.kind === "verify" && f.tone !== "concern");
  const positives = report.findings.filter((f) => f.kind === "positive");
  // Southern hemisphere -> north-facing rooms/yards get the most sun (vice versa north).
  const sunSideWord = (report.location.lat ?? -37.8) < 0 ? "north" : "south";
  const unavailable = report.findings.filter((f) => f.kind === "unavailable");
  const neutral = report.findings.filter((f) => f.kind === "neutral");
  const community = place?.context?.community;
  const equity = place?.context?.equity;
  const generated = report.generatedAt?.slice(0, 10) || "—";
  // Paid-tier precise walk routing recomputes "nearby" against a street-network
  // isochrone; the free tier uses a straight-line radius. Drive the copy off it.
  const precise = report.accessMode === "precise";
  const reachLabel = precise ? "reachable on foot" : "within ~1.2 km";
  // The live map panel is a LIGHT set of pin-specific hints; the heavy chrome and
  // the area-level sections (which duplicate the /places profile) are hidden there
  // and reached via the "See the full area report" button. The sample + embedded
  // (/places) variants render the full report.
  const isLive = variant === "live";
  const [show3d, setShow3d] = useState(false);
  const [showReach, setShowReach] = useState(false);

  return (
    <div className={`space-y-4 text-ink ${className}`}>
      {/* Header + actions */}
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-ink">Buyer Location Check</h2>
            {!isLive && (
              <p className="text-xs text-ink-muted">
                A sourced, plain-English screening report for this location.
              </p>
            )}
          </div>
          {!isLive && <ConfidenceBadge confidence={report.summary.confidence} />}
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
        {place && !place.nonResidential && variant !== "embedded" && (
          <Link
            href={`/places/${place.slug}`}
            onClick={() => track("buyer_see_full_report", { slug: place.slug })}
            className="no-print mt-1 flex items-center justify-between gap-2 rounded-lg bg-accent px-3.5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span>See the full area report</span>
            <span aria-hidden className="text-base leading-none">&rarr;</span>
          </Link>
        )}
        {(variant !== "embedded") && (
          <div className="no-print flex flex-wrap gap-2">
            {shareUrl && (
              <ShareViewButton
                getUrl={() => shareUrl}
                label="Copy shareable link"
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink transition-colors hover:bg-accent-focus"
              />
            )}
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
        {/* Not-advice banner (full report only; the live hint panel keeps the
            compact disclaimer at the foot instead). */}
        {!isLive && (
          <div className="rounded-lg border border-[#E9C8B4] border-l-[3px] border-l-accent bg-[#FBEEE6] px-3 py-2 text-xs leading-relaxed text-[#9A552F]">
            <b>Information only - verify before buying.</b> A second opinion to help you decide what
            to <b>verify</b>. Not financial, property, legal, insurance or planning advice.
            {variant === "sample" && " Sample report - not a report for a specific property."}
          </div>
        )}

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
                    {!isLive && (
                      <p className="text-xs leading-snug text-ink-muted">
                        {f.verifyAction || f.summary}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {!isLive && (
              <p className="mt-2 text-[11px] text-ink-muted">
                Ranked by how much they affect a buy decision. Full detail, sources and
                caveats are below.
              </p>
            )}
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

        {/* 1c. Distance to the buyer's real-life anchors (work/school/family).
            The wedge a suburb-score can't match - straight-line, never scored. */}
        {report.anchorDistances && report.anchorDistances.length > 0 && (
          <Section title="Distance to your places">
            <ul className="space-y-1.5">
              {report.anchorDistances.map((d) => (
                <li
                  key={d.anchor.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-surface-border bg-surface px-2.5 py-1.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{d.anchor.label}</span>
                    <span className="block text-[11px] uppercase tracking-wide text-ink-muted">
                      {anchorKindLabel(d.anchor.kind)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {d.driveMin != null ? (
                      <>
                        <span className="num block text-sm font-semibold text-ink">
                          {d.driveMin} min drive
                        </span>
                        <span className="num block text-[11px] text-ink-muted">
                          {d.driveKm} km by road
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="num block text-sm font-semibold text-ink">{d.km} km</span>
                        <span className="block text-[11px] text-ink-muted">{bandLabel(d.band)}</span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-snug text-ink-muted">
              {report.anchorDistances.some((d) => d.driveMin != null)
                ? "Off-peak driving time + road distance where routing is available (OpenRouteService / OpenStreetMap), otherwise straight-line. Verify the real commute at peak hour."
                : "Straight-line distance from this pin to your saved places - not drive or public-transport time. Verify the real commute at peak hour."}
            </p>
          </Section>
        )}

        {/* 2. What to weigh up - measured downsides + red flags */}
        {negatives.length > 0 && (
          <Section title="What to weigh up" count={negatives.length}>
            <div className="space-y-2.5">
              {negatives.map((f) => (
                <FindingCard key={f.id} f={f} compact={isLive} />
              ))}
            </div>
          </Section>
        )}

        {/* 3. Things to verify - neutral due-diligence prompts */}
        {checks.length > 0 && (
          <Section title="Things to verify" count={checks.length}>
            <div className="space-y-2.5">
              {checks.map((f) => (
                <FindingCard key={f.id} f={f} compact={isLive} />
              ))}
            </div>
          </Section>
        )}

        {/* 4. What looks positive */}
        {positives.length > 0 && (
          <Section title="What looks positive" count={positives.length}>
            <div className="space-y-2.5">
              {positives.map((f) => (
                <FindingCard key={f.id} f={f} compact={isLive} />
              ))}
            </div>
          </Section>
        )}

        {/* 3b. Sun & light - honest sun-path diagram (lib/sun, not a shadow map). */}
        {report.location.lat != null && (
          <Section title="Sun & light">
            <SunPathDiagram lat={report.location.lat} />
            <p className="mt-2 text-[11px] leading-snug text-ink-muted">
              <b className="text-ink">Best light comes from the {sunSideWord}.</b> Living
              areas, windows or a yard facing {sunSideWord} get the warmest, most reliable
              sun - and winter sun sits low, so tall buildings or trees on that side can
              overshadow it. {sunSideWord === "north" ? "South" : "North"}-facing rooms get
              little direct sun. We can&apos;t see your specific building, so check which way
              the main rooms face when you visit (same path for the whole street).
            </p>
            {hasPin && (
              <div className="mt-3">
                {show3d ? (
                  <SunShadowView
                    lng={report.location.lng as number}
                    lat={report.location.lat as number}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShow3d(true);
                      track("buyer_sun_3d");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-surface-sunken px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                  >
                    View buildings in 3D + shadow simulator &rarr;
                  </button>
                )}
              </div>
            )}
          </Section>
        )}

        {/* 3c. How far you can get - reachability isochrone (opt-in; fires routing). */}
        {hasPin && isLive && isReachabilityConfigured() && (
          <Section title="How far you can get">
            <p className="text-[11px] leading-snug text-ink-muted">
              See the area you can reach by car or on foot in a set time - and which Melbourne
              suburbs fall inside, with their all-round liveability score.
            </p>
            <div className="mt-3">
              {showReach ? (
                <ReachabilityCard
                  lng={report.location.lng as number}
                  lat={report.location.lat as number}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowReach(true);
                    track("buyer_reachability");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-surface-sunken px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  Show how far you can get &rarr;
                </button>
              )}
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

        {/* 5. Area liveability snapshot (full report only - the live panel sends
            the user to the richer /places profile via the header button).
            Skipped for non-residential SA2s, which have no scored domains. */}
        {place && !place.nonResidential && !isLive && (
          <Section
            title="Area liveability snapshot"
            precision="Area-level (the suburb/area, not the parcel) · src: see methodology"
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

        {/* 6. Community & census context (full report only - it lives on /places) */}
        {place && !isLive && (
          <Section title="Community & census context" precision="Area-level · src: ABS Census 2021 / SEIFA">
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

        {/* (neutral findings, e.g. data confidence) - data notes belong in the
            full report / methodology, not the live hint panel. */}
        {neutral.length > 0 && !isLive && (
          <Section title="Data notes">
            <div className="space-y-2.5">
              {neutral.map((f) => (
                <FindingCard key={f.id} f={f} compact={isLive} />
              ))}
            </div>
          </Section>
        )}

        {/* 7. Sources & confidence (full report only; live links out to /places
            + methodology, and amenity rows carry their own OSM/ABS attribution). */}
        {!isLive && (
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
              (point-level for amenities; area-level for liveability/community; council-level for
              crime; area overlay share for hazards).
            </p>
          )}
        </Section>
        )}

        {/* 8. Disclaimer */}
        <div className="rounded-lg border border-surface-border bg-surface-sunken px-3 py-2.5">
          {report.disclaimers.map((d, i) => (
            <p key={i} className="text-[11px] leading-relaxed text-ink-muted">
              {d}
            </p>
          ))}
        </div>

        {/* Print-only footer: brand + provenance reminder on every PDF page set. */}
        <div className="mt-4 hidden border-t border-surface-border pt-2 text-[10px] leading-snug text-ink-muted print:block">
          <span className="font-display font-semibold text-ink">liveable.melbourne</span>
          {" - Buyer Location Check. Generated "}
          {generated}. Information only, not advice - every figure is sourced above and on the
          methodology page. Verify anything material before you offer.
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

function FindingCard({ f, compact = false }: { f: BuyerFinding; compact?: boolean }) {
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
          {/* The "Verify:" action is due-diligence detail - it belongs in the full
              report, not the live hint panel (compact). */}
          {f.verifyAction && !compact && (
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
