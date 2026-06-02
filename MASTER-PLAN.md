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
- **Repo:** github.com/rafaelvonhellmann/melbourne-liveability (HEAD `0a2c375`)
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

## 4. PENDING — BUILD (open tasks)
| # | Item | Notes |
|---|---|---|
| 7 | **Full-address geocode → exact pin** | Nominatim/OSM, client-side, free, rate-limited, attributed. Keep suburb/SA2 + map-click fallbacks. Static-safe. |
| 9 | **Crime LGA-fallback + caveat** | When an SA2 has no crime (e.g. Brunswick East "—"), report the LGA-level recorded offences with a caveat instead of "—". Needs LGA crime available to the report engine. |
| 11 | **Compare: search + neighbour + adjacency caveat** | Compare search → "Search where you want to live"; identify/list the area; if a pin is near an SA2 border (another area's centroid within ~15 min), recommend checking the adjacent area(s). |
| 8 | **Collapsible sidebar + merge interest/persona + mobile parity** | Toggle the right panel; merge InterestViews + PersonaPresets into one "Lens"; remove ranked Results tab + Recently-viewed on mobile (desktop done); surface the layer system more clearly. |
| 10 | **Parks dedupe / green-%** | Multiple park pins look like the same park (OSM splits geometry). Dedupe nearby same-name park pins and/or report green space as % of SA2 area. Verify OSM park geometry first. |
| 12 | **ShadeMap link + retention** | "Check sunlight/aspect" verify-action deep-linking shademap.app at pin lat/lng. Retention (localStorage): saved checks, persistent pre-offer checklist, "your areas". Cross-device = needs accounts service. |

## 5. PENDING — REVIEW / FIX (open quality items)
- **WCAG contrast** — accent `#D97757` ~3.1:1 on light (needs 4.5:1). Darken
  accent text/links or dark text on filled buttons. [Codex P2 — NOT yet fixed.]
- **Canonical tags** on `/buyer/sample` vs `/buyer/sample-report` (dup content). [Codex P3.]
- **Playwright E2E + axe** for the buyer flow (pin/search-restore/print/keyboard)
  + a11y audit. [Codex P1 — not added.]
- **Domain tooltip** is native `title`; upgrade to a styled popover.
- **`page.tsx` size** (~800 lines, god component) — extract `useBuyerMode`. [optional]
- Browser-verify the unified flow + radius in a focused tab (automation throttles GL).

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
- Goal-tracker tasks #1–6 complete; **#7–#12 pending** (section 4). Work
  autonomously, gate each (typecheck · tests · lint), commit per item, push to
  deploy.
- Next up was **#7 (geocode) + #9 (crime LGA-fallback)**.
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
| R3 | `recomputePrecise()` (paid precise-walk) has no abort/staleness guard — pin moved during the in-flight ORS fetch overwrites with the wrong report | Medium (env-gated OFF in prod) | task #13 |
| R4 | ORS API key client-exposed on prod activation (no proxy/rate-limit) | Medium (act before paid) | §6 ACT (Codex P1) |
| R5 | `amenitiesNearIsochrone` exported + tested but unused by the app (can drift from `getNearbyAmenities`) | Low | task #13 |
