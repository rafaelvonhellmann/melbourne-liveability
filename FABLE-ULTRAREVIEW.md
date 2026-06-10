# FABLE ULTRAREVIEW - liveable.melbourne / Buyer Check

Full-project assessment at HEAD `abfdeaf` (2026-06-10). Produced by a 36-agent
review workflow (9 parallel dimensions, each top claim adversarially verified
against primary sources - licence pages, statutes, vendor pricing, Overpass
measurements, the live deployed bundle). Pairs with `FABLE-ULTRAPLAN.md` (the
build plan derived from this review). Scope goes beyond `CODEX-ULTRAREVIEW.md`
(2026-06-03, report-UX focused): legal, data licensing, market/pricing,
architecture, security, expansion verification, and capability strategy.

**Method note:** every P0 below and every load-bearing market/legal/licensing
fact was independently re-verified by an adversarial checker agent told to
refute it. Verdicts and corrections are quoted where they matter. None of this
is legal advice; items marked "lawyer" need professional review.

---

## 1. Executive verdict

**The product thesis is validated. The commercial wrapper does not exist yet.**

This is a genuinely good free product with a real, verified market gap: nobody
in Australia sells an owner-occupier, plain-English, pin-level due-diligence
report (Microburbs/DSR/HtAG serve investors at $77-320/mo; Landchecker gives
raw overlays away free; VicPlan gives free official PDFs; nobody synthesizes
"check these three things before you offer" at a pin). The honesty layer
(provenance, confidence, known-gaps) is both the legal defence and the brand.

But every surface a customer would touch money through is either absent or
sitting on infrastructure whose terms prohibit commercial use:

- Hosting (GitHub Pages), basemap (CARTO), routing (FOSSGIS Valhalla), and
  geocoding (Nominatim) all have ToS that disallow or restrict a paid product.
  All four are confirmed against primary sources. All four are swappable for
  $0-100/month total.
- There is no legal entity, no ABN, no lawyer-reviewed terms (the live Terms
  and Privacy pages carry visible "Draft" banners), no refund policy, no
  insurance, no payment rail, no sellable artifact (the "PDF" is Ctrl+P).
- The richest version of the buyer report - the thing a buyer would pay for -
  **never renders for a real pin** (verified against the live bundle: live
  pins get the compact variant; verify-actions, caveats, per-finding
  provenance and sources render only on the static sample and /places embeds).

**Scorecard (10 = ready for paid launch):**

| Dimension          | Score | One-line verdict |
|--------------------|:-----:|------------------|
| Code quality + security | 7.0 | Near-exemplary hygiene; public repo with no LICENSE; xlsx CVEs; 192MB data in git |
| Frontend engineering    | 6.5 | Paid-grade race/cleanup discipline; payload weight is the gap (11MB first pin, 7MB sun load) |
| UX / product surface    | 6.0 | Most Codex P0/P1s genuinely fixed; conversion surfaces broken (alerts dead, pricing orphaned, full report unreachable) |
| Expansion readiness     | 6.0 | EXPANSION-PLAN verified mostly TRUE, but its sun chapter is stale; 0% of the refactor implemented |
| Product capabilities    | 6.0 | Browser tier over-served, buyer tier under-served; the pay-moment features are missing |
| Backend / architecture  | 4.5 | Static discipline strong; paid path 0% built; one live data-loss timebomb (see 3.1) |
| Legal (AU)              | 4.0 | Foundations unusually good; entity/terms/refunds/insurance all missing; advice boundary is safe |
| Data licensing          | 4.0 | The DATA is clean (CC BY / ODbL, commercial OK); the free INFRASTRUCTURE is the blocker |
| Market / pricing        | 4.0 | Real wedge, crowded adjacencies, zero rails; github.io domain is wasting every week of SEO |

Overall: **5.3/10 as a business, 7/10 as an engineering artifact.** The
pattern across all nine dimensions is identical: engineering is ahead of
commercialization by roughly two phases.

---

## 2. The five cross-cutting themes

### 2.1 The wedge is real and it is narrow: the report artifact, not the data

Verified market structure: investor analytics is crowded (Microburbs relaunched,
alive, $77/$135/$320 per month; DSR $180-270/mo; CoreLogic consumer $219/mo),
raw overlay access is a free commodity (Landchecker free tier, confirmed live
2026-06-10, shows national planning zones + overlays), prices are a free
commodity (bank CoreLogic reports, Domain/REA profiles), and the government
itself issues free per-address planning reports (VicPlan PPR).

What does not exist anywhere: a $20-50 one-off, plain-English, provenance-rich
"before you offer, check these" report at an exact pin, for owner-occupiers.
Buyers already spend $400-700 on building inspections and $700-1500 on
conveyancing per purchase; a pre-offer check slots into existing spend.

Consequence: never paywall raw data or overlay display (also required by ODbL
share-alike and the published pricing-page promise). Sell the synthesized,
frozen, dated artifact. Cede investor suburb-picking entirely.

### 2.2 Four ToS blockers stand between today and the first dollar

All four confirmed against primary sources by independent verifier agents:

1. **GitHub Pages** - Terms prohibit sites "primarily directed at facilitating
   commercial transactions or providing SaaS". Donations OK; charging is not.
   Also 1GB site cap (repo already ships ~183MB of data) and 100GB/mo soft
   bandwidth.
2. **CARTO basemaps** - hosted positron tiles are Enterprise-only for
   commercial use. Nuance: the Positron *style* is BSD-3; the same look works
   on OpenFreeMap/Protomaps free.
3. **FOSSGIS Valhalla** (valhalla1.openstreetmap.de) - commercial use allowed
   only if "not a substantial part of an online offering"; 1 req/s; no
   availability guarantee. Reachability/drive/walk are flagship report
   features, i.e. substantial.
4. **Nominatim** - 1 req/s, autocomplete banned, access revocable; policy
   explicitly warns commercial apps serving paying customers. Worse: the
   SearchBox auto-geocodes 1.2s after typing pauses, which contradicts
   geocode.ts's own "submit-only" claim and edges toward the banned pattern.

Replacement cost: roughly $0-100/month total (Cloudflare Pages free +
OpenFreeMap/Protomaps free + one AUD $15-30/mo VPS running Valhalla+Photon, or
paid ORS/LocationIQ/Stadia). Every endpoint is already env-overridable, so
these are config swaps, not rewrites.

### 2.3 One live timebomb and three quiet product-trust leaks

- **Data-loss timebomb (verified to file:line):** `apply-civic.ts` runs outside
  the build chain. The monthly refresh cron (next: 2026-07-02) reruns
  normalize+score, which rebuilds `ctx.community` WITHOUT `volunteerPct`
  (currently on 359/361 places), then auto-commits and deploys the loss. No
  gate catches it. Same fragility class for every other apply-* step.
- **Alerts page is dead on prod** (verified against the live bundle): no
  Formspree env in the deploy, so user emails fall into the visitor's own
  localStorage and the UI shows raw env-var instructions. Even configured,
  no send pipeline exists. A visible broken promise on a trust-positioned
  product - and a Spam Act gap once mails ever flow.
- **Feedback + analytics also unconfigured:** Plausible domain and Formspree
  feedback ID unset in deploy. The owner is making keep/remove/pricing
  decisions with zero usage data, and the cheapest research channel is dark.
- **Full report unreachable for real pins** (2.1's artifact, verified):
  `variant="live"` hides verifyAction, caveats, per-finding provenance,
  sources, and snapshot. The product's core promise renders only for the
  static Brunswick East sample.

### 2.4 Payload weight is the gap between "works on desktop" and "feels premium on a phone"

Measured, not estimated: first pin drop fetches and main-thread-parses
~10.6MiB of JSON (pois.geojson 7.5MiB + 9 more files) before the report
renders. The sun view's worst 9-tile load is 7.1MiB raw; the largest baked
tile is 1.57MB - HANDOVER's "~450KB dense tile" is understated ~3.5x.
places.json (1.9MB) ships on every map open. Buyers use phones at open
houses; this is the paid product's first impression. Fixes are known and
cheap relative to value: radius-filter the sun load (~300m), bake spatial
indexes for the big four report inputs, split a slim search index, parse in
a worker.

### 2.5 Expansion: the plan is good, its sun chapter is stale, and the order should change

The riskiest EXPANSION-PLAN claims verified TRUE (SA cadastre $250+ ex GST
minimum and "not open data"; WA cadastre paid/personal-use-only free tier; WA
school zones PDF-only; QLD bulk crime LGA-only; BOCSAR suburb-level open CC BY
4.0; NSW ePlanning ArcGIS open). But:

- **The Tier-C "building heights" framing is obsolete.** The repo already
  pivoted sun to baked OSM tiles with estimated heights (height tag, else
  levels x 3.2m, else 6m). Sun portability is now an OSM-density question
  per TILE, not a Geoscape-licence question per CITY. Measured densities
  show suburb-level patchiness everywhere including Melbourne (Glenroy
  15/km2, Reservoir 87 vs Glen Waverley 783); Sydney is ~1.9x sparser
  overall (343k vs 635k buildings for ~equal dwellings) with western Sydney
  near-empty, but inner/middle Sydney is fine; Canberra is near-complete
  (ACT import) - the plan's "Canberra sun limited" is wrong, it works.
  Geoscape demotes from launch-gate to optional quality upgrade; Microsoft
  AustraliaBuildingFootprints (ODbL, 11.3M polygons, ~2018 vintage) is a
  licence-compatible flat-height infill.
- **Crime comparison correction:** Melbourne already ships suburb-level crime
  (VCSA Table 03 crosswalked); BOCSAR's edge for Sydney is monthly temporal
  granularity, not spatial.
- **Order revision:** Sydney-first is right for revenue, wrong for debugging
  the region machinery. Pilot the refactor on Canberra (one jurisdiction, no
  councils, everything on ACTmapi, open cadastre, spatial school PEAs,
  working sun, tiny blast radius), then launch Sydney as the flagship.
- **A national SA2-only free tier** (all 8 capitals, choropleth + profiles,
  no pin lenses) is achievable from the national Tier-A data alone and is
  the natural SEO/waitlist funnel. Census 2026 (night 11 Aug 2026; releases
  mid-2027, SEIFA early 2028) is a known refresh wave to schedule.

---

## 3. Dimension summaries

### 3.1 Backend / architecture - 4.5/10

Strong: 52-source sha256 manifest discipline, verify gate inside a fully gated
deploy, consistent timeoutSignal+omit-card pattern on all live lenses, env
seams everywhere. Weak: the paid path is 0% built; four ToS blockers (2.2);
the apply-* timebomb (2.3); no refresh failure alerting or coverage-diff guard;
data/raw never archived (50 live upstreams, portals move); e2e never tests the
deployed artifact (runs `next dev` at root, prod is static export under
/melbourne-liveability); 8 live runtime hosts thin paid reports silently when
down. Recommended target (priced): Cloudflare Pages + one Worker (magic-link
auth, Stripe Checkout + webhook to D1 entitlements, KV-cached proxy for
routing/geocode/ArcGIS) - ~USD $5-10/mo at 1k MAU, $30-80 at 10k, plus the
AUD $15-30/mo routing VPS if self-hosting.

### 3.2 Frontend engineering - 6.5/10

Genuinely strong: init-once map with full cleanup, AbortController hygiene in
every auto-fetch card, identity-token + sequence-counter race guards, both
error boundaries, validated URL state, disciplined lazy loading. Gaps: payload
(2.4); zero React component tests (all 348 vitest tests are lib-level; the
count overstates UI safety); e2e is one desktop smoke file; mobile is a
desktop-first retrofit (everything funnels into an always-open 52vh sheet; the
buyer report scrolls inside it; MapTip is desktop-only); up to 3 live WebGL
contexts per page and the sun view rebuilds map + refetches 9 tiles on every
pin move; @turf/turf metapackage imported in client code for 3 functions;
localStorage prefs version written but never read (no migration switch);
stacked `once("idle")` listeners can paint stale layer state. MelbourneMap.tsx
(884 lines) and app/(map)/page.tsx (1480 lines) need decomposition before
multi-city multiplies them.

### 3.3 UX / product surface - 6/10

The 2026-06-09 session genuinely fixed most Codex P0/P1s: ranked "Before you
offer" block, heritage now/not-yet split, accent contrast, sub-path share
links, em-dash purge (mostly), straight-to-map onboarding. Still open from
Codex: per-finding freshness dates, decorative profile fields (collects
schools/safety/walkability importance; evaluateFit ignores them), thin agent
mode, card-in-card report nesting, SearchBox listbox ARIA, sub-44px targets.
New findings: alerts/pricing/full-report issues (2.3); landing promises a
"Print / save PDF" step that has no button (print CSS exists, no
window.print call anywhere); /find is buried; /about absent from map nav;
BottomSheet.tsx is dead code; jargon leaks ("this SA2", bare "GM", "pct");
caveat fatigue (6+ "not advice" repeats per profile page). Mobile is the
weakest surface and is where buyers actually are.

### 3.4 Legal (AU) - 4/10

Safe ground (verified): no AFSL needed (real property is not a financial
product, Corporations Act s763A; property-investment advice is famously
unregulated - Senate report cited); no VIC estate-agent licence (publishing
data is not acting "on behalf of" transaction parties, Estate Agents Act 1980
s4). Privacy Act small-business exemption (<$3M turnover) still stands as of
June 2026; tranche-2 removal is agreed-in-principle, no bill yet.

Gaps before charging: no entity/ABN anywhere; Terms+Privacy ship with literal
"Draft - not yet legal advice" banners; the liability clause caps remedy at
resupply, which ACL s64A likely voids for a consumer home-buyer report
(personal/domestic/household kind) - damages then bounded only by
foreseeability, not contract; no refund/cancellation terms (consumer
guarantees cannot be excluded; "no refunds" statements are themselves
unlawful; GST-inclusive pricing display required); privacy policy claims APP
consistency but omits operator identity and the US disclosure for Formspree;
alerts flow lacks Spam Act sender-ID/unsubscribe; DDA/WCAG exposure rises on
commercial launch (AHRC April 2025 guidelines adopt WCAG 2.2 AA); no PI/cyber
insurance (the only real backstop given uncappable consumer guarantees).
S18 staleness exposure is best mitigated in-product: inline "as at DATE" on
every hazard finding, especially negative ones. One fixed-fee lawyer pass
(~AU$2-5k) plus entity+insurance clears most of this; none of it blocks
building.

### 3.5 Data licensing - 4/10

The data layer is clean for commercial use: ABS/DataVic/Vicmap/DTP GTFS/CSA/
EPA/AEC-results/school-zones are CC BY (attribution required), OSM is ODbL
(commercial OK; share-alike + attribution required). The blockers are infra
ToS (2.2). Specific fixes: baked OSM building tiles and OSM-derived JSONs need
data-level ODbL attribution (a NOTICE/DATA-LICENCE file + manifest fields);
ODbL share-alike permanently constrains paywalling OSM-derived data (the
"charge for tooling, never data" positioning is both stated and required -
formalize it); BoM solar entry's "CC BY (BoM)" claim is unverified and BoM
default terms ban commercial supply (verify the exact product page or swap
source); Melbourne Water HWS may carry a "no materials for sale" wrapper
(check item licence or seek consent); the planned AEC boundary pin-lookup
would use a personal-use licence - use Geoscape Administrative Boundaries
(CC BY 4.0) instead when wiring it; CSA licence string in sources.json is
3.0 AU not 4.0; attribution page should enumerate every licensor and be
linked from map attribution + footer. Add a CI licence gate (extend
sources.json with attributionShown).

### 3.6 Code quality + security - 7/10

Near-exemplary: strict TS, zero TODO/FIXME, 5 justified eslint-disables,
deliberate XSS hardening (escapeHtml + javascript:-URI blocking), no secrets,
proper ignores, scoped workflow permissions. Strategic gaps: the repo is
PUBLIC with no LICENSE while the entire product is client-side static code +
open JSON - fully forkable, un-gateable, and "no licence" asserts nothing
(decide private+backend vs open-core BEFORE payments); xlsx 0.18.5 carries two
high CVEs unfixable via npm (registry frozen; fix = SheetJS CDN tarball
0.20.3+ or exceljs) inside a CI pipeline holding contents:write; vitest
critical advisory has an `npm audit fix`; 192MB of generated data in git
(172MB tiles) with monotonic growth (13 pois.geojson blobs = 80MB of history
in 11 days, from dev commits); lib/buyer-report.ts is a 1560-line monolith;
scoring tests are mutation-weak (a wrong-weights mutant passes; rankPlaces
ordering untested); all 81 pipeline scripts are excluded from typecheck (5
latent errors exist today); build-only libs sit in dependencies; adm-zip AND
unzipper both present.

### 3.7 Market / pricing - 4/10

See 2.1 for structure. Numbers (verified): Landchecker free/=$75/$200-240 per
user/mo ex GST; Microburbs $0/$77/$135/$320 per mo; DSR $180-270/mo; CoreLogic
consumer $219/mo; Suburbtrends one-offs $9.95-40. Transactions: 565,073
national dwelling transfers CY2025 (ABS, verified from Table 2), VIC 151-159k
(27-28%), Greater Melbourne roughly 100k/yr. Sun capability is commodity
(ShadeMap free, Shadowmap Pro ~$10/mo) - the moat is integration into the
report, market it that way. Missing prices are not fatal: VG Victoria suburb
medians + Homes Victoria rents are CC BY 4.0 on DataVic - bake them as
context-only cards, never compete on AVMs. Year-1 revenue is validation, not
income: conservative $5-15k / base $40-90k / optimistic $150-300k. Asset value
today: $15-50k (pre-revenue, public repo, all-open data, replicable UI; the
pipeline + verified expansion research is the real IP). With 12 months of
execution (domain, Stripe, snapshots, Sydney, programmatic SEO): plausibly
$150-400k (2-4x ARR multiples). Recommendation: do not sell now.

### 3.8 Expansion - 6/10

See 2.5. Revised order: Canberra (machinery pilot, quiet) -> Sydney (flagship
launch) -> Brisbane (accept LGA crime caveat; investigate QPS OCM licence) ->
Adelaide/Perth (coin flip; Perth loses school zones AND lot-size) -> Hobart ->
Darwin. Accept per-city feature asymmetry with the existing honest
"unavailable" machinery rather than buying SA/WA data pre-revenue. TfNSW GTFS
likely needs a free registered key (build-time only, acceptable; verify).
Parameterization is 0% implemented: ~248 "Melbourne" literals across 104
files; the region-registry refactor must precede city work, and the
bake-live-lenses program (HANDOVER step 1) should precede the refactor since
it converts per-state runtime API handling into build-time modules.

### 3.9 Product capabilities - 6/10

Inventory: 16 routes; 7 scored + 5 context choropleths; 19 POI categories;
~30 finding generators; 6 runtime lens cards; sun 3D; reachability +
precise-walk; compare (deep, keep); find (thin toy, keep but exclude from
paid positioning); personas/interest-views/buyer-profile (three overlapping
personalisation systems - consolidate). The keep/remove/add verdicts and
sequencing are in FABLE-ULTRAPLAN.md sections 3-4. Headline: the persona
split is already correct in code - BROWSER (free) = map/places/compare/find;
BUYER (paid) = pin report + snapshot + precision + price context - and the
published pricing-page promise supports exactly that split. School QUALITY is
licence-blocked (ACARA My School ToU cl 7.1b bans commercial use/derivatives;
verified) - say so in known-gaps copy, do not build it.

---

## 4. Corrections to existing project docs (apply these)

1. EXPANSION-PLAN.md Tier C #1 + per-city sun notes: rewrite around per-tile
   OSM density (2.5). Canberra sun WORKS; Adelaide-FBX work item is obsolete;
   Geoscape is optional, not a gate. Line 41 "Routing/Valhalla - no change"
   is wrong for a commercial product (FOSSGIS terms).
2. HANDOVER.md sun payload figures: dense tile is up to 1.57MB (not ~450KB);
   worst 9-tile pin load 7.1MiB; 2455 tiles / 164MiB. Raise radius-filtering
   from "optional polish" to pre-paid-launch.
3. EXPANSION-PLAN.md crime row: BOCSAR edge is monthly granularity, not
   suburb-vs-LGA (Melbourne headline crime is already suburb-level via VCSA
   Table 03).
4. sources.json: CSA licence string is CC BY 3.0 AU (not 4.0); AEC boundary
   "pin lookup" entry is stale/wrong-licence (use Geoscape Admin Boundaries
   when built); BoM solar licence claim unverified - confirm or swap.
5. The "348 tests" count in docs overstates coverage: all are lib-level; zero
   component tests; one e2e smoke file.

---

## 5. What is genuinely excellent (protect these)

- The honesty architecture: per-finding confidence/geography/source, context
  never folded into scores, known-gaps framing. It is simultaneously the
  product differentiation, the s18 defence, and the brand. Make it a tested
  invariant.
- Async/race engineering in the map page and buyer cards (worth extracting as
  a reusable hook, then never regressing).
- The bake-don't-call pattern (sun tiles) - it is the template for the entire
  "own your data" program and the expansion architecture.
- The data manifest + verify gate discipline; extend it (licence gate,
  coverage-diff) rather than replacing it.
- ULTRAPLAN/EXPANSION-PLAN research quality: the multi-agent research docs
  verified overwhelmingly true; this review found drift, not rot.

---

## 6. Addendum (2026-06-10, second wave): two corrections to THIS review

A follow-up 22-agent competitor strike corrected two claims above:

1. **"Nobody sells an owner-occupier pin-level due-diligence report" is no
   longer fully true.** NestCheck (nestcheck.com.au, launched ~Feb 2026, sole
   trader) sells free + $29.99 one-off PDF property reports for any VIC
   address from the same open-data stack. Its execution is markedly weaker
   (verified: fake pravatar.cc testimonials, raw-OSM "Deli Aisle" amenities,
   straight-line distances, schools by proximity not catchment, opaque
   scores, no methodology/provenance, paywalls free gov data) - but it
   validates the exact market and price band, and it ships VIC-wide with
   ACECQA childcare ratings before us. See FABLE-ULTRAPLAN section 16.6 for
   the response. The market/pricing conclusions (model, $39 price) stand;
   the "uncontested" framing does not.
2. **Landchecker covers the ACT** (full coverage via ACTmapi since Dec 2023);
   section 2.5's expansion logic stands on machinery grounds, but any
   "Canberra has no competitor" rationale is wrong and has been removed from
   the plan.
