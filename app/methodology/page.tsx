import Link from "next/link";

export default function MethodologyPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-bg px-4 py-8 text-ink">
      <Link href="/" className="text-sm text-accent no-underline hover:underline">
        ← Map
      </Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Methodology</h1>
      <section className="mt-6 space-y-4 text-ink">
        <p>
          Scores are percentile ranks within Greater Melbourne (GCCSA 2GMEL), not
          absolute national benchmarks. Canonical geography is ABS SA2; suburb names
          are search aliases resolved via population- or area-weighted crosswalk.
        </p>
        <h2 className="font-display text-lg font-medium text-ink">Scored domains & weights</h2>
        <p className="text-sm text-ink-muted">
          Default weights follow ULTRAPLAN §1: Affordability 30, Transport 18, Crime/Safety
          14, Health 14, Hazards 8, Education 8, Income/Economy 8. Sliders and persona
          presets re-normalise at runtime.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Affordability</strong> — rent-to-income: ABS Census 2021 median
            weekly rent ÷ ABS Data by Region median equivalised household income (SA2).
            Lower ratio scores higher.
          </li>
          <li>
            <strong>Transport</strong> — PTV GTFS Schedule: stops within 800 m,
            weekday AM-peak scheduled trip count (07:00–09:59), mode mix (train / tram / bus).
            OpenStreetMap stop count is a labelled fallback only if GTFS precompute is
            missing.
          </li>
          <li>
            <strong>Crime / Safety</strong> — VCSA Table 03 suburb/town offence counts
            aggregated to SA2 via crosswalk; LGA Table 02 fallback when suburb match
            fails.
          </li>
          <li>
            <strong>Health</strong> — distance to nearest general hospital (Vic
            MapShare); GP/clinic count within 2 km from OpenStreetMap. NDIS is not
            scored (no reliable public point-level dataset).
          </li>
          <li>
            <strong>Hazards</strong> — % of SA2 area in bushfire-prone area (Vicmap
            Planning) and flood overlay (LSIO; SBO layer unavailable from Vicplan API).
            These are regulatory planning
            overlays, not probabilistic risk models. Lower overlay share scores higher.
          </li>
          <li>
            <strong>Education</strong> — count of schools within 2 km (OpenStreetMap)
            and children enrolled in preschool (ABS Census 2021, SA2).
          </li>
          <li>
            <strong>Income / Economy</strong> — median equivalised household income
            (ABS 2021); employment-to-population and participation (ABS Census 2016).
          </li>
        </ul>

        <h2 className="font-display text-lg font-medium text-ink">Context panels (not scored)</h2>
        <p>
          Equity (ABS SEIFA IRSAD/IRSD deciles), community (renter %, apartment
          dwelling %, First Nations %), environment, and politics appear on place
          profiles for transparency only. They never change the liveability rank.
        </p>

        <h2 className="font-display text-lg font-medium text-ink">
          15-minute access (context, not scored)
        </h2>
        <p>
          Inspired by Melbourne&apos;s &ldquo;20-minute neighbourhood&rdquo; and
          Paris&apos;s &ldquo;15-minute city&rdquo; programs, we compile how many
          of eight everyday-amenity categories — supermarket/grocery, pharmacy,
          GP/clinic, school, childcare/kinder, park/open space, cafe/restaurant,
          and gym/leisure — sit within about a 15-minute walk (~1.2 km at 5 km/h)
          of each SA2&apos;s population-weighted centroid. We also report a coarse
          walkability index that blends category coverage with local amenity
          density. Both appear as a profile panel and an optional
          &ldquo;15-min walk access&rdquo; map layer.
        </p>
        <p className="text-sm text-ink-muted">
          This is a <strong>data-compilation / accessibility feature</strong>, not
          a routing engine, and it is <strong>never part of the liveability
          score, its weights, or the data-confidence index</strong>. Caveats:
          distances are <strong>straight-line</strong> (&ldquo;as the crow
          flies&rdquo;), so they overstate real walking access — the street
          network, rivers, freeways and rail crossings are not modelled; and
          amenity data is © OpenStreetMap contributors (ODbL), which is
          community-maintained and uneven in coverage.
        </p>

        <h2 className="font-display text-lg font-medium text-ink">
          Cyclability (context, not scored)
        </h2>
        <p>
          For each SA2 we compile the total length of OpenStreetMap cycling
          infrastructure — dedicated cycleways (<code>highway=cycleway</code>),
          on-road bike lanes (<code>cycleway=*</code> tags) and
          bicycle-designated paths (<code>bicycle=designated</code>) — whose
          midpoint falls inside the SA2, then divide by the SA2&apos;s land area
          to get a cycle-infrastructure density (km per km²). A coarse 0–100
          cyclability index saturates that density so dense inner suburbs reach
          the top without a single outlier dominating. It appears as a profile
          panel and an optional &ldquo;Cyclability&rdquo; map layer.
        </p>
        <p className="text-sm text-ink-muted">
          This is an <strong>infrastructure-density</strong> measure, not a
          safety, comfort or connectivity rating, and it is{" "}
          <strong>never part of the liveability score, its weights, or the
          data-confidence index</strong>. Caveats: separated paths and painted
          on-road lanes are both counted equally; long trails crossing two SA2s
          are attributed wholly to the SA2 containing their midpoint; the
          Overpass query is capped to the Greater Melbourne envelope; and OSM
          cycle tagging is © OpenStreetMap contributors (ODbL),
          community-maintained and uneven.
        </p>

        <h2 className="font-display text-lg font-medium text-ink">Data confidence</h2>
        <p>
          Each SA2 carries a data-confidence index (0–100) combining domain
          coverage, completeness (non-missing sub-indicators), freshness, and
          aggregation-method confidence (directly measured &gt; crosswalk-estimated
          &gt; proximity). It describes how well-measured an area is — a property of
          our pipeline, not a judgement of the place — and is shown as an optional
          map layer and a per-area report card. It is never part of the liveability
          score. Across Greater Melbourne it is near-uniform (≈86–95) and shows no
          correlation with income or SEIFA (r ≈ 0).
        </p>

        <h2 className="font-display text-lg font-medium text-ink">Automated refresh</h2>
        <p>
          Each source records a cadence (rolling / quarterly / annual / census) and,
          where the upstream API exposes it, a last-updated date. A scheduled job
          re-fetches, rebuilds, and re-hashes the data monthly; when a raw file&apos;s
          sha256 changes the map redeploys automatically, and when upstream is
          unchanged the build is a no-op.
        </p>

        <h2 className="font-display text-lg font-medium text-ink">Caveats</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Crime is suburb-level, allocated to SA2 by crosswalk — not resident
            point-level.
          </li>
          <li>
            Hazard scores reflect designated overlay land, not insurance-grade flood or
            fire likelihood.
          </li>
          <li>
            Schools use community-maintained OpenStreetMap; preschool uses Census counts.
          </li>
          <li>
            Labour-force indicators are Census 2016 — older than income/rent (2021).
          </li>
          <li>GTFS is a static timetable export, not real-time service quality.</li>
        </ul>

        <h2 className="font-display text-lg font-medium text-ink">Crosswalk</h2>
        <p>
          Suburb (SAL) indicators aggregated to SA2 using area-weighted spatial
          intersection (population-weighted when mesh-block population CSV is supplied).
        </p>
        <h2 className="font-display text-lg font-medium text-ink">Non-residential SA2</h2>
        <p>
          SA2s with estimated resident population below 200 are excluded from percentile
          baselines and rankings.
        </p>
        <h2 className="font-display text-lg font-medium text-ink">Attribution & licences</h2>
        <p>
          ABS (CC BY 4.0); PTV GTFS (CC BY 4.0); VCSA (CC BY 4.0); Victoria planning and
          MapShare (CC BY 4.0); © OpenStreetMap contributors (ODbL) for schools, GP,
          transport fallback, 15-minute-access everyday amenities, and
          cyclability cycle-infrastructure.
        </p>
      </section>
    </div>
  );
}
