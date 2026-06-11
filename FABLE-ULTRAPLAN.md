# FABLE ULTRAPLAN - from free alpha to paid multi-city product

Build plan derived from `FABLE-ULTRAREVIEW.md` (2026-06-10, HEAD `abfdeaf`).
Audience: the build agent (Opus) executes OPUS tasks; the owner executes OWNER
tasks (decisions, accounts, lawyers, money). Tasks carry effort (S hours,
M day-ish, L days, XL week+) and acceptance criteria. Phases are ordered by
dependency, but Phase 2's OWNER track (lawyer, entity, domain) has lead time -
start it in parallel with Phase 0.

Existing docs remain canonical for what they cover (ULTRAPLAN vision,
EXPANSION-PLAN data matrices) EXCEPT where FABLE-ULTRAREVIEW section 4 lists
corrections. Apply those corrections to the docs as part of Phase 0.

---

## 1. Strategy lock (the decisions this plan assumes)

- **Positioning:** the owner-occupier pre-offer check at an exact pin. Plain
  English, every claim sourced and dated, honest about gaps. NOT investor
  analytics (ceded to Microburbs/DSR/HtAG), NOT an AVM, NOT advice. The
  no-forecast rule is load-bearing for both law and brand: never publish
  price/growth predictions or "invest here" framing.
- **Free/paid boundary (REVISED 2026-06-10 after the 4-lens audit; this
  version supersedes anything below that conflicts):**
  - Free forever, ON SCREEN: full map, all choropleths, /places profiles,
    compare, find, AND the full pin report - all findings, parcel-level
    overlay precision, per-finding provenance/verify-actions, price/rent
    context cards. Reason: the live pricing page promises "the Buyer Location
    Check" and "all the underlying facts" free BY NAME; paywalling facts later
    is a public retraction on a trust-branded product, and provenance is the
    s18 defence - it cannot be paywalled. NestCheck paywalls open data at
    $29.99; we differentiate the other way.
  - Paid = the ARTIFACT, not the facts: **"Buyer Report Snapshot"** (never
    call the paid SKU "Buyer Location Check" - that name is promised free) -
    frozen, dated, versioned PDF + permalink, confirmed-lot record, full
    provenance appendix, the thing you put in the offer file and show your
    partner/parents/broker. Later premium adds tooling (commute-to-MY-work,
    pre-settlement re-check), never data.
- **Pricing (launch):** Snapshot **$39** (launch promo $29); **$59 premium**
  anchor tier = snapshot + commute-to-MY-work isochrones (marginal cost ~0
  once self-hosted routing ships) + one pre-settlement re-check. **$89
  3-pack ONLY IF the credit-token spec lands** (a KV token with N remaining
  credits redeemable at future addresses - it is an account-lite system and
  must be costed as one; otherwise cut it from launch). No consumer
  subscription. GST-inclusive display. No "saved checks sync" claim until
  accounts exist (Phase 5). Year 2: B2B white-label seats $49-99/mo.
- **Repo/IP:** decide per Decision Register D3 before any payment code lands.
- **Expansion:** region-registry refactor -> Canberra pilot (quiet) -> Sydney
  flagship -> Brisbane -> Adelaide/Perth -> Hobart -> Darwin. National
  SA2-only free tier as SEO funnel when cheap. Geoscape deferred.
- **Success criteria year 1:** 500 paid reports + 5 B2B pilot conversations,
  not income replacement. Revenue scenarios: conservative $5-15k / base
  $40-90k / optimistic $150-300k.

---

## 2. Decision Register (OWNER - answer these, everything else flows)

| ID | Decision | Recommendation | Blocks |
|----|----------|----------------|--------|
| D1 | Product name + domain | **DECIDED 2026-06-10: Festra** (syncopated Latin fenestra = window; "a window into the data"). festra.au + festra.com.au PURCHASED. TM screen done (classes 9+42 clear; file via TM Headstart in D9 scope). Brand rename in-codebase done; the festra.au DNS + hosting cutover happens at P2-1 (basePath stays /melbourne-liveability on GitHub Pages until then) | ~~Phase 2~~ unblocked |
| D2 | Legal entity | Pty Ltd (ACL consumer-guarantee exposure is uncappable by contract; sole-trader = personal assets exposed) + ABN. ~$500-1k setup | First sale |
| D3 | Repo visibility | Either: private repo + entitlement backend (cleanest for paid), or open-core (code stays public under a licence, paid tier = hosted convenience). Recommend PRIVATE at paid launch; add LICENSE either way | Payment build |
| D4 | Routing/geocode infra | RESPECCED (builder audit): the $15-30 single-VPS assumption is infeasible - Photon needs ~16GB to import a country extract (no prebuilt AU index exists) and Valhalla tile-BUILD wants 8-16GB. Plan: build Valhalla AU tiles in GitHub Actions (16GB runners), rsync to a 4-8GB serving VPS (~AUD $40-80/mo); geocoding via G-NAF (Geoscape open data, e.g. Addressr) or paid LocationIQ. Week-1 spike confirms sizing. Break-even moves to ~3-5 reports/mo - still fine | Phase 2 infra |
| D5 | Analytics tool | Plausible (paid ~USD $9/mo) or self-host umami/GoatCounter (free). Any answer fine - pick one this week | Phase 0 |
| D6 | SA/WA lot-size + WA school zones | HIDE in those cities with honest "unavailable" findings (machinery exists). Do not buy data pre-revenue | Phase 4 only |
| D7 | Brisbane crime | Ship LGA-level with honest caveat; investigate QPS OCM licence later | Phase 4 only |
| D8 | Geoscape | DEFER. Sun = per-tile OSM density gating + Microsoft footprints infill. Revisit Geoscape only if sun becomes the proven conversion driver | Nothing now |
| D9 | Lawyer engagement | Fixed-fee AU tech/consumer lawyer, ~AU$2-5k: Terms, Privacy, refunds, liability clause, entity sanity-check. Start now - 2-4 week lead time | First sale |
| D10 | Insurance | Tech PI + cyber quote (~AU$1-2k/yr, AU$1-2M cover) | First sale |

---

## 3. REMOVE / DEMOTE list (consolidated)

| Item | Action | Why |
|------|--------|-----|
| /alerts page | Reduce to "coming with accounts" stub now; rebuild on real email tool in Phase 2 | Dead on prod, collects emails into the visitor's own localStorage, leaks env-var dev copy, Spam Act gap |
| Persona presets (PERSONA_PRESETS) | Delete; keep ?persona= URL shim mapping to interest views. NOTE: lib/personas.ts deletion DEFERRED - components/PlaceProfileClient.tsx (place-profile persona tabs) still consumes it; folding those tabs into interest views + deleting the file is explicitly part of P1-11 | Three overlapping personalisation systems; presets reachable only via URL + account page |
| Agent mode (buyer-fit) | Hide until it has a real workflow (white-label is the Phase 5 version) | Codex P1, still thin and inconsistent |
| Dead profile fields (schools/safety/walkability importance) | Wire into fit output or delete the inputs | Decorative personalisation = trust leak |
| components/BottomSheet.tsx | Delete | Imported nowhere |
| /buyer/sample vs /buyer/sample-report | Keep canonical only + redirect | Route duplication |
| CARTO basemap | Replace (Phase 2) | Enterprise-only for commercial; SPOF with no fallback |
| Always-on auto-geocode in SearchBox | Submit-only until proxied | Nominatim autocomplete ban; contradicts geocode.ts's own claim |
| adm-zip or unzipper (one of) | Standardise on one | Duplicate dependency |
| xlsx 0.18.5 | Replace with SheetJS CDN 0.20.3+ tarball or exceljs | Two high CVEs, npm registry frozen, CI holds contents:write |
| "It's free" pricing copy | Rewrite in the SAME release that ships Stripe (one coordinated money story across /pricing, /about, /buyer) | Currently forecloses packaging; present-tense "free to use - the map and every report" on /buyer widens the promise to reports |

Do-NOT-build list (write into known-gaps copy as trust assets): school quality
(ACARA My School ToU bans commercial use/derivatives - verified), NBN quality
(no licensed API - prior decision), address-level recent sales (CoreLogic
territory), easements (title documents, not open data), AVMs/forecasts (legal
+ positioning), user reviews/UGC (defamation + moderation burden - never),
short-stay/Airbnb density (Inside Airbnb is CC BY-NC - licence-blocked),
internet speed maps (Ookla open data is CC BY-NC - licence-blocked).

Also do-NOT-build-on: **Google Maps Platform APIs** (incl. the free Maps Demo
Key, evaluated 2026-06-10) - the Demo Key is a sandboxed dev/test key (daily
caps, not for production), and even paid GMP is structurally incompatible:
ToS require Google data to be displayed on Google maps (we are MapLibre/OSM),
prohibit caching/storing results (our paid product IS a frozen snapshot), and
its per-call pricing is the exact COGS trap the self-hosted plan avoids.
Acceptable use: throwaway UX prototyping only, never in the product. Geocoding
stays G-NAF/Addressr per D4; routing stays self-hosted Valhalla.

Parked, want-but-can't-yet: **development applications lens** ("is a 6-storey
block going up next door?") - top-3 buyer question, Landchecker has it behind
subscription, but PlanningAlerts commercial API is $3,850 AUD+GST/month
(verified 2026-06-10) and per-council DA registers are scattered/scrape-heavy.
OWNER action (free): email OpenAustralia Foundation (a charity) about a
startup/low-volume rate; revisit at revenue. Also parked: soil reactivity /
reactive-clay lens (ASRIS/CSIRO - check licence + resolution; niche but real
foundation-cost signal), brokers as an alternative first B2B vertical.

## 4. ADD list (consolidated, ranked by willingness-to-pay impact)

| # | Item | Source/licence | Effort |
|---|------|----------------|--------|
| 1 | Full report for the user's real pin (verify-actions, caveats, per-finding provenance, sources on screen) | Code exists; surface it | S-M |
| 2 | Frozen dated report snapshot (PDF + permalink) - THE sellable unit | Client-side PDF first; permalink via Phase 2 backend | M-L |
| 3 | Parcel-level zone + overlay point queries at the pin (HO/LSIO/SBO/BMO + zone) | Vicmap Planning ArcGIS, CC BY 4.0; then bake per sun pattern | M |
| 4 | Suburb median house/unit prices + rents context cards | VG Victorian Property Sales Report + Homes Victoria Rental Report, DataVic CC BY 4.0, XLSX, quarterly | M |
| 5 | Per-finding freshness inline: "as at DATE" on every finding incl. negative hazard statements | sources.json already has dates | S |
| 6 | Print / save-PDF button (window.print + print-completeness pass) | - | S |
| 7 | Analytics + feedback envs in deploy (D5) | - | S |
| 8 | Suburb-alias SEO pages + per-hazard long-tail pages (after domain move) | Existing suburb-SA2 crosswalk | M-L |
| 9 | Sun: per-tile density gating ("low 3D coverage here") + Microsoft AustraliaBuildingFootprints flat-height infill (ODbL, ~2018 vintage, label it) | MS footprints GitHub; Overture optional | M-L |
| 10 | Commute-to-MY-work isochrone overlay (paid tier, post-routing-infra) | Self-hosted Valhalla | M |
| 11 | Childcare quality lens: NQS ratings (Exceeding/Meeting/Working towards) on childcare POIs + "N centres within 1km, M rated Exceeding" report finding | ACECQA National Registers, daily CSV, CC BY (verify exact dataset licence at build); national - ports to every city free | S-M |
| 12 | Freshness as a feature: "Data updated DATE" header on map + report, plus a /changelog page (refresh log from sources.json) | Already in manifest | S |
| 13 | Upsell teaser rows in the free on-screen report: visible, labeled rows ("Parcel-level overlay check - in the $39 snapshot") - NOT blurred bait; keeps the published free promise intact | Spec inside P2-5 | S |
| 14 | Growth loop: every snapshot PDF footer carries "Generated for ADDRESS on DATE - get yours at DOMAIN" (PDFs get shared with partners, parents, brokers) | Part of P1-4 | S |
| 15 | Programmatic "X vs Y" suburb comparison pages (compare engine exists; thousands of high-intent, low-competition queries) | Existing crosswalk + compare | M |

---

## 5. Phase 0 - Stop the bleeding (OPUS, this week, ~2-3 days)

| ID | Task | Effort | Acceptance |
|----|------|--------|-----------|
| P0-1 | **Defuse the refresh timebomb before 2026-07-02:** fold ALL apply-* steps into scripts/build.ts (or their logic into normalize/score); add a field-coverage diff assertion to data-refresh.yml that fails before auto-commit if any populated field count drops >2% vs previous places.json. SCOPE EXTENSION (builder audit): first produce an input-availability table (apply step -> raw input -> producing fetch -> workflow line) - data/raw is GITIGNORED and data-refresh.yml never runs data:social-housing, data:housing-stress, data:abs-qualifications, data:schools (and beach/electorate/future-transport), so folding applies into build.ts WITHOUT adding their fetches fails or silently no-ops on clean CI | M | Simulated CLEAN-CHECKOUT refresh preserves volunteerPct on 359/361 places AND every apply step's input exists or its fetch runs; coverage gate demonstrably fails on a synthetic field drop |
| P0-2 | Dependency security: vitest `npm audit fix`; xlsx -> SheetJS CDN tarball or exceljs; move xlsx/adm-zip/unzipper/csv-parse to devDependencies; drop one zip lib | S-M | `npm audit` = 0 high/critical; pipeline scripts still run |
| P0-3 | Set NEXT_PUBLIC_ANALYTICS_DOMAIN (per D5) + NEXT_PUBLIC_FORMSPREE_FEEDBACK_ID in deploy-pages.yml. SAME COMMIT: amend the live "no behavioural tracking" copy (app/pricing/page.tsx, /about) and add the analytics + Formspree US-processor disclosure to /privacy - do not create in week 1 the promise-contradiction class P2-5 polices | S | Live site loads analytics script; feedback submits arrive; no page still claims "no tracking" |
| P0-10 | Print/save-PDF button (pulled forward from P1-3): window.print + print-completeness pass. The live /buyer landing promises "Save it as a PDF" TODAY and zero window.print calls exist | S | One click yields a complete dated PDF from the report panel |
| P0-4 | Alerts: strip to honest "coming with accounts" stub; delete env-var copy from UI | S | No email input on prod until Phase 2 email tool |
| P0-5 | CI: add e2e job serving out/ under /melbourne-liveability base path (npx serve) + 1 smoke spec; add mobile-viewport Playwright project | M | A basePath regression fails CI |
| P0-6 | Licensing hygiene: DATA-LICENCE/NOTICE file (ODbL attribution for buildings tiles + OSM-derived JSONs); buildings/manifest.json attribution fields; fix CSA licence string (CC BY 3.0 AU); fix stale AEC manifest entry; verify-or-swap BoM solar licence claim; check Melbourne Water HWS item licence; make /methodology section 10 the canonical attribution page, linked from map attribution + footer | S-M | Every rendered source has a verifiable licence + attribution path |
| P0-7 | Dead code + duplication: delete BottomSheet.tsx, persona presets (URL shim kept), hide agent mode, wire-or-delete dead profile fields, dedupe /buyer/sample routes | S-M | grep clean; tests green |
| P0-8 | Geocode submit-only (revert the 1.2s debounce auto-call) | S | No network call until Enter/submit |
| P0-9 | Apply FABLE-ULTRAREVIEW section 4 corrections to EXPANSION-PLAN.md + HANDOVER.md | S | Docs match measured reality |

Phase 0 exit: prod has telemetry + working feedback, no visibly-broken
surfaces, no scheduled data loss, audit clean, docs corrected.

---

## 6. Phase 1 - The sellable core (OPUS, 2-4 weeks)

Goal: after this phase, a buyer at an open house on a phone can get the full
honest report for THEIR pin in seconds and keep a dated artifact. This is the
product you then put a price on.

| ID | Task | Effort | Acceptance |
|----|------|--------|-----------|
| P1-1 | Full report at the real pin: an expanded view (or in-place expansion) rendering the FULL variant for live pins - verify-actions, caveats on screen (not print-only), per-finding provenance + freshness line | M | Live pin can reach every element the sample shows; compact stays default |
| P1-2 | "As at DATE" inline on every finding; negative hazard findings phrased "no X overlay in dataset Y as at DATE" (s18 mitigation) | S | E2E asserts presence; wording reviewed |
| P1-3 | Print/save-PDF button + print completeness (whyItMatters/caveats included; live variant prints everything the full variant shows) | S | One click yields a complete dated PDF |
| P1-4 | Frozen snapshot: serialize report inputs+findings to a versioned JSON, render to PDF client-side; store in saved checks; permalink deferred to Phase 2 backend | M-L | Re-opening a snapshot shows identical content + "generated DATE"; drift impossible |
| P1-5 | Parcel-precision lens: point-in-polygon zone + key overlays (HO/LSIO/SBO/BMO/ESO) at the pin (runtime first, never-throw pattern), marked geography:"parcel". MUST include a **parcel-confirmation step**: render the Vicmap cadastre lot polygon under the pin with "Is this the property? Adjust pin"; store the confirmed lot in any snapshot. AU geocoding is patchy - a paid parcel report about the NEIGHBOUR'S lot is the trust catastrophe and an s18 exposure. Endpoint spike first: plan-gis.mapshare.vic.gov.au CORS for browsers is unverified (WAF blocks by TLS fingerprint per project memory); fallback opendata.maps.vic.gov.au WFS (CORS-open per lib/parcel.ts). Spec the overlay-code -> finding mapping incl. schedule suffixes | M-L | Known address resolves to the correct lot or forces adjustment BEFORE any parcel finding renders; pin in a known HO shows parcel-level finding with provenance; off-coverage omits |
| P1-6 | Price/rent context: bake VG suburb medians (house+unit, quarterly + time series) + Homes Vic rents via suburb crosswalk; context-only cards, "not a valuation" framing | M | Cards render with VG/DataVic attribution + period; never enters score |
| P1-7 | Payload diet: (a) radius-filter sun load ~300m + drop ring precision to 6dp; (b) slim search-index JSON for first paint, lazy full places.json; (c) spatial-tile or worker-parse the big four report inputs (pois/traffic/noise/school-zones); (d) direct @turf submodule imports; (e) route all places consumers through the single-flight cache. STATUS 2026-06-10: shipped pois/traffic/noise/bus z14 report tiles (scripts/bake-report-tiles.ts); school-zones (591KB, lazy) and the report path's places.json load are still whole-file - the <2s 4G acceptance remains OPEN pending those + real-device timing | L | First pin report interactive <2s on simulated 4G mid-range phone; sun pin load <1.5MB wire |
| P1-8 | Mobile: MobileSheet peek/collapsed state; full-screen takeover for buyer report; 44px target pass; mobile-first MapTip equivalent | M-L | Report readable full-screen on 390px; map not permanently obscured |
| P1-9 | Verification: golden-value scoring tests (fixture -> exact totals/order, rankPlaces); component tests for BuyerReportPanel section gating + 2 auto-fetch cards (mock fetch) + MobileSheet; e2e journeys: pin-drop report, share-URL restore, compare, snapshot print | M-L | A wrong-weights mutant fails; CI runs 4 journeys both viewports |
| P1-10 | Decompose before Sydney: split lib/buyer-report.ts into per-lens modules + composition layer; extract page.tsx ensure*-loader cluster + report orchestration into hooks (useLatestRequest pattern) | L | No file >600 lines in the report path; behaviour-identical (tests prove) |
| P1-11 | UX debt batch: jargon sweep ("this SA2"->"this area", bare "GM"/"pct"); one-caveat-per-page dedup; SearchBox combobox ARIA (role=option + active-descendant + arrow keys); flatten Section/FindingCard nesting; landing feature-cards -> real report excerpt; finish em-dash sweep (incl. OnboardingModal) | M | axe pass on key routes; copy reads clean |
| P1-12 | localStorage migration switch: branch on version at load + migrations map + test (v1 payload survives v2 reader) | S | Synthetic v1 blob loads correctly |

Phase 1 exit: the paid SKU exists end-to-end minus payment. Demo: phone,
real address, full report, snapshot PDF saved.

---

## 7. Phase 2 - Commercial rails (parallel track; OWNER lead + OPUS infra)

OWNER (start NOW - lead times): D1 domain purchase; D2 ABN/entity; D9 lawyer
(Terms incl. ACL-compliant liability clause + refunds page + auto-renewal
disclosures; Privacy with APP 1.4 identity/contact + US-processor disclosure;
remove Draft banners after review); D10 insurance; Stripe account; email tool
account (Buttondown/Mailerlite - Spam Act: sender ID + one-click unsubscribe).

OPUS:

| ID | Task | Effort | Acceptance |
|----|------|--------|-----------|
| P2-1 | Hosting move: Cloudflare Pages (keep GitHub Actions CI; basePath drops to root; set CNAME from D1 domain). GH Pages stays as redirect or dies | M | Site serves from custom domain; old URLs 301 |
| P2-2 | Basemap swap: OpenFreeMap or self-hosted Protomaps PMTiles (AU extract on R2); keep Positron look (BSD-3 style); add minimal local fallback style for outages | M | Zero CARTO requests; map renders if tile host down (degraded) |
| P2-3 | Routing/geocode per D4: Valhalla + Photon (AU extracts) on VPS behind Worker proxy w/ KV cache + rate limit; ORS attribution if that path chosen | L | No requests to valhalla1.osm.de or nominatim.osm.org from prod; isochrones still <3s |
| P2-4 | Worker API - NO ACCOUNTS AT LAUNCH (architecture endorsed by all four audit lenses; delivery mechanism RESPECCED): Stripe Checkout with snapshot reference in session metadata -> on success_url redirect the snapshot renders ON SCREEN immediately (token in return URL - the buyer is mid-open-house; email is backup, never primary) -> webhook (idempotent via KV/D1) finalizes the R2 object + sends OUR transactional email with the permalink (Stripe receipt emails CANNOT carry custom links; Buttondown/Mailerlite are marketing tools - pick a transactional sender). Decide upload timing in the week-1 spike: pre-checkout upload with TTL on unpaid objects vs post-payment re-render. Token: signed, revocable; refund webhook wires token revocation. Operational specs required: lost-permalink recovery (manual Stripe lookup by email, stated SLA, instructions on success page + email), re-download policy. Apple Pay/Google Pay enabled. Checkout shows GST-inclusive total + plain refund line ("report fails to generate = money back") before the pay tap | M-L | Test purchase shows snapshot on screen at redirect with zero login; permalink email arrives from our sender; webhook replay-safe; refund revokes token; recovery path documented |
| P2-5 | Money story rewrite (one release): /pricing (real tiers, GST-inclusive), /about, /buyer landing; refund/cancellation page; entity name + ABN in footer/Terms/Privacy/receipts | M | No "free forever" contradiction anywhere; lawyer-approved copy |
| P2-6 | Alerts rebuilt on the email tool (double opt-in, unsubscribe header) wired to data-refresh CI | M | Refresh sends a real email; unsubscribe works |
| P2-7 | WCAG 2.2 AA audit + fixes + accessibility statement; axe CI against out/ | L | axe clean on all routes; statement published; buyer report = complete non-map path |
| P2-8 | Repo per D3: private + deploy keys, or LICENSE + open-core split | S-M | Decision implemented |

Gate: **no Stripe button ships until P2-1/2/3/5 + D2/D9/D10 are done.**
(ToS-clean infra + lawyer-reviewed terms + entity + insurance.)
ADDED (skeptic audit): the gate also requires EITHER the parcel-precision
data baked locally (P3-1) OR the purchase flow hard-failing with retry
messaging when the live parcel/overlay upstream is down. A paid snapshot must
never silently omit its headline content - "8 live hosts thin reports
silently" is a known weakness and money makes it unacceptable.

---

## 8. Phase 3 - Own the data + pipeline hardening (OPUS, overlaps Phase 2)

| ID | Task | Effort |
|----|------|--------|
| P3-1 | Bake the gov-ArcGIS lenses (proven sun pattern): ANEF polygons (easiest), tree canopy + urban heat + waterway sampled per SA2 at build; parcel-precision overlays from P1-5 baked to tiles. Kills ~5 runtime SPOFs | L |
| P3-2 | Tiles + large generated JSON out of git: bake workflows upload to R2/Releases; deploy fetches at build. Git history stops compounding (172MB tiles, 80MB pois blobs in 11 days) | M |
| P3-3 | Refresh robustness: failure notifications (issue/email on cron fail); weekly scheduled data:verify with network (link rot); archive data/raw per run to R2; calendar/issue template for annual manual layers (school-zones, traffic, activity-centres) | M |
| P3-4 | scripts/ typecheck: scripts/tsconfig.json + CI step; fix the 5 latent errors | S |
| P3-5 | CI licence gate: sources.json gains attributionShown; build fails on missing licence/attribution | S-M |
| P3-6 | Sun density gating + MS-footprints infill (ADD #9); re-bake at z15 or radius-filtered tiles if P1-7a insufficient | M-L |

---

## 9. Phase 4 - Expansion (OPUS, after Phases 1-3 land)

Sequence (revised from EXPANSION-PLAN per verified corrections):

1. **Region registry refactor first** (EXPANSION-PLAN section 2 stands):
   lib/regions.ts {id,label,gccsa,bbox,state,mapCenter,zoom,sources};
   parameterize fetch pipeline (GCCSA arg + loop); per-region places/geo
   emit; region switcher + /<region>/ routes; per-region SEO; generalize
   MEL_BBOX; sweep the ~248 "Melbourne" literals (104 files). Do AFTER P1-10
   decomposition, BEFORE any city data work. Effort: XL.
2. **Canberra pilot (quiet, no marketing):** one jurisdiction, ACTmapi for
   everything, open cadastre, spatial school PEAs, suburb-level ACT crime,
   GTFS incl. light rail, sun WORKS (near-complete OSM import). Purpose:
   debug the registry + per-state module pattern with a tiny blast radius.
   Unique lens: Mr Fluffy loose-fill asbestos register (address-level buyer
   red flag - standout differentiator). Effort: L-XL.
3. **Sydney flagship (marketing launch):** BOCSAR monthly suburb crime (CC BY
   4.0; advantage = temporal granularity), ePlanning hazard/zoning ArcGIS,
   SIX cadastre lot-size, TfNSW GTFS (free key, CI-side - verify terms),
   SEED hazards, Sydney-specific lenses (mine subsidence, contaminated land,
   acid sulfate, heat vulnerability SA1, ANEF). Sun: density-gated + infill;
   expect western-Sydney sparsity, inner/middle fine. Effort: XL.
4. **National SA2 free tier** (optional, cheap, anytime after registry):
   8-capital choropleth + profiles from Tier-A national data only - the SEO
   funnel + waitlist for per-city paid reports. Effort: M-L after registry.
5. **Brisbane** (LGA crime caveat per D7; parcel-level FloodWise is a
   standout lens) -> **Adelaide/Perth** (D6 hides; Perth loses school zones
   AND lot-size; Adelaide keeps sun) -> **Hobart** (theLIST; landslip lens)
   -> **Darwin** (national fallbacks; storm surge + UXO lenses).
6. **Census 2026 refresh wave:** data lands mid-2027, SEIFA early 2028 -
   schedule as a known cost; national launch on 2021 data is fine with a
   stated refresh plan.

Per-city checklist template: GCCSA registry entry -> ABS pulls (free) -> OSM
bbox bake (buildings/POIs) -> national layers clip (ACARA/ACECQA/GA
facilities) -> per-state Tier-B modules -> overlay crosswalk mapping local
instruments to finding categories -> unique local lenses -> honest
"unavailable in CITY" findings for gaps -> per-city e2e smoke + data:verify.

---

## 10. Phase 5 - B2B layer (year 2, sketch only)

White-label client reports for buyer's agents (REBAA ~140 members + several
hundred unvetted), conveyancers, brokers: their branding on the snapshot PDF,
seat pricing $49-99/mo (undercuts Landchecker $75 and DSR $180-270), usage
metering via the Phase 2 Worker. Needs: reliability SLAs, support channel,
the trust layer. Do not start before 3-5 organic pilot conversations.

---

## 11. Cost model

| Item | Monthly | One-off |
|------|---------|---------|
| Domain | ~$2-4 (AU$20-50/yr) | - |
| Cloudflare Pages + Workers + KV/D1/R2 | $0-5 (1k MAU) -> $30-80 (10k) | - |
| Basemap (OpenFreeMap / self-host PMTiles) | $0-1 | - |
| Valhalla + Photon VPS (D4) | AUD $15-30 | - |
| Analytics (D5) | $0-9 | - |
| Email tool | $0-15 | - |
| Stripe | 1.7-3.5% + 30c per txn | - |
| Entity + ASIC fees (D2) | - | ~$500-1k + ~$310/yr |
| Lawyer (D9) | - | AU$2-5k |
| PI + cyber insurance (D10) | - | AU$1-2k/yr |

Total run-rate at launch: roughly **AUD $50-120/month** + ~AU$4-8k one-off
year-1 fixed costs. Break-even on run-rate: ~2-3 reports/month.

---

## 12. Risk register (top 8)

1. **2026-07-02 refresh deletes volunteerPct** - P0-1. Highest-certainty risk
   in this document; it WILL happen if unaddressed.
2. **Charging while on non-commercial infra** (Pages/CARTO/FOSSGIS/Nominatim)
   - takedown/blacklist risk exactly when paying customers exist. Phase 2
   gate exists for this.
3. **A wrong "all clear" hazard finding relied on for a purchase** (ACL s18 /
   negligence) - mitigations: P1-2 inline vintages, lawyer-reviewed wording,
   D10 insurance, the no-forecast rule.
4. **Public repo forked + redeployed** the week pricing launches - D3.
5. **Free-forever promise contradiction** at paid launch - P2-5 one-release
   money-story rewrite; the chosen paid wedge (artifact/precision/sync) fits
   the promise as written.
6. **OSM building sparsity makes sun look broken** in exactly the suburbs
   buyers shop (incl. parts of Melbourne today) - P3-6 density gating +
   honest low-coverage messaging.
7. **Pipeline silently stales or breaks as upstream portals move** (50 live
   upstreams, raw never archived) - P3-3.
8. **Scope creep toward investor analytics** (scores, rankings, growth) -
   strategy lock section 1; the wedge is the report, the moat is honesty.

---

## 13. Sequencing at a glance

```
Week 1      P0-1..9 (stop the bleeding)            OWNER: D1 domain, D2 ABN,
                                                   D9 lawyer kickoff, D5 pick
Weeks 2-5   P1 (sellable core)                     OWNER: D3, D10, Stripe acct
Weeks 4-8   P2 (rails; overlaps P1 tail)           lawyer docs return; entity live
Weeks 6-10  P3 (own the data; overlaps P2)
Gate        Stripe ON when P2 gate satisfied  ->  first revenue
Weeks 10-16 P4.1 registry refactor + Canberra pilot
Weeks 16-24 P4.3 Sydney flagship launch (+ P4.4 national free tier when cheap)
Year 2      Brisbane onward; Phase 5 B2B
```

Single most important ordering rule: **bake/own the data and decompose the
monoliths BEFORE the registry refactor; do the registry refactor BEFORE any
second city.** Every shortcut around that order multiplies Melbourne's
hardcoded assumptions into N cities.

---

## 14. External tech evaluations (2026-06-10) - do not re-litigate

Three repos evaluated on request. Verdict: integrate NONE as dependencies;
three ideas adopted into existing tasks.

| Repo | Verdict | What we take |
|------|---------|--------------|
| c2g-dev/city2graph (BSD-3, Python graph/GNN lib) | SKIP - researcher tool, no buyer value; GNN = scope creep | The "severance" finding idea ONLY: walk-distance vs euclidean ratio from existing Valhalla stack ("400m away, 1.4km to walk - cut off by the freeway"). Add as a report finding in P1-5-adjacent work. No new dependency |
| opengeos/GeoLibre (MIT, Tauri GIS app) | SKIP - full GIS workbench contradicts plain-English UX thesis; DuckDB-WASM ~40MB kills mobile payload | Its cloud-native-format architecture: implement P1-7c / P3-2 as **FlatGeobuf or PMTiles with HTTP range requests** for pois/traffic/noise/school-zones (fetch only the pin bbox, KB not MB). Aligns with the Protomaps swap (P2-2) |
| shlokkhemani/ode-to-yosemite (NO LICENSE, 1-commit 3D terrain demo) | CANNOT reuse code (default copyright); Esri imagery part is ToS-restricted - avoid | Data-source idea only: **AWS Open Data terrain tiles (Mapzen terrarium, free, keyless)** for terrain-aware sun - flat-ground shadows miss hills (matters for Dandenongs now; Adelaide Hills, Hobart later). Extend P3-6 with a terrain-elevation spike (M-L; depends on SunShadowView shadow impl). Plus the marketing moment: "your backyard, winter solstice 3pm" share card |

Rule reaffirmed (risk #8): uniqueness = the honest synthesized report, not
tech novelty. New tech enters only where it feeds report speed, report truth,
or report shareability.

---

## 15. Second-pass deltas (2026-06-10) + standing guards

Final mastermind pass against everything read (review, competitors, repos).
Changes already applied above: D1 national-domain requirement + trademark
screen; P2-4 no-accounts launch simplification; ADD rows 11-15; expanded
do-not-build + parked list.

**Marketing frames (free, use in P2-5 copy + content):**
- "What the Section 32 won't tell you" - the report as companion to the
  vendor's statement every VIC buyer already receives. Sharper than the
  VicPlan-PPR comparison; meets the buyer at the exact document moment.
- "Pre-auction check" - Melbourne is an auction market; the pay moment is
  the week before auction. Same-day/instant turnaround is the implicit edge
  over ordering anything from a professional.
- Sun share-card: "your backyard, winter solstice 3pm" (section 14).

**Standing guards (write once, enforce in review):**
1. No new scored domains. Scores are commodity (Microburbs/DSR own that
   fight); every new dataset enters as a context lens or report finding.
2. No LLM-generated prose in reports. Deterministic, sourced sentences are
   the trust asset and the s18 defence; generated text would be the fastest
   way to lose both.
3. No UGC, ever (defamation + moderation).
4. Licence check BEFORE build for every new lens (the PlanningAlerts case:
   high-value idea, dead at $3,850/mo - found in one fetch, would have been
   found after a week of build otherwise).

---

## 16. Competitor attack surface (2026-06-10, 22-agent verified strike)

What incumbents verifiably do poorly, with the asset that beats them. All
evidence adversarially checked; corrections noted. Marketing and product copy
should draw from this section.

**16.1 The structural wedge: the pre-offer vacuum.** Every incumbent in the
due-diligence wallet fires AFTER commitment: B&P inspections (~$400-800,
per-attempt, repeated across lost auctions - VIC auctions have no cooling-off,
Sale of Land Act 1962 s31), conveyancer searches ($300-500 disbursements,
post-contract), Section 32s released days before auction (verified Whirlpool:
"section 32 still missing 3.5 days from auction"). Consumer Affairs Victoria
MANDATES a pre-offer due-diligence checklist (flood, bushfire, heritage,
overlays) - then hands buyers a list of links. Nobody productised the
mandated moment. Our pin report IS the CAV checklist automated; map report
sections to checklist items explicitly (SEO + trust). Tagline frame: "do this
while waiting for the Section 32".

**16.2 Portals: structural conflict of interest.** REA earns A$1.67bn/yr from
agent/vendor advertising - suburb pages contain zero hazard, overlay, crime
or disadvantage content (verified via Wayback full-page capture). Domain's
new hazard flags (verified live) appear ONLY on off-market property-profile
pages, binary Detected/Not-detected, supplied by a commercial partner and
disclaimed. The Victorian Ombudsman documented buyers who bought flood-prone
homes because official information "indicated a 'flood free' status".
Positioning line to use: "we make money from you, not from agents". Never
fight them on listings, sold prices, or reach.

**16.3 Landchecker: aggregation without interpretation.** Verbatim from their
homeowner page: "Landchecker pulls together all the important data so that
you don't have to" - consolidation, not explanation; raw DDO4/SBO/HO123 codes
with no risk framing; land area/easements/sales paywalled; 15-report/month
quota then $24.90/report; no sun/ANEF/heat/canopy/isochrones; flood history
is a paid ICEYE upsell. We win on synthesis + plain English + one-off price.
CORRECTION (refuted claim): Landchecker HAS covered the ACT since Dec 2023
via ACTmapi - the "Canberra has no competitor" premise is dead; Canberra's
rationale is machinery-pilot only, and the differentiation there is report
depth, not coverage absence.

**16.4 Cotality/RP Data: empty consumer reports + burned trust.** RP Data
scores 1.3/5 on ProductReview (97% negative: lock-in traps, 90-day notice
clauses, data errors with no provenance). The bank-branded consumer report
(ANZ sample PDF verified) contains an AVM with a $280k spread, comparables
and demographics - ZERO flood/bushfire/overlay/noise/heat/sun/catchment/crime
content, and the consumer price floor is $0 (free via banks). Our $39 sells
exactly what their report omits. Never compete on sales history/AVM (their
98%-coverage moat; VIC bulk sales data is licensed).

**16.5 Investor tools: black-box subscriptions for a one-shot decision.**
PropertyChat evidence: scores contradict ground truth ("selling 10-15% over
guides... scored low-60s balanced"), users cancel after trials, the DSR
founder concedes scores are shortlisting-only while marketing says
"predictor of capital growth". $77-443/mo for a once-in-7-years purchase.
Verified current pricing: Microburbs $0/77/135/320 (Basic = 2 suburb + 5
property reports/mo), DSR $180/$270, SuburbsFinder $119/$199. Our inverse:
"we don't predict; we document" + per-finding provenance + $39 one-off.

**16.6 NestCheck: the near-direct competitor (NEW - take seriously).**
nestcheck.com.au: free + $29.99 premium PDF for any VIC address, same
open-data stack (Vicmap/CFA/VCSA/ACECQA/OSM), shipped ACECQA childcare
ratings before us, VIC-wide vs our Melbourne-only. Verified weaknesses: fake
testimonials (i.pravatar.cc placeholder avatars, confirmed in live HTML),
footer claims "NestCheck Pty Ltd" while the ABN is a sole trader (registered
27 Jan 2026, not GST-registered), paywalls free government data (crime,
hazard scores), "Deli Aisle 1.19km" listed as a Walking Trail (raw unfiltered
OSM), straight-line distances only, schools by proximity not catchment,
opaque arbitrary-weight risk scores (bushfire 35%/flood 35%/storm 30%), no
methodology page, no provenance, 2021 Census medians presented as current
rent context, no map/interactivity, no ANEF/heat/canopy/sun/SEIFA.
Response: (1) it VALIDATES the one-off pin-report market and the $29-39
price band; (2) ship our ACECQA + VG price/rent cards (ADDs #4, #11) to
erase their two leads; (3) market the contrast explicitly - side-by-side
report quality, school ZONES vs proximity, isochrones vs crow-flies,
methodology page vs none; (4) watch their claimed 2026 NSW/QLD expansion;
(5) their fabricated-trust signals are a standing reminder of why our
provenance layer must stay visible and verifiable.

**16.7 Adjacent $39 neighbour: BuySecure** (lawlab-owned AI contract review,
exactly $39, document-only - no spatial/hazard content). Complementary, not
rival: "their $39 reads the contract; ours reads the location". Potential
bundle conversation with lawlab once revenue exists.

---

## 17. Ultracode re-sequencing (2026-06-10) - supersedes section 13 where they conflict

The 4-lens audit's verdict: the engineering order was right, the money layer
had four MUST-fix incoherences (all now fixed in sections 1, 7: SKU renamed,
free/paid boundary resolved to facts-free/artifact-paid, snapshot delivery
respecced, parcel-confirmation added), and the serialized 24-week timeline
was a slow-builder artifact. With a fast builder the OWNER/legal track is the
critical path; fill it.

**Week 1 (parallel):**
- P0-1..P0-10 (incl. the pulled-forward print button).
- OWNER: D1 domain purchase, D2 ABN, D9 lawyer kickoff, D10 insurance quotes,
  Stripe account, D5 analytics pick.
- MOVED UP: hosting move to Cloudflare Pages + custom domain (was P2-1) -
  config-level for a capable builder; the domain-age/SEO clock and all 301
  equity start only when this ships.
- SPIKES (each <=1 day, they reshape estimates): (a) PDF capture of WebGL
  maps (preserveDrawingBuffer vs idle-readback) + PDF lib choice for P1-4;
  (b) FlatGeobuf-vs-baked-z-tiles bench at a pin (request count, p95, CORS
  Range preflight behaviour - must stay same-origin) for P1-7c; (c) Valhalla/
  geocoder sizing per respecced D4; (d) Vicmap ArcGIS browser-CORS check for
  P1-5.

**Legal window (weeks 2-9, build runs parallel, ~5 solo-weeks of P1):**
- P1 sellable core (with the section-6 respecs; P1 honestly sums to ~24-25
  working days, not "weeks 2-5").
- P2 infra (basemap, routing, Worker) + P3-1/P3-2 bake/storage work.
- P4.1 region registry built with TWO regions from day one - Melbourne plus
  Canberra as the registry's acceptance fixture (no separate pilot phase;
  ship Canberra unannounced whenever it passes its per-city gates).
- P4.4 national SA2 free tier pulled forward: live weeks before paid launch
  so indexation begins (worthless on github.io - hence the week-1 domain
  move). The SEO value is per-suburb pages + X-vs-Y compare pages, not the
  choropleth.
- Sydney NSW modules (BOCSAR, ePlanning, SIX cadastre, TfNSW key) STARTED in
  this window. Sydney is a launch-day TARGET, never a GATE: if NSW source
  re-verification or honesty-layer QA is unfinished when legal clears,
  launch Melbourne paid on schedule; Sydney follows within weeks.

**Gate (legal-bound, realistically week 9-10):** Stripe ON when the section-7
gate (incl. the parcel hard-fail condition) is satisfied. Build speed does
not move this gate; that is the point of filling the window.

**Added risk (dual-city):** two cities doubles the honesty-layer QA surface;
a wrong "all clear" hazard finding in an under-QA'd Sydney at launch is the
s18/brand kill-shot. Mitigation: per-city data:verify + e2e + honest
"unavailable" findings are PER-CITY launch gates, and Melbourne-decoupled
launch is the release valve.

**Revenue re-anchor (skeptic):** the year-1 "base $40-90k" silently assumed
2-4x the plan's own 500-report success criterion. Corrected: Melbourne-only
base = ~$15-25k (500 reports at blended ~$30-35 post-promo); the $40-90k
band requires the dual-city launch plus the SEO tier compounding - keep it,
but as the dual-city base, not the Melbourne base. Conservative unchanged.

**Marketing additions:** teaser rows speak the buyer's dread, not the
feature ("Is THIS property in the flood overlay, or just the area? -
answered in the $39 snapshot"); free DA fallback NOW - a per-council "check
current development applications" deep-link verify-action row in every
report (no licence needed, keeps the parked PlanningAlerts question warm);
NSW twin frame ready for Sydney: "what the s10.7 planning certificate won't
tell you"; per-city document-moment frame added to the section-9 checklist
template. ADD: a report-level shortlist view - side-by-side comparison of
saved pin checks (reuses the compare engine) - this is the 3-pack's reason
to exist beyond a discount.

## 19. LAUNCH DIRECTIVE 2026-06-20 (owner, 2026-06-11) - supersedes prior sequencing

**Hard date: launch 2026-06-20 covering ALL greater capital regions** (Sydney,
Brisbane, Adelaide, Perth, Hobart, Darwin, Canberra + Melbourne). Then regional
cities (Geelong, Bendigo, Ballarat, Gold Coast, Townsville, Alice Springs and
similar booming markets), then all of Australia. Work runs continuously with
parallel adversarial review until delivered.

**9-day scope reality (cutline):** every capital launches with the national-
data tier (SA2 choropleth, profiles, compare, scores from ABS/OSM/ACARA/
ACECQA/GA national layers) + honest "not yet available in CITY" pin lenses;
Melbourne keeps full pin-report depth; per-state Tier-B lenses land per city
in priority order as agent-hours allow (Sydney first). REGION-ROLLOUT.md
(being generated) carries the per-city work table.

**Workstreams:**
1. Region registry + national bake loop (RUNNING - critical path).
2. Onboarding rebuild: tailored buyer vs AGENT experience - agent mode
   RETURNS with a real workflow (owner reversal of the earlier removal):
   agents hold sub-profiles per client, tracked locally until accounts.
   Tagline on onboarding: "Festra - a window towards your new home" (offer
   the owner "a window onto your new home" as a grammar alternative).
   Onboarding animation concept: click the map -> camera glides to the pin
   -> data layers fade in translucently behind the copy.
3. Mobile launch gate: iPhone-class pass (iPhone 17 as reference device;
   test with the closest Playwright descriptor + 393pt viewport).
4. Floating pin panel (desktop): detach the right sidebar into a shorter
   floating panel anchored near the pin - MOCK FIRST, owner approves, then
   build (mobile keeps the sheet).
5. Design variant D for owner approval BEFORE any token flip: cream/off-white
   surfaces + stronger/deeper blue accent, "It Takes a Village" illustrated
   warmth as reference, logo concept "F formed from clustered map pins".
   HONESTY NOTE recorded: cream was banned by the owner's own anti-slop
   research (AI-default surface + Landchecker-adjacent); the owner may
   override with eyes open - the variant mockup is how they decide.
6. Admin/owner page: interim = Stripe Dashboard (payments) + analytics
   dashboard (traffic) once D5 lands; a custom owner console (subscribers,
   revenue, usage) ships with the P2-4 Worker backend - speccing it there.
7. Social + distribution (OWNER creates accounts; agent preps): handle
   availability checklist, bios, banner/logo assets, first-week content
   calendar (Twitter/X + Instagram); distribution experiment: one-week free
   trial outreach to property managers/buyer agents - outreach list +
   email template prepped as docs; trial mechanics need P2-4 payments.
8. New data candidate: properties owned per household / investor ownership
   share - ATO individuals' rental-property statistics (postcode level,
   crosswalk to SA2) is the open path; verify licence + vintage.
9. Festra for Gov (council/city/state benchmarking) - FUTURE, parked;
   the monthly discovery machinery (P3-7) is the foundation when ready.

---

**Demoted:** terrain-aware sun + solstice share card (section 14) drops
below all Phase 1-2 work - sun is commodity (review 3.7); density gating +
honest low-coverage copy suffices at launch. The buyer-lens verdict: terrain
shadows change no purchase decision; the wrong-lot risk did.

---

## 18. Owner product review (2026-06-11) - directives and roadmap deltas

Quick fixes + investigations executed same-day (right-panel citation strip,
two-reports naming, compare GM column + uniform rates, /places restructure,
politics removal, shadow-sim image removal, reachability ocean/legend,
amenity truth audit). Standing directives recorded:

1. **The right-side panel is a GLIMPSE** - no citations, no dates, no
   caveats there, ever. Provenance lives in the full pin report only. This
   supersedes the earlier per-finding-provenance-on-screen rule for the
   compact panel (the s18 defence rides on the full report + artifact).
2. **Two-source rule:** every metric should be corroborated by a second
   source; where impossible, flag the single-source status in methodology +
   disclaimer. Fold into P3-5's licence/coverage gate (a per-source
   "corroboratedBy" field in sources.json; build fails new lenses without
   either a second source or the flagged exemption).
3. **Autonomous monthly upstream discovery (NEW P3-7):** beyond refreshing
   known sources, a monthly discovery job per region scans the relevant
   portals (DataVic/CKAN APIs, ArcGIS catalogs, agency pages from
   EXPANSION-PLAN) for NEW editions/datasets in every product context and
   files a triaged issue. The owner cannot hand-feed data updates; the
   2026-06 VCSA edition break proves the need. Design: CKAN package_search
   diffs + dataset-page hash watch + per-region source registry.
4. **Sun/shadow rework:** owner reports the 3D simulator unreliable and
   wants a ShadeMap-LIKE owned experience (2D shadow overlay on the map)
   built from our extruded-footprint data - never an external link
   (liability). Spike: 2D shadow projection rendered as a map layer
   (computed from building heights + sun azimuth/altitude), replacing the
   fragile per-pin 3D scene as the default; 3D stays optional. (Reference
   noted: amap "abot-earth" planetary 3D - aspirational, not the bar.)
5. **PWA/performance track:** service-worker caching of tiles + data
   (offline-tolerant repeat visits), per-profile persistence; evaluate
   installable PWA before any native-app thought. Extends P1-7's diet.
6. **Personalised onboarding (revisit):** a short profile-building
   onboarding feeding the report ordering (replaces the deleted decorative
   fields with WIRED ones only). Design after the design-system overhaul.
7. **Agent-seller trends:** trends an agent could use with a buyer
   (days-on-market style narratives from open data only - VG quarterly
   series, building approvals, population). Candidate Phase 1.5 lens pack.
8. **Design system overhaul (APPROVED 2026-06-11): Direction A "Surveyor".**
   Owner picked A from the three mockups (design-mockups/festra-a-*.html).
   Owner token amendments, resolved: spacing strictly 4px grid (adopted);
   icons 18px / 1.5px stroke / 24px bound (adopted - matches lucide-react);
   body 14px UI / 16px report, 18px panel titles (adopted; display ladder
   above 18 stays for landing/report H1s); ink #181818-class darkness
   (adopted); secondary gray: keep A's violet-tinted #5C5C6E over the
   proposed pure #6A6A6A for undertone coherence with surfaces (taste call,
   owner may override); radius: rectangles capped at 16px per anti-slop
   rule, full-pill reserved for pills/search - the proposed 40px ceiling
   applies ONLY to pills, never cards; typeface: owner floated Geist -
   REJECTED per the spec's own anti-slop ban (Geist is the most
   AI-coded-product-default face of 2025-26; Inter stays for UI, General
   Sans/PP Neue Montreal for display, IBM Plex Mono for data). Rollout:
   tokens-first (globals.css vars + tailwind.config swap + motion tokens),
   then component-level polish, AFTER the owner-UX batch merges (file
   conflict avoidance).
9. **Permits lens (NEW ADD, licence-verified):** VBA Building Permit
   Activity data (DataVic Access Policy, monthly CSV/XLSX, street-level,
   permit class + cost of works, 2014-) powers two buyer findings:
   (a) "Recent building permits nearby" (construction pipeline, pool
   installs, secondary dwellings - monthly bake fits the existing cron);
   (b) "What the rules allow here" card: granny-flat / small-second-home
   eligibility SIGNALS (VIC <60m2 permit-exempt pathway + zone + lot size
   from the existing parcel lens) and the pool-barrier rule note - framed
   strictly as rules-that-apply, never "you can build" (advice boundary).
   The tweet-style contractor lead-gen mailer business is OUT of scope
   (scope-creep guard); its measure->skill->action pattern is noted as the
   Phase 5 B2B white-label shape. GeoLibre re-evaluated for 3D sun: still
   NO (standalone Tauri GIS app, not a lib; its 3D = deck.gl Tile3DLayer
   over photorealistic mesh tiles, which for Melbourne means Google 3D
   Tiles = banned GMP ToS + cost); the owned 2D shadow overlay (item 4)
   remains the path.
