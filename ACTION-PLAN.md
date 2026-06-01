# Unified Action Plan — liveable.melbourne / Buyer Check

Merges three inputs: **[Codex]** (file-aware review), **[Triage]** (Claude verification of Codex's first, file-blind review), **[You]** (founder product/UX/data notes). Nothing here is implemented yet — this is the plan to work from. Tags: severity (P0–P3), effort (S/M/L), source.

Hard constraints that gate every "fix": static export (no backend/server/API/db/auth/payment); **Buyer Mode is a context lens, never folded into the scored composite**; not-advice; **never overclaim/invent data**; every finding shows source + freshness + precision + confidence + caveat; sub-path safe (`withBase()`).

## GOAL (north star)
Turn liveable.melbourne into a **report-first buyer due-diligence product for Melbourne** — an independent, fully-sourced "check the location before you offer" second opinion — while the open-data liveability map stays free. Compete on **independent, transparent, sourced due-diligence** (hazards, planning context, real walking amenity, community context, confidence + caveats), NOT on price/valuation (that is Cotality/Domain/REA's turf). Build in phases 0→4; validate per-report willingness-to-pay in Melbourne before expanding.

**Phase map:** 0 = trust/correctness/SEO/a11y/privacy (decision-free) · 1 = buyer data & categories · 2 = buyer deep-dive UX · 3 = methodology depth (research-first) · 4 = positioning & go-to-market (your decisions D1–D4).

### Cotality (cotality.com.au — ex-CoreLogic) — what to learn [reference]
- Incumbent owns **price/valuation/AVM, sold + rental history, market trends, risk/climate analytics**, sold mostly **B2B** (lenders, agents, insurers, government) + paid consumer property reports. → **Do NOT compete on price.** Our wedge = the independent, transparent, open-data due-diligence layer they paywall + don't frame for an anxious first-home buyer.
- They sell **per-property reports** (and subscriptions) → validates a **per-report** consumer model (D2).
- Their risk/climate (flood/fire/coastal) is licensed + opaque → our edge is **transparent, sourced, caveated** hazard context (free/cheap).
- Their UX is data-dense/pro → opportunity to be **plain-language + buyer-friendly** (your SEIFA-jargon + report-first points). *(Deeper teardown = a Phase 3/4 research task.)*

---

## What was stale / already fine (close, no work)
- **P0.1 "live root = Loading map…"** — REFUTED [Triage+Codex]. `out/index.html` ships the buyer hero + crawlable `/buyer` + `/buyer/sample-report` links pre-hydration. (Caveat [Codex P3]: the *committed* `out/` is a no-basePath local build; the CI artifact rebuilds with `NEXT_PUBLIC_BASE_PATH` — don't treat committed `out/` as deploy truth.)
- **Legal pages "draft"** — present + prominent ("Draft — not yet legal advice"); a gate before charging, not a code bug [Triage].
- **Buyer Mode folded into score?** — NO; `lib/scoring.ts:31-35` only loops `V1_SCORED_DOMAINS` [Codex verified].
- **"god component" (page.tsx 791 lines)** — cohesive; refactor is optional polish, not a bug [Triage]. (But Phase 2 UX work is a natural time to extract `useBuyerMode`.)

---

## PHASE 0 — Trust, correctness & honesty (do first; no decisions needed; all S)
These are violations of our OWN rules or plain bugs. Highest priority.

1. **[Codex P1] Landing overclaims "heritage" data.** `app/buyer/page.tsx:17-19` promises "Planning / heritage / flood / bushfire indicators" — we only have bushfire + flood overlays. → Remove "heritage" (and "planning" unless we can back it) or mark "coming soon". *(matches [You]: data must be correct.)*
2. **[Codex P1] Findings without source/caveat.** `school-zones` + `price-unavailable` have no `sourceRefs`/caveat → breaks the "every finding shows source + caveat" rule. → Add limitation refs + caveats; add a unit test asserting **every** finding has provenance fields.
3. **[Codex P2] "Supports resale appeal" reads as property advice.** `lib/buyer-report.ts:351-357`. → Neutral utility copy ("affects day-to-day convenience; inspect the actual routes").
4. **[Codex P2] Off-coverage safety finding overstates precision.** When `place` is null it still says confidence:medium / geography:lga. → set `unknown` (or omit) when no SA2 match.
5. **[Triage P1] Mobile buyer mode leaks the scored Results tab** (domain sliders + ranked suburb list) into the buyer lens. Desktop hides it (`page.tsx:560`); mobile passes `rankedResults` unconditionally to `MobileSheet` (`:597`). → Gate it on `buyerMode`; add regression test. *(Constraint-critical: lens-not-scored.)*
6. **[Codex P1] Methodology source link ignores basePath.** `METHODOLOGY_REF.url="/methodology"` rendered as raw `<a>` → wrong on Pages sub-path. → route internal `sourceRefs` through `withBase()` / `next/link`.

## PHASE 0b — SEO / positioning (small, high-leverage; no decisions)
7. **[Triage+Codex P1] Sitemap** `app/sitemap.ts:8` placeholder `…example.au` + missing `/buyer`, `/buyer/sample-report`, `/pricing`, `/privacy`, `/terms`, `/account`. → real site URL via `NEXT_PUBLIC_SITE_URL` + base path; add all public routes (prefer generating from the route list).
8. **[Triage P1] Root metadata** `app/layout.tsx:19-21` still "Melbourne Liveability Map / map-first scores". → buyer-first title + description (keep not-advice). *(Depends lightly on the brand decision — see Decisions.)*
9. **[Codex P3] Canonical on duplicate sample routes.** `/buyer/sample` + `/buyer/sample-report` identical. → `alternates.canonical` → sample-report.

## PHASE 0c — Accessibility & privacy (no decisions)
10. **[Codex P2] Accent contrast fails WCAG.** `#D97757` on white = 3.12:1, on `#FAF9F5` = 2.96:1 (need 4.5:1 for normal text). → darken the text/link accent, or dark text on filled accent buttons. Audit all accent-on-light text.
11. **[Codex P1 + You] Pin-drop is mouse-only.** No keyboard path to set a pin. → keyboard-accessible fallback. **Unifies with [You]'s "use the search bar to pick the area instead of dropping a pin"** — search/address → pin, with map-click as fallback. (See Phase 2.)
12. **[Triage P1] No Playwright buyer/a11y tests.** → add: buyer-mode pin/report render, `?buyer=1&lat&lng` restore, print-no-throw, keyboard path, `@axe-core/playwright` audit.
13. **[Codex P2] Exact-pin privacy affordance.** Share URL + feedback encode exact coords with no notice. → label share/feedback as containing the exact pin; offer area-only share; only send pin to Formspree with consent.
14. **[Codex P3] Alert consent links to wrong page.** `app/alerts/page.tsx` consent points to Disclaimer "for privacy" but sends data to Formspree. → link `/privacy` + mention third-party form processing.

---

## PHASE 1 — Buyer data & categories ([You]; M; respects open-data + double-check)
**Re-categorise POIs into buyer-meaningful groups; surface brands; prioritise correctly.**

- **Shops vs Services split** [You]: today they're mixed. → two groups. **Shops** leads with **Groceries**; **Services** = Aus Post/LPO (have), chemist/pharmacy (have), **banks (new OSM `amenity=bank`)**.
- **Groceries by brand** [You]: show Coles, Woolworths, ALDI, IGA — incl. **Woolworths Metro / Coles Local** small formats. OSM supermarket nodes carry `brand`/`name`; we already store POI `name`. → classify + label by brand (re-fetch to capture `brand` tag if needed). *(Double-check: cross-validate brand coverage against a second list where possible.)*
- **Health: hospitals first** [You]: when a hospital is in/near the area, surface it as the priority health item; GP/pharmacy below. Reclassify gyms/pools/tennis/swim as **Recreation** context (NOT health-system) — see methodology.
- **Education ladder** [You]: split childcare/kinder (have), **primary**, **secondary/high**, **TAFE**, **university** from OSM (`amenity=school` + `isced`, `college`, `university`). Keep Year-12 attainment + preschool enrolment (have).
- **Community & support** [You]: **social housing** (a `socialHousing` POI type exists in `lib/types` — verify it's populated), **NDIS** (have), **Centrelink / Services Australia** (new; OSM `office=government` / brand), shown as neutral **context** (never a buyer "red flag" — dignity rule).
- **Hazards conditional** [You]: central areas are ~0% bushfire/flood — suppress the hazard finding (or render it as "no mapped overlay in this SA2; still verify") when overlay share is ~0; surface prominently only when material (engine already has 50%/10% severity thresholds — add a low/zero suppression rule).
- **Plain-language jargon** [You]: "SEIFA IRSAD decile" etc. need a one-line plain explanation + tooltip/glossary ("relative socio-economic advantage; 1 = most disadvantaged, 10 = most advantaged, within Australia").

**Data-correctness principle [You]:** for each new/loaded indicator, cross-check against a second reference where one exists (e.g. OSM brand vs official store locator; ABS vintage vs DFFH report) and record it in the source manifest; if the two disagree materially, show "verify" rather than assert.

---

## PHASE 2 — Buyer deep-dive UX ([You]; M–L; likely includes the `useBuyerMode` extraction)
- **Search-to-area + pin fallback** [You]: let the user type an address/suburb in the search bar to set the location; keep drop-a-pin for when the exact address isn't found. (Also satisfies [Codex P1] keyboard a11y.) *Note: full street-address geocoding needs an external geocoder — start with suburb/SA2 + landmark search (no new dep); defer precise address geocoding to the WTP phase.*
- **Deep-dive layout change** [You]: on select/pin, **zoom the map into the area** and **widen the right sidebar** (it's a fixed 372px today — too tight for the rich report) into a more fluid/wider panel. Responsive: drawer/full-width on mobile.
- **Selectable 15-min-walk pins** [You]: once a location is set, show POI pins within the ~15-min walk and let the user toggle categories (gym, GP, groceries, shopping centres/malls). Reuses the existing isochrone/straight-line reachability + POI layers.

---

## PHASE 3 — Methodology depth (research → validate against 2 sources → then build; needs your steer)
Per-domain candidate indicators (open-data-feasible unless noted). Validate + confirm static-export feasibility before adding; keep each as a transparent lens.

| Domain | Have | Candidate additions (open-data) | Defer (needs licensed/price data or modelling) |
|---|---|---|---|
| **Affordability** | rent-to-income | mortgage-repayment-to-income (ABS Census); rental stress (30/40 rule); DFFH Rental Report median rent + **vacancy rate** trend | price-to-income, yield (no price licence) |
| **Transport** | stops 800m, AM-peak trips, modes (GTFS) | distance to nearest train station; peak service frequency at the pin; **journey-to-work mode share** (ABS) | jobs-reachable-in-30min accessibility model |
| **Crime/Safety** | recorded offences (LGA) | offence-**type** split (against-person vs property — VCSA); multi-year **trend** (have timeseries) — all heavily caveated (recorded ≠ actual) | perception-of-safety (no open dataset) |
| **Health** | GP, hospital, pharmacy | hospitals-first display; **Recreation** as separate context (gyms/pools/courts); bike lanes already = cyclability layer | — |
| **Education** | childcare, preschool, schools-2km, Yr-12 | primary/secondary/TAFE/uni split | NAPLAN/ATAR (licensing/sensitivity) |
| **Community** | tenure, SEIFA, apartments, Yr-12, NDIS | social housing, Centrelink, banks as **context** | — |

---

## PHASE 4 — Positioning & go-to-market (YOUR decisions D1–D4; none block Phase 0)
- **D1 Brand:** keep one `liveable.melbourne`, reposition buyer-first (a 2nd brand splits the open-data trust moat). *Rec: keep one for v1.*
- **D2 Pricing:** per-report + bundles, NOT subscription-first; don't hardcode a price until WTP is tested; checkout stays a thin non-static service later. *Rec: per-report.*
- **D3 ICP:** Melbourne buyers + buyers'-agents/conveyancers; **defer developers** (need parcel zoning) + **national** (no data). *Rec: yes.*
- **D4 Dignity & Sensitive-Data standard** doc + a **Trust/About page** (who built it, funding, data-issue contact) — [Codex+Triage]: no trust page exists today. *Rec: do both (cheap, high-trust).*

## Deferred (not now)
`useBuyerMode` refactor (unless Phase 2 forces it); paid precise-walk + ORS proxy (and **[Codex P1]**: even the proxy design still sends a public key — redesign before any paid launch); hardcoded prices/checkout; developers/parcel/national; price/growth forecasts; multi-criteria filter; precise street-address geocoding — until WTP validated.

## Open question for you
- **The competitor/pricing website** you mentioned ("I found this website — he looks at prices") wasn't pasted — please share the URL so I can fold product/insight learnings into Phase 3.
