# Buyer Mode — strategy draft (for review)

**Status:** DRAFT for external review (ChatGPT / Claude / human). Nothing here is built or
decided. Goal of this doc: pressure-test the *property-buyer* direction as the primary
paid product, and the differentiation thesis behind it, before we commit engineering.

**Author intent (Rafael):** buyers are the segment most likely to *pay*. But we must
"think differently from what people already have access to" — not rebuild Domain/REA.
This doc proposes where that difference is, what data it needs, and the open questions.

---

## 1. The one-line thesis

> **liveable.melbourne (Buyer Mode) is the independent, fully-sourced *due-diligence
> layer* for Australian property buyers** — surfacing the risks, planning/supply changes,
> and liveability ground-truth that transaction portals won't, can't, or won't *honestly*
> show. We don't compete on listings or "growth scores"; we compete on **honest synthesis
> of fragmented open-government data, and neutrality.**

Price trends are included as orientation. They are **not** the moat — the portals already
win on transaction data, and we won't out-Domain Domain.

---

## 2. Why this is a real gap (what buyers can and can't already get)

| Buyer question | Who answers it today | The gap we exploit |
|---|---|---|
| What's for sale / what did it sell for / median price | Domain, realestate.com.au | They win. We only borrow this as context. |
| Automated valuation / "growth forecast" | CoreLogic, PropTrack (paid, black-box) | Opaque, proprietary, optimistic. We offer *transparent, sourced* signals instead. |
| **What hazards / risks affect this property?** (bushfire, flood, insurance, contamination, heritage limits) | Scattered (VicPlan, EPA, CFA); portals **bury** it | **We surface it, sourced + caveated.** Portals are agent-funded → structurally disincentivised. |
| **What's being built / planned nearby?** (developments, permits, rezoning, infrastructure) | Fragmented across council DA registers, VicPlan, Big Build | **Aggregating this per-area is genuinely hard + unique.** Leading indicator of price + amenity. |
| **What's the social/community trajectory?** (tenure mix, social housing, churn, demographics) | profile.id (B2G), ABS (raw) | We already compile much of this; buyers research it manually. |
| **Is it actually a good place to live?** (transport, schools, walkability, health, crime) | Us, already — sourced + honest | This is our existing strength; Buyer Mode ties it to the purchase decision. |

**The structural moat:** the portals are **agent-funded and transaction-optimised**, so they
cannot credibly publish the downside (flood risk, crime context, a planned 8-storey block
next door, rising social-housing concentration). We are sourced, neutral, and
liveability-first — *"the second opinion your buyer's agent won't give you for free."*

---

## 3. Buyer-relevant data layers (Rafael's list + extensions)

Rated by **differentiation** (how much it sets us apart) and **effort/feasibility** (open
data availability for Victoria first; national later via the §10 adapter pattern).

| Layer | What it tells a buyer | Candidate AU source | Open? | Differentiation | Effort |
|---|---|---|---|---|---|
| **Price trend** (median sale) | Is the area rising/falling | Vic Valuer-General sales / data.vic; PropTrack/CoreLogic (licensed) | Partial / patchy | Low (portals win) | Med (licensing) |
| **New developments / supply pipeline** | Future supply pressure + neighbourhood change | VicPlan permits, council DA registers, **ABS Building Approvals** (SA2/LGA) | Mostly yes | **High** | High (fragmented) |
| **Social housing nearby** *(also Community)* | Social mix, concentration trajectory | DFFH social-housing stock + ABS tenure (social-housing %) | Yes | Med-High | Low-Med |
| **Zoning + overlays / rezoning** | Reno limits (heritage), upzoning upside, what can be built next door | VicPlan zones + planning-scheme overlays | Yes | **High** | Med |
| **Infrastructure pipeline** | Amenity + price trajectory | Vic "Big Build" (Suburban Rail Loop, level-crossing removals), DTP open data | Yes | High | Med |
| **Hazard / insurance risk** | Bushfire / flood exposure → insurance cost, resale | We ALREADY hold BPA + LSIO overlays | Yes (have it) | **High** | Low (surface it) |
| **School catchments** | Zoned-for-X-school price premium (top buyer driver) | findmyschool.vic.gov.au (deferred in ULTRAPLAN) | Yes | High | Med |
| **Rental yield / investor lens** | Yield for investor-buyers | rent (have) ÷ price (need) | Partial | Med | Med |
| **Vacancy / rental demand** | Tenant demand, exit liquidity | DFFH bond-lodgement / vacancy | Verify | Med | Med |
| **Demographic trajectory** | Gentrification / churn signals | ABS Census + ERP series (have ERP) | Yes | Med | Low-Med |

**Read:** our highest-differentiation, lowest-effort wins are the ones the portals avoid and
we partly already hold — **hazards/insurance risk, social-housing context, zoning/overlays,
and the development/supply pipeline.** Price trend is the *lowest*-differentiation item
despite being the most-requested — include it, but don't lead with it.

---

## 4. Product shape

- **Free core (unchanged):** the liveability map + all open data. Stays the public good and
  SEO/top-of-funnel engine. Never paywalled.
- **Buyer Mode (paid):** a buyer lens over the map **plus** an exportable, sourced
  **"Buyer Due-Diligence Report"** per suburb/address:
  - Liveability snapshot (our 7 domains, honestly).
  - **Risk dossier:** hazard overlays + insurance implications, crime context, contamination/heritage flags.
  - **Change dossier:** nearby developments/permits, rezoning, infrastructure pipeline, supply (building approvals).
  - **Social/community trajectory:** tenure mix, social housing, churn, demographics.
  - **Price context:** trend + rent/yield, clearly labelled and caveated.
  - Every figure sourced + dated; a confidence statement; explicit "information, not advice."

The report is the thing a buyer would pay $X for before a $1M+ decision — and it's
*differentiated* because it's the honest, aggregated, forward-looking view, not a listing
or a black-box score.

---

## 5. Fit with existing architecture & principles

- **Never folds into the scored liveability composite.** Buyer signals are context/lens
  only — the locked seven-domain score stays neutral (preserves trust + the free product).
- **Reverses ULTRAPLAN §0 "no sale-price data" — consciously.** Sale price enters *only* as
  buyer-lens context, never into liveability rank. This must be a documented, deliberate
  decision (it's the project's stated red line today).
- **Uses the §10 jurisdiction-adapter pattern.** Most buyer layers are Vic-specific
  (VicPlan, DFFH, Big Build) → Vic adapter first, other states later.
- **Slots into §12 monetisation** as the concrete B2C engine (today §12 leans B2G/B2B
  area reports). Buyer Mode is the consumer counterpart.
- **Static-first still holds** for the data; accounts/payments stay a thin separate service.

---

## 6. Monetisation

- **B2C primary:** Buyer Mode subscription (small $/mo) **or** pay-per-report (e.g. one
  due-diligence report per purchase). Per-report may convert better — buyers are episodic.
- **B2B adjacent (likely durable):** buyers' agents, conveyancers, mortgage brokers,
  relocation firms — white-labelled or bulk due-diligence reports. (Pairs with §12 B2G/B2B.)
- **Why they pay:** a $1M+ decision; the report de-risks it with information that is
  otherwise hours of manual digging across council/VicPlan/EPA sites — and that the
  agent-funded incumbents won't surface honestly.

---

## 7. Honest risks & limits (do not skip)

1. **We will not beat the portals on sale-price/listing data.** Open sale data is lagged and
   patchy; CoreLogic is expensive. If we frame Buyer Mode as "better price data," we lose.
   The thesis only holds if the moat is **risk + change + honesty**, not price.
2. **DA / planning data is fragmented per-council** and freshness is hard. The supply/dev
   pipeline is the highest-value, highest-effort layer — scope it carefully or it sinks the MVP.
3. **Licensing:** Valuer-General sales terms, CoreLogic/PropTrack cost, council DA reuse
   terms — verify before committing any layer (same gate as every other source).
4. **Neutrality / SEO risk:** going buyer-commercial must not make the free liveability
   product look like a sales funnel, or it erodes the trust + organic-search advantage.
5. **Legal:** strictly "information, not financial/property advice" — even more important
   when money changes hands. Keep the disclaimer + Privacy/Terms tight.
6. **Incumbent response:** CoreLogic/PropTrack could add a "risk/liveability" layer. Our
   defensibility is *open-data transparency + neutrality*, which they structurally can't
   match without abandoning their agent/valuation business model. Is that enough? (Q for review.)

---

## 8. Proposed MVP (smallest differentiated slice)

Build the layers that are **high-differentiation + we mostly already hold**, ship a basic
report, measure willingness-to-pay before the expensive layers:

1. **Surface what we have for buyers:** hazards/insurance-risk framing + social-housing/tenure
   context + ERP population trajectory → a first "Buyer view" on existing profiles. (Low effort.)
2. **School catchments** (findmyschool) — top buyer driver, deferred but high-value. (Med.)
3. **Building approvals (ABS, SA2/LGA)** as a first, *tractable* supply-pipeline signal
   (cleaner than council DAs). (Med.)
4. **Exportable Buyer Due-Diligence Report** (PDF/CSV) stitching the above + price context. (Med.)
5. *Then* evaluate: VicPlan zoning/overlays, dev-application aggregation, sale-price feed.

Defer the hardest (per-council DA scraping, licensed price feeds) until WTP is proven.

---

## 9. Open questions for reviewers

1. Is the **"independent due-diligence layer"** thesis defensible long-term, or will
   CoreLogic/PropTrack/portals absorb it? What's the durable moat — is open-data transparency
   + neutrality *enough*?
2. Best **free/open Victorian sources** for (a) sale-price trend and (b) the
   development/permit pipeline? Is ABS Building Approvals a good-enough supply proxy to start?
3. **Pricing model:** per-report vs subscription vs B2B (buyers' agents/brokers)? Which
   converts for an episodic, high-stakes purchase?
4. Does reversing **"no sale-price data"** endanger the free product's neutrality/SEO? How to
   firewall the commercial lens from the trusted liveability core?
5. What's the **single most differentiated layer** to lead the MVP with — risk dossier, the
   change/pipeline view, or school catchments?
6. Are we underrating any buyer need (strata/body-corporate data, flood-insurance pricing,
   noise/aircraft, NBN, crime-trend direction, comparable-sales context)?
7. Layers: is a **multi-criteria filter** ("show areas matching my criteria") the right paid
   power feature, vs bivariate choropleths or saved layer sets?
8. Pin-a-property: ship as **click-to-drop** (no geocoding) first? Is straight-line 15-min
   walk honest enough, or does the paid tier need street-network routing?
   *(Resolved for the prototype: free tier stays straight-line + caveat; the paid tier opts into
   a street-network walk isochrone — see §10.2.)*

---

## 10. Interaction features to pressure-test (added from Rafael's notes)

Two concrete interactions, mostly buildable with data we already hold, that lean directly
into "do what the portals don't."

### 10.1 Composable layers + a multi-criteria filter (paid power feature)
Today the map shows one choropleth at a time. For paying users, let them **manage what they
see**:
- **Overlay manager** — choose the base choropleth (any domain/context) + toggle overlays
  (pins, 15-min-walk shading, hazard overlays). The building blocks already exist.
- **Multi-criteria filter (likely the killer feature)** — "show only SA2s where renter % is
  high AND income is high AND 15-min walk is good." Every per-SA2 value is already in the
  browser, so this is a pure client-side filter that instantly highlights the areas matching
  *your* criteria — the "where should I even look?" tool a listing portal can't offer.
- **Bivariate choropleth** (nice-to-have) — colour by two variables at once (e.g. renter % ×
  income) via a 2-D palette. Visually harder; lower priority than the filter.

Feasibility: high (data is client-side). Free tier stays single-layer; layers/filter are the
natural paid "power" tier.

### 10.2 Drop a pin / "around this property" (15-min walk from any point)
A buyer sees a listing on realestate/Domain, then comes here to vet the **location**. Let
them **drop a pin at the exact spot** (click the map now; typed-address search later) and see:
- What's within ~15 min on foot **of that point** (not the SA2 centroid) — supermarket, GP,
  school, park, transport, cafe — computed client-side from the POI set we already ship
  (haversine from the pin; same straight-line caveat as today).
- The SA2 liveability + the **risk dossier** for that location (hazard overlays, crime
  context), plus nearby developments / social housing once those land.

Feasibility: high for the click-to-drop MVP (POIs already loaded; distance maths is trivial).
Typed-address geocoding (address → lat/lng) is a later add (Nominatim/OSM has usage limits;
a paid geocoder suits the paid tier), and street-network 15-min routing is a paid upgrade
over straight-line. This is arguably the **single most differentiated** buyer interaction:
portals show the listing; nobody gives an honest, sourced "what's actually around this exact
spot, on foot."

**Street-network routing — prototype (paid tier, opt-in).** Both options were evaluated:
- *Client-side router over the OSM ways we already ship* — **rejected.** The only road geometry
  in the repo is `data/raw/osm-cycleways.json`, a cycle-biased Overpass extract: of its 46,132
  ways, 22,814 are `highway=cycleway` and the rest are mostly main roads carrying `cycleway:*`
  lane tags — only ~4,400 residential and ~1,356 footway ways. Most residential streets and
  footpaths people actually walk on are absent, so it cannot route a pedestrian; a full
  Greater-Melbourne walk graph is too large to ship for arbitrary-pin routing, and
  `output: "export"` rules out a server router.
- *External isochrone API, opt-in at runtime* — **chosen.** `lib/walk-isochrone.ts` calls the
  OpenRouteService `foot-walking` isochrone (env-keyed via `NEXT_PUBLIC_ORS_API_KEY`; optional
  `NEXT_PUBLIC_WALK_ISOCHRONE_URL` to self-host / proxy / swap backend), and `buildBuyerReport`
  filters the same already-loaded POIs by point-in-polygon instead of a radius. It is a
  client-side fetch, so static export is intact. The free tier stays straight-line with its
  caveat; the buyer panel shows a "Use precise walk routing (beta)" button only when a key is
  configured, and the report's `accessMode` flips the copy from "within ~1.2 km" to a
  street-network walk. (A `NEXT_PUBLIC_*` key is visible client-side — fine for the prototype;
  production hardening is a thin key-hiding proxy behind the same URL override.)

> **More data (Rafael: "grasp more from census/other docs"):** the around-this-point view
> gets richer as we add the §3 buyer layers (catchments, development pipeline, social
> housing) and more amenity types. ABS Census has more we don't yet fetch — journey-to-work
> mode, car ownership, and qualification level (bachelor/postgrad via DataPacks G49, which is
> not in our current ArcGIS feed) — all candidates for the buyer dossier.

---

*Cross-refs: ULTRAPLAN §0 (no-sale-price red line), §9 (deferred: median sale prices, buyer
mode, school catchments), §10 (jurisdiction adapters), §12 (monetisation roadmap).*
