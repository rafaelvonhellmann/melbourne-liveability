# Master Plan & Handover — liveable.melbourne / Buyer Check

Single source of truth to **start a new session**. Covers what is shipped, what
is pending (build / review / act), the backlog, the file map, how to run, and
the gotchas. A `## Code-review findings` section at the end is filled after the
review pass.

---

## ⭐ START HERE — autonomous build mandate (HEAD `aeb64ea`, tree clean)

**Your job this session: keep building the Goal board (G1–G12) below until it's done.**
Founder's instruction, verbatim intent: *"set it as a goal and build everything that is
pending; if you hit a problem, come to me for a direction — otherwise don't stop."* So:

- **Do NOT checkpoint or stop to report progress.** Gate → commit → push → next item, repeat.
- **Only message the founder for a genuine direction-decision** (a real fork, a source that
  doesn't exist, an ethics/dignity call). Not for progress updates.
- **Gate every item:** `npm run typecheck` · `npm test` (vitest) · `npm run lint`. Commit per
  item (trailer below). Push = auto-deploy (GitHub Pages).
- **Verify via CI, not the local dev server.** Repo lives in OneDrive; `.next` gets locked
  mid-build/HMR → local `next dev` serves stale/broken bundles, `next build` flakes. CI is
  clean — `gh run watch <id>` on deploy-pages is the authoritative build check. To use the
  dev server, `rm -rf .next` first. The MapLibre GL canvas also rAF-throttles under
  automation, so verify map features via DOM/data/CI, not screenshots/synthetic clicks.
- **Never fabricate data.** Find an authoritative source, fetch, sanity-check; if no clean
  source exists, FLAG it (don't invent coordinates/values). See the Big Build curated set +
  the data-audit for the pattern.

**Do NOT build (out of scope):** the §6 "founder calls" (brand name, pricing, legal/ODbL,
accounts/payment) · **national expansion** · **welfare/Centrelink-% per area** (dignity — use
social-housing *supply* instead, same reason we dropped ethnicity %).

### Goal board
| # | Item | Status | Class / how |
|---|---|---|---|
| G1 | "Show 15-min walk" button + bold radius | ✅ `0766c7b` | — |
| G4 | Sun & aspect finding (lib/sun.ts) + remove ShadeMap | ✅ `1c2fc0a` | — |
| G5a | Data completeness audit + drop NDIS | ✅ `5827f0d` | `npm run data:audit` → `data/generated/data-audit.json` |
| G6 | Colourblind-safe ramp toggle | ✅ `4438123` | RdYlBu (red=worse→blue=better) toggle on map+legend; persisted pref; LayerToggle "Display". Report swatches stay default. |
| G8 | "Find areas like this" multi-criteria filter | ✅ `169d24e` | `lib/similar-areas.ts` equal-weight per-domain % similarity; profile "Areas like this" (precomputed) + map card expandable. |
| G12a | Cyclability radius around the pin | ✅ `bfd04b6` | ~15-min bike ring (3.5 km, teal) + area cycle-infra index in the buyer panel. |
| G3 | Community amenities (worship + community centres) | ✅ `00ff0c8` | Overpass → 1,160 worship + 513 community/cultural pins; buyer "Community & culture" group. `npm run data:community-poi` |
| G2 | Social-housing **supply** layer | ✅ `65891a1` | ABS Census G37 landlord-type → `context.socialHousing` (public+community %); profile panel. `npm run data:social-housing` then `data:apply-social-housing` → `data:geo`. **Map context-layer still TODO.** |
| G5b | Police (VicPol) + childcare (VIC) authoritative | ✅ `c5482e5` | Vicmap FOI replaces OSM: police 125→98 (official), childcare 1,198→3,694. Per-category buyer attribution. `npm run data:vic-facilities` then `data:poi`. |
| G9 | Deeper indicators | 🟡 partial `aeb64ea` | **DONE:** rent + mortgage stress → `context.housingStress` (ABS G9.. stress %). **TODO:** DFFH vacancy, journey-to-work mode share, train-station distance (separate sources). |
| G10 | School catchments + primary/secondary split | ⬜ | research-gated (official zone boundaries — findmyschool.vic / DET) |
| G11 | Zoning/heritage/parcel overlays + parcel-level hazard | ⬜ | research-gated (VicPlan — same Vicmap_Planning service as the shipped bushfire/flood overlays; add HO heritage + zone layers) |
| G12b | Fuller LXRP-110 set + Big Build map pin-layer | ⬜ | research-gated. Pin-layer = pure code (data in `data/generated/major-projects.json`, 11 stations). LXRP-110 set needs a clean source. |
| G7 | axe a11y audit (Playwright) | ⬜ | blocked: needs a clean local env (OneDrive lock) |

Suggested order for the next session: **G11 zoning/heritage** (same Vicmap_Planning pattern as the shipped hazards — most tractable) → **G12b pin-layer** (pure code) → **G10 catchments** / remaining **G9** indicators. G7 when the local env is clean.

**Context-layer pattern (proven this session, reuse for more ABS/DFFH context):** dedicated `fetch-*.ts` → raw → `apply-*.ts` reads `data/generated/places.json` + injects `place.context.X` (mirror `apply-social-housing.ts` / `apply-housing-stress.ts`), PLUS the same compute inlined in `normalize.ts` for durability, then `data:geo`. ALWAYS verify with the HEAD-diff script (domainsChanged must be 0 — context never touches the locked composite). Sanity-check values vs ground truth before committing.

### Decisions already made (do NOT re-litigate)
- Score ramp = continuous **red→green** (worse=red); G6 adds a colourblind toggle *on top*.
- "Rental affordability" → **"Rent vs income"**. Priority sliders hold **raw** weights (label = share-of-score). Pharmacy is in **Health**. Layer tooltips don't name sources (→ methodology).
- Sun-aspect is **proprietary** (`lib/sun.ts`); ShadeMap removed (liability).
- **NDIS dropped** from the report (OSM has 3 across Melbourne); map pin category kept.
- Social housing = **supply** (Census landlord-type + OSM points), NOT welfare-%.
- Community signal = **amenities** (places of worship of all faiths + community/cultural centres), NOT demographics.
- Lens picker = curated 6 (Balanced / Renting / Buying / Family / Retiree / Data quality).

### Conventions / gotchas
- `rtk` prefixes shell commands (token filter) but **breaks `npx` as a prefix** — use `npx … | rtk cat`, never `rtk npx …`.
- Data scripts: `npx tsx scripts/<x>.ts`. Offline data rebuild for data items: `data:normalize` → `data:score` → `data:geo` (reads `data/raw/*`, gitignored but present locally; avoid network `data:hazards`/full `data:fetch` unless needed).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- ~138 vitest tests. Hard constraints (§2) unchanged: static export only · Buyer Mode never scored · never overclaim/fabricate · every finding sourced + caveated · sub-path safe (`withBase`).

---

## 0. TL;DR
- **What:** static (no-backend) Next.js map of Greater Melbourne liveability +
  a **Buyer Location Check** (drop/search a location → sourced, caveated
  due-diligence report before you offer). Buyer-first product.
- **Live:** https://rafaelvonhellmann.github.io/melbourne-liveability/
- **Repo:** github.com/rafaelvonhellmann/melbourne-liveability (HEAD `5827f0d`)
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

## 5. REVIEW / FIX + polish — mostly shipped (`d0c2d5d`..`45d3964`)
Shipped (gated typecheck · 130 tests · lint; CI build green):
- ✅ **Canonical tags** `/buyer/sample` → `/buyer/sample-report` (`b22e411`, Codex P3).
- ✅ **Domain tooltip** → styled, keyboard-accessible explainer box (`de75175`).
- ✅ **CI** data-refresh.yml actions `v4`→`v6` (`d0c2d5d`); deploy-pages already `v6` (`21fa9c6`).
- ✅ **Bushfire + flood hazard risk layers** (`a946e3d`) — overlay-share choropleths,
  Reds ramp, off by default, never scored. **Ramp + bands (2/10/25/50%) are a first
  pass — review/tune.**
- ✅ **WCAG AA contrast** (`046fef9`, Codex P2) — accent deepened #D97757→**#AD4F2E**
  (focus #9C4221) to clear 4.5:1 as text + white-on-fill. **Brand reads a touch deeper;
  the two hex values are tunable (keep ≤#AD4F2E on light to stay AA).**
- ✅ **Buyer-restore E2E** (`7ff7684`) — Playwright spec for `?buyer=1&lat&lng`.
- ✅ **Infrastructure MVP** (`45d3964`) — "major project nearby" buyer finding from a
  curated VIC Big Build set (Metro Tunnel ×5 + SRL East ×6), coords resolved via OSM
  Nominatim + sanity-checked (`scripts/build-major-projects.ts` →
  `data/generated/major-projects.json`). Factual, sourced, NOT price prediction. A map
  pin-layer can follow.

Still open:
- **axe a11y audit** (Playwright) — un-addable blind here: Playwright's webServer is the
  OneDrive-corrupted `npm run dev`, E2E isn't in deploy CI, and axe needs iterative fixing
  against a live run. Do it in a clean local env. [Codex P1.]
- **`page.tsx`** (~950 lines) — extract `useBuyerMode`. **Deferred on purpose:** refactoring
  the core buyer flow (no unit coverage; only the corrupted dev server verifies it) blind is
  the wrong risk. Do once OneDrive `.next` is clean. [optional]
- **Community amenities** — founder GREENLIT reshaping "community" to amenities (places of
  worship of all faiths, community/cultural centres as a POI category), NOT demographics.
  Next build item.
- **OneDrive `.next` HMR lock** can corrupt the *local* dev server mid-edit (stale
  bundle, false "hooks order" errors). CI/prod unaffected. Fix: stop OneDrive, `rm
  -rf .next`, `npm run dev`. See [[onedrive-next-build-race]].

## 5b. Strategy discussed (this session) — decisions/notes
- **Lens merge:** founder chose the curated buyer-first 6 (`56dec4a`).
- **Demographics (religion/nationality/migration):** recommended AGAINST per-ethnicity
  percentages (steering risk, conflicts with `DIGNITY-STANDARD.md`). **Founder GREENLIT**
  the amenities reshape instead — places of worship of all faiths + community/cultural
  centres as a POI category. Next build item (see §5).
- **Legal/copyright:** OSM ODbL share-alike on the derived geojson is the one to watch;
  AU has no sui-generis DB right so the open data is inherently copyable — moat = brand
  + methodology + report UX + gated paid features. Folds into §6 legal review.
- **Council/infra contracts (analisa.pt-style):** raw procurement isn't geocoded.
  **MVP SHIPPED** (`45d3964`) as a buyer finding from a curated, OSM-resolved Big Build
  station set (§5). A fuller LXRP-110 set + a toggleable map pin-layer remain if wanted.

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
