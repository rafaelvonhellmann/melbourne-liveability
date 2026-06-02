# Master Plan & Handover — liveable.melbourne / Buyer Check

Single source of truth to **start a new session**. Covers what is shipped, what
is pending (build / review / act), the backlog, the file map, how to run, and
the gotchas. A `## Code-review findings` section at the end is filled after the
review pass.

---

## 0. TL;DR
- **What:** static (no-backend) Next.js map of Greater Melbourne liveability +
  a **Buyer Location Check** (drop/search a location → sourced, caveated
  due-diligence report before you offer). Buyer-first product.
- **Live:** https://rafaelvonhellmann.github.io/melbourne-liveability/
- **Repo:** github.com/rafaelvonhellmann/melbourne-liveability (HEAD `a946e3d`)
- **Goal:** report-first buyer due-diligence for Melbourne; open map stays free;
  per-report monetisation validated before national expansion. Compete on
  transparent, sourced due-diligence — NOT price (that is Cotality/Domain/REA).

## 1. Run + gates
```
npm run dev            # localhost:3000
npm run typecheck      # (or: node node_modules/typescript/bin/tsc --noEmit)
npm test               # vitest — 101 tests
npm run lint           # (or: npx eslint .)
npm run build          # next build -> static export to out/
```
Local-binary fallbacks (`npm run` PATH is flaky in this shell): `node node_modules/typescript/bin/tsc --noEmit`, `npx vitest run`, `npx eslint .`.

**Gotchas:**
- **OneDrive build flake:** repo lives in a OneDrive folder; `next build` can fail
  at "Collecting build traces" (ENOENT `.next/...nft.json`) — OneDrive syncing
  `.next`. Fix: `Stop-Process -Name OneDrive -Force` for the build, then restart
  it. Irrelevant to `output:export`; CI (GitHub runners) unaffected.
- **Automated-browser map render:** controlled/headless tabs `rAF`-throttle the
  MapLibre GL canvas (blank map); reproduces on prod too — verify the map in a
  normal focused tab, not automation.
- Data raw (`data/raw`) is gitignored; only generated JSON/GeoJSON is committed.

## 2. Hard constraints (never regress)
Static export only (no backend/server/API/db/auth/payment) · Buyer Mode is a
context lens, **never** folded into the scored composite · not advice · never
overclaim/invent data · every finding shows source + freshness + precision +
confidence + caveat (unit-test enforced) · sub-path safe (`withBase()`).

## 3. SHIPPED (this + prior sessions, all deployed)
Commits `2cd7ae9` → `0a2c375`:
- **Buyer Check v2 engine** (`0581ed8`) — `lib/buyer-report.ts` deterministic
  findings; `BuyerReportPanel`; `/buyer`, `/buyer/sample-report`; profile
  "Buying here?" card; paid-tier `lib/walk-isochrone.ts` (env-gated, off).
- **Data** — gated rebuild lit up Year-12 (`5980054`); banks + TAFE + university
  POI categories (`f355d32`).
- **CI** — Pages actions bumped to Node 24 (`21fa9c6`).
- **Phase 0** (`8624b8a`) — honesty fixes (heritage overclaim removed, every
  finding sourced/caveated + test, advice-wording removed, off-coverage
  precision, base-path source links), **mobile context-lens leak fixed**,
  sitemap (real domain + routes), buyer-first metadata + OG, alerts privacy
  link, **`DIGNITY-STANDARD.md`**, **`/about` trust page**.
- **Phase 1** — hazards-conditional + SEIFA plain-language (`6da8b36`);
  categories groceries-first / Services split / hospitals-first (`1222b19`).
- **Phase 2** — zoom-to-pin + wider sidebar (`897f4c3`); search-to-area pin
  (`9f5d0ec`); nearby-amenity pin toggles (`71aaf5b`).
- **Phase 3** — crime nuance: property + violent split, caveated (`8bf5892`).
- **Phase 4** — per-report pricing **waitlist** (no committed price) + env-gated
  cookieless analytics funnel (`f671e2e`).
- **UX rework** — declutter sidebar (`8e719c4`); 15-min walk **radius** drawn
  (`1eb772e`); **unify flow** (click/search = instant deep-dive, no toggle, no
  size-reset) + **Economy** rename (`41c6ccf`); domain hover tooltips (`0a2c375`).

## 4. BUILD tasks #7-#13 — ALL SHIPPED (`d805e13`..`56dec4a`)
All seven goal-tracker build items are done, each gated (typecheck · tests · lint) and pushed:
| # | Item | Commit | Notes |
|---|---|---|---|
| 9 | **Crime LGA fallback** | `d805e13` | Root cause was a name mismatch, not missing data: ABS says `Moreland`, VCSA renamed it `Merri-bek` (2022), so the existing LGA-fallback silently dropped all 13 Moreland SA2s. Added a shared `normalizeLgaName()` alias → they now resolve at the accurate suburb level. |
| 7 | **Full-address geocode → exact pin** | `dd3e328` | `lib/geocode.ts` (OSM Nominatim, Melbourne-bounded, abortable, attributed, explicit-submit so ≤1 req/s). SearchBox offers "search as address"; a pick drops an exact pin → deep-dive (SA2 from geometry). Static-safe. Wired on the map + Compare. |
| 13 | **R3 precise-walk race + R5 dead export** | `da7bef8` | `recomputePrecise()` now snapshots the pin + AbortController + staleness guard. Removed unused `amenitiesNearIsochrone` + its tests. |
| 11 | **Compare search + adjacency caveat** | `c218b09` | Buyer report gains a "Close to a neighbouring area" finding when the pin is within ~15-min walk of a neighbour's centroid (honestly captioned as centre-point proximity, not a boundary test). Compare reframed to "Search where you want to live" + address→SA2 add. |
| 12 | **ShadeMap link + retention** | `20859f9` | `lib/shademap.ts` "Check sunlight & aspect" deep-link in the report; saved-checks retention (`user-prefs.savedChecks`) with a "Your saved checks" list in the buyer entry state. Cross-device still needs accounts. |
| 10 | **Parks dedupe** | `a400a83` | `dedupeParkAmenities()` collapses OSM park splits (same name OR generic, within 200 m). Verified: a Royal Park pin drops 36→20 distinct parks. Park geometry is point-only, so green-%-of-area would need a polygon rebuild — deferred. |
| 8 | **Collapsible sidebar + Lens merge + mobile parity** | `56dec4a` | Unified "Lens" picker (Balanced/Renting/Buying/Family/Retiree/Data quality — young-pro/student→Renting, education→Family); collapsible desktop panel; mobile sheet now Explore/Search/Layers/Weights (Results tab + Recently-viewed removed). |

## 5. REVIEW / FIX + polish — partly shipped (`d0c2d5d`..`a946e3d`)
Shipped this round (gated typecheck · 127 tests · lint; CI build green):
- ✅ **Canonical tags** `/buyer/sample` → `/buyer/sample-report` (`b22e411`, Codex P3).
- ✅ **Domain tooltip** → styled, keyboard-accessible explainer box (`de75175`).
- ✅ **CI** data-refresh.yml actions `v4`→`v6` (`d0c2d5d`); deploy-pages already `v6` (`21fa9c6`).
- ✅ **Bushfire + flood hazard risk layers** (`a946e3d`) — overlay-share choropleths,
  Reds ramp, off by default, never scored. **Color ramp + bands (2/10/25/50%) are a
  first pass — review/tune the scheme.**

Still open:
- **WCAG contrast** — accent `#D97757` ~3.1:1 on light. **Deferred on purpose:** the
  fix darkens the brand accent across the app, a visual change to review live, not a
  blind autonomous edit. [Codex P2.]
- **Playwright E2E + axe** for the buyer flow + a11y audit. [Codex P1 — not added.]
- **`page.tsx`** (~900 lines now) — extract `useBuyerMode` / hazard wiring. [optional]
- **OneDrive `.next` HMR lock** can corrupt the *local* dev server mid-edit (stale
  bundle, false "hooks order" errors). CI/prod unaffected. Fix: stop OneDrive, `rm
  -rf .next`, `npm run dev`. See [[onedrive-next-build-race]].

## 5b. Strategy discussed (this session) — decisions/notes
- **Lens merge:** founder chose the curated buyer-first 6 (`56dec4a`).
- **Demographics (religion/nationality/migration):** recommended AGAINST per-ethnicity
  percentages (steering risk, conflicts with `DIGNITY-STANDARD.md`); reshape to
  *amenities* (places of worship of all faiths, community/cultural centres) if wanted.
- **Legal/copyright:** OSM ODbL share-alike on the derived geojson is the one to watch;
  AU has no sui-generis DB right so the open data is inherently copyable — moat = brand
  + methodology + report UX + gated paid features. Folds into §6 legal review.
- **Council/infra contracts (analisa.pt-style):** raw procurement isn't geocoded; the
  tractable version is a "planned & recent infrastructure" layer from VIC Big Build
  (level-crossing removals, Metro Tunnel, SRL stations), framed as "what's changing
  nearby", NOT price prediction. Bigger task; not started.

## 6. PENDING — ACT (founder decisions / external)
- **D1 brand name** — pick (shortlist: Kerbside / Groundwork / Premise /
  Sightline); `liveable.melbourne` is the working name. Verify domain/TM/socials.
- **Pricing number** — set per-report price via the waitlist/WTP test.
- **Legal review** of Terms/Privacy/Disclaimer + report wording before charging.
- **ORS key proxy** — required before shipping paid precise-walk (key currently
  client-exposed; feature env-gated OFF in prod). [Codex P1.]
- **Accounts/payment** thin service — gates cross-device retention + paid reports.
- **Twitter/price data** — price-growth = out of scope; rent-affordability = backlog.

## 7. BACKLOG (bigger / deferred)
Composable (stacked) layers · multi-criteria "find areas like this" filter
(spec Part 6) · deep methodology indicators (mortgage-to-income, rental stress,
DFFH vacancy, journey-to-work mode share, train-station distance — need new
ABS/DFFH fetch + 2-source validation vs scores) · school catchments · building
approvals · zoning/heritage/parcel overlays · Centrelink / social housing
(sparse OSM) · primary/secondary school split (sparse `isced`) · cyclability
radius · national expansion (Sydney/Perth/…) · price/growth context (licensing).

## 8. File map (key)
- Engine/data: `lib/buyer-report.ts`, `lib/source-manifest.ts`,
  `lib/walk-isochrone.ts`, `lib/buyer-location.ts`, `lib/share-url.ts`,
  `lib/analytics.ts`, `lib/domains.ts`, `lib/colors.ts`, `lib/poi-categories.ts`,
  `lib/scoring.ts`.
- Components: `components/MelbourneMap.tsx`, `components/buyer/BuyerReportPanel.tsx`,
  `components/buyer/SampleReportPage.tsx`, `components/buyer/BuyerHereCard.tsx`,
  `components/LayerToggle.tsx`, `components/MobileSheet.tsx`, `components/SearchBox.tsx`.
- Routes: `app/(map)/page.tsx` (+ `layout.tsx`), `app/buyer/*`, `app/about/page.tsx`,
  `app/pricing/page.tsx`, `app/places/[slug]/page.tsx`, `app/compare/page.tsx`,
  `app/sitemap.ts`, `app/layout.tsx`.
- Pipeline: `scripts/build.ts`, `scripts/fetch-extra-poi.ts`, `scripts/build-poi.ts`,
  `scripts/fetch-indicators.ts`, `data/generated/sources.json`.
- Docs: this file, `ACTION-PLAN.md`, `CODEX-REVIEW.md`, `DIGNITY-STANDARD.md`,
  `BUYER-MODE-DRAFT.md`.
- Tests: `tests/buyer-report.test.ts`, `tests/walk-isochrone.test.ts`,
  `tests/share-url.test.ts` (+ others). 101 total.

## 9. Handover notes
- Goal-tracker tasks **#1–13 ALL complete** (section 4 — shipped `d805e13`..`56dec4a`,
  each gated typecheck · 123 tests · lint, committed per item and pushed to deploy).
- **Next up: §5 REVIEW/FIX items** (none touched this session): WCAG accent contrast
  (`#D97757` ~3.1:1), canonical tags on `/buyer/sample*`, Playwright E2E + axe, styled
  domain-tooltip popover, `page.tsx` god-component extraction. Then §6 ACT (R4 ORS
  proxy before paid, pricing number, legal review, accounts service) + **D1 brand name**.
- Browser-verify caveat held all session: the MapLibre GL canvas rAF-throttles under
  automation, so map-pixel + synthetic-click checks are unreliable — DOM/report-panel
  text, computed styles and data-level checks were used instead (all passed).
- Decisions D1–D4: D2 per-report ✅, D3 buyers+agents ✅, D4 dignity+trust ✅;
  **D1 brand name still open**.

## 10. Code-review findings
Max-effort multi-agent review of `88b4ae2..HEAD` (this session's buyer/map work).
**Constraints HELD** — Buyer Mode not folded into scoring; static-export safe;
`withBase` used; every finding shows source or caveat; analytics env-gated. 5 findings:

| # | Finding | Severity | Status |
|---|---|---|---|
| R1 | `BuyerReportPanel` within-group amenity sort broke nearest-first — a closer later-category pin (e.g. 150 m bank) hidden behind 4 same-category pins | High (regression from flow-unify) | **FIXED** `29a7917` |
| R2 | `safety-context` claimed medium/LGA recorded-offence context for ~20 SA2s with null crime (overclaim) | Medium | **FIXED** `29a7917`; full LGA-number fallback = task #9 |
| R3 | `recomputePrecise()` (paid precise-walk) has no abort/staleness guard — pin moved during the in-flight ORS fetch overwrites with the wrong report | Medium (env-gated OFF in prod) | **FIXED** `da7bef8` |
| R4 | ORS API key client-exposed on prod activation (no proxy/rate-limit) | Medium (act before paid) | §6 ACT (Codex P1) — still open |
| R5 | `amenitiesNearIsochrone` exported + tested but unused by the app (can drift from `getNearbyAmenities`) | Low | **FIXED** `da7bef8` (removed) |
