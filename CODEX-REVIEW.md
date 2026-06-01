# Codex Review Handover — liveable.melbourne

A second reviewer (Codex) is asked to review **everything built so far** —
code, content/copy, UX, accessibility, and "to people" (honesty + non-stigmatising
language). This file is the entry point: read it first, then work top-to-bottom
through the file map. You do not have the build conversation; everything you need
is here.

---

## 0. TL;DR for the reviewer

- **What it is:** a free, static (no-backend) Next.js map of Greater Melbourne
  liveability built only from open government + OpenStreetMap data, plus a
  **"Buyer Location Check"** — a second-opinion, sourced due-diligence layer for
  property buyers (drop a pin → screening report).
- **Most recent + highest-priority work to review:** the **Buyer Check v2**
  findings engine + report (commit `0581ed8`), the gated **data rebuild**
  (`5980054`, lit up Year-12), and a **CI actions bump** (`21fa9c6`).
- **Repo:** github.com/rafaelvonhellmann/melbourne-liveability
- **Live:** https://rafaelvonhellmann.github.io/melbourne-liveability/
- **Stack:** Next.js 15 App Router, `output: "export"` (fully static), MapLibre
  GL, Tailwind, vitest + Playwright. Data pipeline = `tsx` scripts producing
  committed JSON/GeoJSON.

## 1. Hard product/architecture constraints (do not regress)

These are non-negotiable; flag any violation as a bug:

1. **Static export only.** No backend, server actions, API routes, DB, auth, or
   payment provider. No Node-only runtime deps in client code. Everything is a
   client-side or build-time computation over committed static files.
2. **Buyer Mode is a context lens, never scored.** The liveability composite must
   not include buyer/walk/cyclability/hazard-context as a weighted input.
3. **Not advice.** No financial / property / legal / insurance / planning advice
   claims. Language is "risk indicator", "verify with council/conveyancer/
   insurer". Every finding shows source + freshness + geographic precision +
   confidence + a caveat.
4. **Never invent data.** Missing datasets (price, school catchments, parcel-level
   overlays) are shown as "not available yet" / `unavailable` / `verify`, never
   fabricated.
5. **Sub-path hosting.** Runtime asset URLs go through `withBase()` (lib/asset-path.ts)
   because GitHub Pages serves under `/melbourne-liveability`.

## 2. How to run the gates

```
npm run dev          # local dev (http://localhost:3000)
npm run typecheck    # tsc --noEmit
npm test             # vitest (97 tests as of handover)
npm run lint         # eslint .
npm run build        # next build -> static export to out/
```

Baseline at handover: **typecheck clean, lint clean, 97 unit tests pass, build
emits 370 static pages.**

**OneDrive build caveat (environment, not code):** the repo lives in a OneDrive-
synced folder. `next build` can fail at *"Collecting build traces"* with
`ENOENT ... .next/server/app/_not-found/page.js.nft.json` because OneDrive moves
`.next` files mid-build. That step is irrelevant to `output: export`. Fixes:
pause OneDrive for the build (`Stop-Process -Name OneDrive`), or rely on
typecheck + the `out/` that gets produced. CI (GitHub runners) is unaffected.

**Map render under automation:** a controlled/headless browser tab shows a blank
MapLibre canvas (no choropleth/tiles) because background tabs get
`requestAnimationFrame`-throttled, stalling MapLibre's GL render loop. This
reproduces on production too and is **not** a code bug — verify the map in a
normal, focused browser tab.

---

## 3. File map (review targets)

### 3a. Buyer Check v2 — REVIEW PRIORITY (new/changed this cycle)

| Path | What it is | Review for |
|---|---|---|
| `lib/buyer-report.ts` | **The findings engine.** `buildBuyerReport()` (deterministic rules → typed findings), `getNearbyAmenities()`, `findContainingSa2()`, types. | Rule thresholds (65/45/70/30 percentile, 50% bushfire / 10% flood), determinism, no-invented-data, the `accessMode` straight/precise switch, off-coverage handling. |
| `lib/source-manifest.ts` | Maps committed `data/generated/sources.json` → `BuyerSourceRef`. | `normaliseSourceRefs`, `formatSourceDate`, no faked attribution. |
| `lib/walk-isochrone.ts` | **Paid-tier** street-network walk isochrone (OpenRouteService), env-gated. `amenitiesNearIsochrone`, `fetchWalkIsochrone`, `parseOrsIsochrone`, `isPreciseWalkConfigured`. | **SECURITY: `NEXT_PUBLIC_ORS_API_KEY` is exposed client-side** (documented; needs a proxy for prod). Failure handling, static-export safety. |
| `lib/buyer-location.ts` | Pure geometry: `haversineKm`, `pointInPolygon` (holes + MultiPolygon), `findSa2ForPoint`, `amenitiesNear`. | Ray-casting correctness, dependency-free. |
| `lib/share-url.ts` | URL state incl. new `buyer` + `pin` params (GM-bbox validated). | Param round-trip, bbox rejection of junk/out-of-region pins. |
| `components/buyer/BuyerReportPanel.tsx` | **The report UI** — 8 sections + Print/Save-PDF, Copy-share-link, Clear-pin. | A11y (headings, button labels, focus), confidence/geography labelling, print isolation (`.buyer-print-root`), the `variant` prop. |
| `components/buyer/SampleReportPage.tsx` | Shared server component behind `/buyer/sample-report` + `/buyer/sample`. | Build-time fs reads, "sample only" framing. |
| `components/buyer/BuyerHereCard.tsx` | Profile "Buying here?" card — area-level (`mode:'sa2'`) report on demand. | Lazy POI fetch, the area-level disclaimer. |
| `app/(map)/page.tsx` | Map page — buyer mode state, pin drop, `?buyer=1&lat&lng` restore, URL sync, env-gated precise-walk recompute. | Restore effect (one-shot guard), `router.replace` churn, the `sa2-fill`-click dependency for live drops, no infinite re-render. |
| `app/(map)/layout.tsx` | Suspense fallback = indexable buyer hero (pre-hydration SEO). | Crawlable content, links. |
| `app/buyer/page.tsx` | Buyer landing — 3 cards, 3 CTAs, trust copy. | Content/copy, heading order, link targets. |
| `app/buyer/sample-report/page.tsx`, `app/buyer/sample/page.tsx` | Canonical + legacy sample routes (re-export shared page). | Duplicate-content/SEO (no canonical tag yet — flag). |
| `app/globals.css` | Added `@media print` block isolating `.buyer-print-root`. | Print correctness across the fixed map shell. |
| `tests/buyer-report.test.ts`, `tests/walk-isochrone.test.ts`, `tests/share-url.test.ts` | Unit coverage for the above. | Coverage gaps, edge cases. |
| `components/PlaceProfileClient.tsx` | Profile page; now embeds `BuyerHereCard`. | Integration only (large file — the card insert is near the score hero). |
| `lib/methodology-reference.ts` | 1-line note on free vs paid walk access. | Accuracy. |
| `BUYER-MODE-DRAFT.md` | Strategy draft (incl. precise-walk §10). | Context only, not shipped UI. |
| `.github/workflows/deploy-pages.yml` | CI bumped to Node-24 actions (checkout@v6, setup-node@v6, upload-pages-artifact@v5, deploy-pages@v5). | Version validity (verified to exist), build/deploy steps. |

### 3b. Core libraries (`lib/`) — supporting review

- `types.ts` — all shared types (`Place`, `DomainScore`, `PlaceContext`, etc.).
- `scoring.ts`, `weights.ts`, `domains.ts` — the liveability composite + default weights + domain metadata. **Confirm buyer context is NOT folded into scoring.**
- `benchmarks.ts`, `home-buyer.ts`, `data-coverage.ts` — derived percentile/benchmark/coverage logic.
- `colors.ts`, `poi-categories.ts`, `map-expressions.ts` — palettes + MapLibre paint (note: choropleth ramp must stay separate from categorical POI palette).
- `walk-access.ts`, `cyclability.ts` — context-only 15-min-access + cycle indices (never scored).
- `crosswalk.ts` / `crosswalk-types.ts`, `suburb-normalize.ts`, `region.ts`, `search.ts` — SA2/suburb resolution + search.
- `places-data.ts`, `use-places.ts`, `use-map-personalisation.ts`, `user-prefs.ts` — data loading + client state + localStorage prefs.
- `timeseries.ts`, `metric-catalog.ts`, `sources.ts`, `poi-feature.ts` (has an XSS-guard `safeHttpUrl`), `asset-path.ts`, `interest-views.ts`, `personas.ts`.

### 3c. Components (`components/`) — UX + a11y review

Map shell + controls: `MelbourneMap.tsx` (the GL map; pin/marker logic),
`LayerToggle.tsx`, `MapLegend.tsx`, `SearchBox.tsx`, `MobileSheet.tsx`,
`BottomSheet.tsx`, `OnboardingModal.tsx`, `Attribution.tsx`,
`SelectedSummaryCard.tsx`, `ResultsList.tsx`, `ShareViewButton.tsx`,
`DomainSliders.tsx`, `PersonaPresets.tsx`, `InterestViews.tsx`,
`ShortlistPanel.tsx`, `AddToShortlistButton.tsx`, `RecentlyViewed.tsx`,
`ProfileEngagement.tsx`, `FeedbackButton.tsx`.
Profile/data cards: `PlaceProfileClient.tsx`, `MetricCard.tsx`,
`ScoreVisuals.tsx`, `ScoreBreakdownPanel.tsx`, `ContextPanels.tsx`,
`DataConfidenceCard.tsx`, `DataCoverageCard.tsx`, `WalkAccessPanel.tsx`,
`CyclabilityPanel.tsx`, `HomeBuyerCard.tsx`, `SourceDrawer.tsx`,
`Sparkline.tsx`, `StalenessBadge.tsx`, `SiteFooter.tsx`.

### 3d. Routes (`app/`)

`(map)/page.tsx` (the map), `places/[slug]/page.tsx` (profile, SSG),
`compare/page.tsx`, `methodology/page.tsx`, `pricing.tsx`, `account`, `alerts`,
`buyer/*`, legal (`privacy`, `terms`, `disclaimer`), `error.tsx` +
`global-error.tsx`, `sitemap.ts`, root `layout.tsx`.

### 3e. Data pipeline (`scripts/`) — correctness/provenance review

`build.ts` orchestrates: `build-crosswalk` → `precompute-gtfs` → `fetch-hazards`
→ `normalize` → `score` → `build-geo` → `build-poi` → `build-timeseries` →
`hash-sources`. Fetchers: `fetch.ts`, `fetch-indicators.ts`, `fetch-crime.ts`,
`fetch-hazards.ts`. Helpers in `scripts/lib/` (`arcgis-fetch.ts` has Overpass
retry/backoff; `poi-classify.ts`; `proximity.ts`; `sa2-overlay-pct.ts`;
`cyclability-compute.ts`). Output committed to `data/generated/` + `public/data/`.
Provenance manifest: `data/generated/sources.json`.

### 3f. Config + docs

`next.config.ts` (basePath/assetPrefix via `NEXT_PUBLIC_BASE_PATH`),
`eslint.config.mjs` (ignores `.next`/`out`), `tsconfig.json`,
`playwright.config.ts`, `package.json`. Docs: `README.md`, `DESIGN.md`,
`HANDOVER.md`, `ULTRAPLAN.md`, `BUYER-MODE-DRAFT.md`,
`analisa_pt_information_architecture.md`.

---

## 4. Review checklist by dimension

**Code / correctness / security**
- Static-export purity (no server/runtime-fs/secret leaks in client paths).
- `NEXT_PUBLIC_ORS_API_KEY` client exposure in `walk-isochrone.ts` — acceptable
  for an opt-in prototype? Recommend the proxy path?
- `buildBuyerReport` determinism + finding thresholds: are they defensible, or
  arbitrary? Any way a finding could mislead?
- Geometry correctness (`pointInPolygon` holes/MultiPolygon; haversine).
- Buyer context genuinely excluded from `scoring.ts`.
- URL param validation (`share-url.ts` bbox) — injection / bad-input safety.
- `poi-feature.ts` `safeHttpUrl` XSS guard — still sound?

**Content / copy**
- Is every buyer claim sourced + caveated? Any sentence that reads as advice?
- Landing copy (`app/buyer/page.tsx`) + report copy (`BuyerReportPanel.tsx`) +
  methodology accuracy.
- "Sample only" framing on `/buyer/sample-report`.

**UX**
- The drop-a-pin flow, mode toggle, clear/print/share actions, restore-from-URL.
- Mobile (the `MobileSheet`), the report on a phone.
- Empty/edge states (pin outside coverage, no amenities, missing crime data).

**Accessibility**
- Headings hierarchy, landmark roles, button vs link semantics, focus order +
  visible focus, keyboard operability of the map mode + report actions.
- Colour contrast (Tailwind tokens), the confidence/severity badges, the
  choropleth + categorical POI palettes (colour-blind safety).
- `aria-*` on the map controls; the print output.

**"To people" (honesty + dignity)**
- Non-stigmatising language in `Community & census context` (renter/tenure/SEIFA)
  — confirm it never reads as a judgement of an area or its residents.
- The not-advice framing is prominent and unavoidable.

---

## 5. Known caveats / things to scrutinise (author-flagged)

1. **ORS key client exposure** (walk-isochrone.ts) — documented; prod needs a
   key-hiding proxy. Feature is env-gated off when no key is set.
2. **Straight-line distance** for "nearby" on the free tier overstates real
   walking access (caveated in copy). Precise tier uses the ORS isochrone.
3. **`/buyer/sample` and `/buyer/sample-report` render identical content** — no
   `<link rel="canonical">` yet (possible duplicate-content SEO; intentional to
   keep the older URL alive without a runtime redirect under static export).
4. **Live pin-drop vs restore**: the live map *click* path depends on the
   `sa2-fill` layer being painted; it was verified via the URL-restore path
   (same `buildBuyerReport`) because the automated browser throttled the GL
   render (see §2). Worth a human click-through in a focused tab.
5. **Commit hygiene:** the `components/BuyerReport.tsx` deletion landed in the
   `ci(pages)` commit (`21fa9c6`) rather than the feature commit — cosmetic.
6. **Crime/Safety shows "—" for some SA2s** (no LGA data) — intentional honesty,
   confirm it reads clearly.
7. **Deferred (out of scope for this review's "is it done" bar):** Part 6
   multi-criteria "Find areas like this" filter — not built (explicitly optional).

## 6. Suggested output from the review

A prioritised list (P0 blocker → P3 nice-to-have) of bugs / content / UX / a11y
issues, each with file:line and a concrete fix suggestion. Verify against the
constraints in §1 — a "fix" that adds a backend or folds context into the score
is itself a regression.
