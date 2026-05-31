import Link from "next/link";
import { allSources, getSource } from "@/lib/sources";
import { getDomain } from "@/lib/domains";
import { metricsForDomain } from "@/lib/metric-catalog";
import {
  SCORED_DOMAIN_ORDER,
  SCORED_INDICATOR_SOURCING,
  CONTEXT_SOURCING,
} from "@/lib/methodology-reference";

export const metadata = {
  title: "Methodology & data reference · Melbourne Liveability",
  description:
    "Every dataset we use, where it comes from, its licence and vintage, and exactly how it is joined to an SA2 — plus scoring, crosswalk, and caveats.",
};

const TOC: { id: string; label: string }[] = [
  { id: "reference", label: "Data reference (what / where / how)" },
  { id: "manifest", label: "Full source manifest" },
  { id: "scoring", label: "Scoring & percentiles" },
  { id: "crosswalk", label: "Geography crosswalk" },
  { id: "profile", label: "Profile drawer & benchmark bands" },
  { id: "context", label: "Context layers (never scored)" },
  { id: "confidence", label: "Data confidence & coverage" },
  { id: "refresh", label: "Provenance & automated refresh" },
  { id: "caveats", label: "Caveats" },
  { id: "attribution", label: "Attribution & licences" },
];

export default function MethodologyPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-bg px-4 py-8 text-ink">
      <Link href="/" className="text-sm text-accent no-underline hover:underline">
        ← Map
      </Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-ink">
        Methodology &amp; data reference
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        This site compiles Australian government / official open data (with attributed
        OpenStreetMap as a labelled fallback) into one transparent map. Scores are{" "}
        <strong className="text-ink">percentile ranks within Greater Melbourne</strong>{" "}
        (GCCSA 2GMEL), not absolute national benchmarks. The canonical geography is
        ABS <strong className="text-ink">SA2</strong>; suburb names are search aliases
        resolved to SA2 via a population- or area-weighted crosswalk.
      </p>

      {/* Table of contents */}
      <nav
        aria-label="On this page"
        className="mt-6 rounded-lg border border-surface-border bg-surface p-4 shadow-card"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          On this page
        </h2>
        <ol className="mt-2 grid gap-1 sm:grid-cols-2">
          {TOC.map((t, i) => (
            <li key={t.id} className="text-sm">
              <a href={`#${t.id}`} className="text-accent hover:underline">
                {i + 1}. {t.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ---------------------------------------------------------------- */}
      {/* 1. Data reference                                                */}
      {/* ---------------------------------------------------------------- */}
      <Section id="reference" title="1. Data reference — what we hold, where it's from, how we use it">
        <p>
          The seven <strong className="text-ink">scored</strong> domains below blend to the
          composite (default ULTRAPLAN §1 weights shown). Each row names the underlying
          dataset, the data&apos;s <em>real</em> granularity before we attribute it to an
          SA2, and the join method. Direction records the honest reading
          (&ldquo;higher / lower is better&rdquo;).
        </p>

        {SCORED_DOMAIN_ORDER.map(({ id, weight }) => {
          const cfg = getDomain(id);
          const metrics = metricsForDomain(id);
          return (
            <div key={id} className="mt-5">
              <h3 className="text-sm font-semibold text-ink">
                {cfg?.label ?? id}{" "}
                <span className="num font-normal text-ink-muted">· weight {weight}</span>
              </h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-surface-border">
                <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                  <thead className="bg-surface-sunken text-ink-muted">
                    <tr>
                      <Th>Indicator</Th>
                      <Th>Source</Th>
                      <Th>Vintage</Th>
                      <Th>Real geography</Th>
                      <Th>Join method</Th>
                      <Th>Direction</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map((m) => {
                      const src = SCORED_INDICATOR_SOURCING[m.key];
                      const rec = src ? getSource(src.sourceId) : undefined;
                      return (
                        <tr key={m.key} className="border-t border-surface-border align-top">
                          <Td>
                            <span className="font-medium text-ink">{m.label}</span>
                            <span className="block text-ink-muted">{m.unit}</span>
                          </Td>
                          <Td>
                            {rec ? (
                              <a
                                href={rec.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-ink underline decoration-dotted underline-offset-2 hover:text-accent"
                              >
                                {rec.name.split(" — ")[0]}
                              </a>
                            ) : (
                              "—"
                            )}
                          </Td>
                          <Td className="num">{rec?.period ?? "—"}</Td>
                          <Td>{src?.geography ?? "—"}</Td>
                          <Td>{src?.method ?? "—"}</Td>
                          <Td>{m.higherIsBetter ? "Higher better" : "Lower better"}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <h3 className="mt-6 text-sm font-semibold text-ink">
          Context layers &amp; pins — never scored
        </h3>
        <p className="text-sm text-ink-muted">
          These are compiled for transparency and exploration. They never enter the
          composite, the weights, or the data-confidence index.
        </p>
        <div className="mt-2 overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead className="bg-surface-sunken text-ink-muted">
              <tr>
                <Th>Layer</Th>
                <Th>Source</Th>
                <Th>Vintage</Th>
                <Th>Real geography</Th>
                <Th>How used</Th>
              </tr>
            </thead>
            <tbody>
              {CONTEXT_SOURCING.map((c) => {
                const rec = getSource(c.sourceId);
                return (
                  <tr key={c.label} className="border-t border-surface-border align-top">
                    <Td className="font-medium text-ink">{c.label}</Td>
                    <Td>
                      {rec ? (
                        <a
                          href={rec.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-ink underline decoration-dotted underline-offset-2 hover:text-accent"
                        >
                          {rec.name.split(" — ")[0]}
                        </a>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="num">{rec?.period ?? "—"}</Td>
                    <Td>{c.geography}</Td>
                    <Td>{c.use}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* 2. Full source manifest                                          */}
      {/* ---------------------------------------------------------------- */}
      <Section id="manifest" title="2. Full source manifest">
        <p>
          Every dataset in the build, rendered straight from the committed manifest
          (<code className="text-xs">data/generated/sources.json</code>). Each non-derived
          source records a sha256 of its raw file (see{" "}
          <a href="#refresh" className="text-accent hover:underline">
            provenance
          </a>
          ). &ldquo;Derived&rdquo; rows are computed from other sources and carry no raw
          file of their own.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead className="bg-surface-sunken text-ink-muted">
              <tr>
                <Th>Dataset</Th>
                <Th>Licence</Th>
                <Th>Vintage</Th>
                <Th>Last fetch</Th>
                <Th>Provenance</Th>
              </tr>
            </thead>
            <tbody>
              {allSources().map((s) => {
                const derived = (s as { derived?: boolean }).derived;
                const hash = s.sha256 && s.sha256.length > 0;
                return (
                  <tr key={s.id} className="border-t border-surface-border align-top">
                    <Td>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-ink underline decoration-dotted underline-offset-2 hover:text-accent"
                      >
                        {s.name}
                      </a>
                    </Td>
                    <Td>{s.licence}</Td>
                    <Td className="num">{s.period ?? "—"}</Td>
                    <Td className="num">{s.fetchedAt ?? "—"}</Td>
                    <Td>
                      {derived
                        ? "derived"
                        : hash
                          ? `sha256 ${s.sha256!.slice(0, 8)}…`
                          : "pending next build"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* 3. Scoring                                                       */}
      {/* ---------------------------------------------------------------- */}
      <Section id="scoring" title="3. Scoring & percentiles">
        <p>
          Each scored indicator is percentile-ranked <strong className="text-ink">within
          Greater Melbourne</strong> (relative, not absolute), inverting indicators where
          higher is worse (rent, crime, hazard overlay). A domain score is the sub-weighted
          blend of its indicators; the composite is the weight-blend of the seven scored
          domains. Default weights: Affordability 30, Transport 18, Crime/Safety 14, Health
          14, Hazards 8, Education 8, Income/Economy 8 — adjustable by sliders / persona
          presets, which re-normalise at runtime.
        </p>
        <p>
          Missing data is never imputed: a missing indicator gets a null percentile, is
          excluded from the weighted total, and its weight is re-distributed across the
          present scored domains. The composite and persona scores are{" "}
          <strong className="text-ink">optional lenses</strong>, never a definitive ranking.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* 4. Crosswalk                                                     */}
      {/* ---------------------------------------------------------------- */}
      <Section id="crosswalk" title="4. Geography crosswalk">
        <p>
          Sources arrive at different geographies. SA2-direct ABS series are used as-is.
          Suburb/LGA series (VCSA crime) are aggregated to SA2 by{" "}
          <strong className="text-ink">population-weighted</strong> spatial intersection
          (area-weighted fallback where mesh-block population is unavailable); every
          aggregated value records which method it used. Point data (hospitals, GP,
          schools, pins) needs no crosswalk — it is assigned to the SA2 it falls in, with
          proximity measured from the SA2 centroid. Polygon overlays (hazards) are
          area-weighted against each SA2.
        </p>
        <p>
          <strong className="text-ink">Non-residential SA2s</strong> (estimated resident
          population &lt; 200 — airports, parkland, industrial, water) are excluded from
          percentile baselines and rankings, and drawn in neutral no-data grey
          (<code className="text-xs">#d9d6cf</code>) rather than a misleading score.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* 5. Profile drawer                                                */}
      {/* ---------------------------------------------------------------- */}
      <Section id="profile" title="5. Profile drawer & benchmark bands">
        <p>
          Each place profile is a tabbed drawer (adapted from the Analisa.pt
          municipality-drawer pattern): an Overview tab (composite breakdown, key facts,
          resident-population trend), one tab per persona lens (Family, Young professional,
          Retiree, Student) that re-weights the same seven domains, one tab per scored
          domain, and context tabs (Home buyer, Walk &amp; cycle, Equity &amp; community,
          Data coverage).
        </p>
        <p>
          Inside a domain tab, each indicator card shows its value, unit, honest direction,
          Greater-Melbourne percentile, source, and a <strong className="text-ink">benchmark
          band</strong> — this area&apos;s raw value against the GM median and P25–P75
          range across residential SA2s, computed at build from the full dataset.{" "}
          <strong className="text-ink">Time-series</strong> are shown only where we hold
          ≥3 real points (population; property &amp; violent crime, labelled LGA-level so
          they are not misread as SA2-precise); every trend line states its geography,
          period range, and any boundary break. Other indicators say
          &ldquo;single period — no trend data held&rdquo; rather than fabricating one.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* 6. Context layers                                                */}
      {/* ---------------------------------------------------------------- */}
      <Section id="context" title="6. Context layers (never scored)">
        <p>
          <strong className="text-ink">Equity</strong> (SEIFA IRSAD/IRSD deciles),{" "}
          <strong className="text-ink">community</strong> (renter %, apartment %, First
          Nations %), <strong className="text-ink">population trend</strong>, and{" "}
          <strong className="text-ink">home-buyer index</strong> appear for transparency
          only. The home-buyer index blends indicators we already hold (cost-pressure 28%,
          safety 18%, schools 16%, transport 14%, low hazard 14%, walk access 10%) into a
          GM percentile — using <strong className="text-ink">no sale-price data</strong>,
          so it is not a price or capital-growth estimate.
        </p>
        <p>
          <strong className="text-ink">15-minute access</strong> counts how many of eight
          everyday-amenity categories sit within ~1.2 km of the SA2 centroid (straight-line,
          not street-network). <strong className="text-ink">Cyclability</strong> is the
          density of OSM cycle infrastructure per km² (an infrastructure measure, not a
          safety/comfort rating). Both are OSM-derived (ODbL), community-maintained and
          uneven in coverage, and appear as a profile panel plus an optional map layer.
        </p>
        <p>
          <strong className="text-ink">Map pins</strong> (hospitals, GP, pharmacy, police,
          schools, childcare, post, pathology/NDIS, supermarkets, parks, gyms, cafes) are
          off by default and toggled per category, colour-coded by a categorical palette
          kept separate from the YlGnBu choropleth ramp. NDIS and pathology are sparsely
          tagged in OSM — treat their coverage as indicative, not complete.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* 7. Data confidence                                               */}
      {/* ---------------------------------------------------------------- */}
      <Section id="confidence" title="7. Data confidence & coverage">
        <p>
          Each SA2 carries a 0–100 data-confidence index combining domain coverage,
          completeness (non-missing sub-indicators), freshness, and aggregation-method
          confidence (directly measured &gt; crosswalk-estimated &gt; proximity). It
          describes how well-<em>measured</em> an area is — a property of our pipeline, not
          a judgement of the place — and is shown as an optional map layer and a per-area
          report card. Across Greater Melbourne it is near-uniform (≈86–95) and shows no
          correlation with income or SEIFA (r ≈ 0). The profile&apos;s Data-coverage panel
          states, per domain, what the data actually represents and which indicators are
          measured, missing, or stale.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* 8. Provenance / refresh                                          */}
      {/* ---------------------------------------------------------------- */}
      <Section id="refresh" title="8. Provenance & automated refresh">
        <p>
          Each source records a cadence and, where the upstream API exposes it, a
          last-updated date plus a <strong className="text-ink">sha256</strong> of its raw
          file. A scheduled job re-fetches, rebuilds, and re-hashes monthly; when a raw
          file&apos;s hash changes the map redeploys, and when upstream is unchanged the
          build is a no-op. A blank hash in the manifest above means that source was added
          to the manifest and will be stamped on the next full build.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* 9. Caveats                                                       */}
      {/* ---------------------------------------------------------------- */}
      <Section id="caveats" title="9. Caveats">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Crime is recorded at suburb/LGA level and allocated to SA2 by crosswalk — not
            resident point-level. Resident-population rates can overstate inner-city areas
            with large daytime worker/visitor populations.
          </li>
          <li>
            Hazard scores reflect designated regulatory overlay land, not insurance-grade
            fire/flood likelihood. An SA2 may be partly overlaid yet most dwellings
            unaffected. The SBO flood layer is currently unavailable from the Vicplan API
            (LSIO only).
          </li>
          <li>
            <strong className="text-ink">GP/clinic count is OSM nodes only</strong> — by
            design, so widening the map-pin query never shifts the scored Health composite.
            This excludes clinics mapped as building polygons (ways), so it can undercount.
          </li>
          <li>
            Schools and GP use community-maintained OpenStreetMap; preschool uses Census
            counts. NDIS and pathology pins are sparsely tagged in OSM.
          </li>
          <li>
            Labour-force indicators are Census 2016 — older than income/rent (2021). GTFS
            is a static timetable export, not real-time service quality.
          </li>
          <li>
            15-minute access distances are straight-line, not street-network; rivers,
            freeways and rail crossings are not modelled.
          </li>
        </ul>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* 10. Attribution                                                  */}
      {/* ---------------------------------------------------------------- */}
      <Section id="attribution" title="10. Attribution & licences">
        <p>
          ABS, PTV GTFS, VCSA, Victoria planning &amp; MapShare data are CC BY 4.0 (some
          marked CC BY 4.0 Victoria) — see the per-dataset licences in the{" "}
          <a href="#manifest" className="text-accent hover:underline">
            manifest
          </a>{" "}
          above. Schools, GP/clinics, transport fallback, everyday amenities, cycle
          infrastructure, post offices and pathology/NDIS points are © OpenStreetMap
          contributors, licensed ODbL. This product charges for tooling and presentation,
          never for reselling the underlying open data, and retains attribution.
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          Spotted a data problem or want a dataset added? Use the{" "}
          <strong className="text-ink">Feedback</strong> button in the top bar — reports
          are reviewed against the next refresh and never folded directly into scores.
        </p>
      </Section>

      <p className="mt-8 text-xs text-ink-muted">
        Not relocation or financial advice. Scores are one optional lens over open data,
        not a definitive ranking of where to live.
      </p>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-8 scroll-mt-4">
      <h2 className="font-display text-lg font-medium text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-3 py-2 font-semibold uppercase tracking-wide">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 text-ink-muted ${className}`}>{children}</td>;
}
