# Handover — liveable.melbourne (working name "Northlight")

Pick-up doc for a fresh session. Pairs with `EXPANSION-PLAN.md` (multi-city) and
the user's memory notes (`~/.claude/.../memory/`). Supersedes the old
2026-05-31 handover.

---

## ⭐ START HERE — state at end of 2026-06-09 (everything below is LIVE on master)

A very large session. The whole original UX/bug list + the full Codex review + a
perf fix + the affordability reframe + a **self-hosted sun/shadow data pipeline**
are all shipped, gated, and deployed. Deploy is now **gated** (push to master →
`deploy-pages.yml`: tsc + lint + vitest + data:verify + build, plus a Playwright
**e2e** job, then deploy). 348 vitest + 12 E2E green.

### Shipped this session (highlights)
- **Perf:** the ~1-minute "Computing what's nearby" hang - the buyer report awaited
  the Vicmap parcel WFS (gov GeoServer, no timeout) inline. Now non-blocking + 8s
  cap (`lib/parcel.ts`, `app/(map)/page.tsx` buildReportFor). Renders in ~1-3s.
- **Sun = "build our own shademap" (DONE + live):** replaced the flaky live CoM API +
  public Overpass with **our own baked OSM building tiles**. `.github/workflows/
  bake-buildings.yml` (manual dispatch, osmium, ~3 min) → 2454 z14 tiles in
  `public/data/buildings/`; `SunShadowView` loads them via `lib/buildings.ts`
  `loadBuildingsNear`. Complete metro coverage, no live dependency. **Re-run the
  workflow to refresh OSM.** (Vicmap building_polygon was probed UNUSABLE - 32
  buildings/km2; OSM is the only complete source. See [[routing-and-sun]].)
- **Affordability reframe:** "Rent vs income" → **"Rent burden"** (label measures
  rent burden, not wealth) + a SEIFA "ranks X/10" disambiguation line in the income
  card. Score/weights untouched (`lib/domains.ts`, `lib/colors.ts`,
  `IncomeAffordabilityCard.tsx`).
- **Lots of UX:** hide-0%, LGA→"council area", PAO/SLO spelled out, **removed ALL-CAPS**
  (35 labels), pin-click POI vs pin-drop fix, precise-walk retry, compass rose on the
  sun view, bigger population trend chart + year axis, GM-relative context numbers,
  "In brief" area summaries, **straight-to-map onboarding** (retired `/welcome`),
  removed **rooftop solar** + **electorate** (stale 2022 data), beach ≤2km, tree-canopy
  trim, **/places MetricCard**: "GM" labels + bold median tick + IQR-trimmed scale.
- **Codex P0/P1:** the gated deploy above + 4 stale E2E fixed; geocode bbox widened;
  per-finding confidence/geography/source shown on screen; Canberra+Hobart added to
  EXPANSION-PLAN.md.

### NEXT STEPS (pending - in priority order)
1. **Finish "own our data" Phase 1** (same CI-bake pattern as the sun, proven): bake the
   per-pin gov-ArcGIS lenses so they become local lookups -
   **ANEF aircraft-noise** (`lib/aircraft-noise.ts`, static polygons = easiest), then
   **tree canopy / urban heat / waterway** (sample per-SA2 at build). Kills ~5 live deps.
   The runtime-dependency audit + roadmap is in this session's transcript + [[routing-and-sun]].
2. **Sun polish (optional):** tile payload is heavy (dense tile ~450KB; a pin loads 9) -
   radius-filter the load to ~300m or use smaller tiles. Suburban houses fall back to
   flat 6m (untagged) - needs more OSM `building:levels`.
3. **Codex review** is set up but **blocked on auth**: run `codex login`, AND fix
   `C:\Users\rafae\.codex\config.toml` line 4 `service_tier = "priority"` →
   `"fast"` or `"flex"` (invalid value breaks the config). Then `/code-review ultra` or
   a Codex pass over the diff.
4. **Live SERVICES** (routing/geocoding/basemap/air-quality) can't be baked → the thin
   **backend/proxy** on the paid-launch roadmap.

### REVIEW / VERIFY (eyeball on a normal browser tab)
- The **sun** across a few suburbs (Brunswick/Footscray/Dandenong) - should now show
  building massing + shadows reliably. Use the **Preview MCP** to verify WebGL, NOT
  Chrome MCP (it runs hidden + throttles) - see [[routing-and-sun]].
- **/places MetricCard** new scale/labels; the **"In brief"** summaries; **pin-click**
  on POI markers in a selected area (needs a real tap-test); the de-capped UI.

### Strategic / still open (your calls, unchanged)
Paid-launch trust layer (accounts, Stripe, report snapshots, backend, legal review,
WCAG 2.2 AA, mobile rebuild, support/trust pages) - none built; the gate before charging.
The **Northlight** name flip (on hold). **Sydney-first** multi-city per EXPANSION-PLAN.md
(Geoscape / cadastre / scope decisions parked).

---

## What this is
A Next.js 14 **static-export** MapLibre app: a choropleth of Greater Melbourne's
**361 ABS SA2 areas** across 7 scored "liveability" domains, plus a pin-level
**Buyer Location Check** (drop a pin / search an address → a due-diligence report).
Built **only on open government data** (CC BY etc.). Honest-by-design: context
data is never folded into the score; every figure is sourced + caveated.

- **Live:** https://rafaelvonhellmann.github.io/melbourne-liveability/
- **Repo root:** `C:\Users\rafae\OneDrive\Desktop\Analysis.au` (git on `master`)

## Build / test / deploy
- **Deploy = push to `master`** → GitHub Actions `.github/workflows/deploy-pages.yml`
  builds the static export and publishes Pages. Watch: `gh run watch <id> --exit-status`.
- **Gates (run before every commit):**
  - `node node_modules/typescript/bin/tsc --noEmit` (TSC=0)
  - `npx vitest run` (currently **346 tests**)
  - `npx eslint <files>`
  - `npm run data:verify -- --no-network` (source manifest; NOT in the deploy gate)
- **NEVER run `next build` locally** — OneDrive sync causes a random `.next` ENOENT
  race (infra, not code). CI builds fine.
- **Prefix bash with `rtk`** (token filter) — BUT `rtk npx ...` mangles `npx`; run
  data scripts as `npx tsx scripts/X.ts` (no rtk) or `npm run data:<name>`.
- **Commits** end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
  Commit/push only the files you touched (a past `git add -A` swept agent scratch).
- GitHub Pages can edge-cache HTML a few minutes; hard-refresh / cache-bust query
  when verifying a just-deployed change.

## Architecture you must know
- **Region scoping is ONE constant:** `GREATER_MELBOURNE_GCCSA = "2GMEL"`
  (`lib/crosswalk-types.ts`); ABS fetches filter `GCCSA_CODE_2021`. Each area
  carries a `region` field. → multi-city = parameterize this (see EXPANSION-PLAN.md;
  GCCSA codes 1GSYD/3GBRI/4GADE/5GPER/7GDAR).
- **Per-SA2 data pipeline:** `fetch-X.ts` → `data/raw` → `apply-X.ts` (read
  `data/generated/places.json`, join by `sa2Code`, write back) → `npm run data:geo`
  (copies places.json → `public/data/` + builds `places.geojson`). Manifest:
  `data/generated/sources.json` (+ `data:verify` gate). npm scripts: `data:*`.
- **Runtime "pin lookup" pattern (most v2 lenses):** `lib/<x>.ts` exports
  `fetch<X>(lng,lat,{signal})` → an ArcGIS/API **point query**, keyless, CORS-open,
  `timeoutSignal`, **never throws** (returns null). A `components/buyer/<X>Card.tsx`
  auto-fetches on mount and **omits itself off-coverage**. Cards render in
  `components/buyer/BuyerReportPanel.tsx`, gated `hasPin && variant !== "embedded"`.
  Pure parse/helpers are unit-tested.
- **Routing is KEYLESS by default** (no `NEXT_PUBLIC_ORS_API_KEY` on the deploy):
  public **OSM Valhalla** for isochrones/route; ORS auto-upgrades if a key is set.
  `lib/reachability.ts`, `lib/walk-isochrone.ts`, `lib/route-drive.ts` branch on the key.
- **The map** (`components/MelbourneMap.tsx`): MapLibre, CARTO positron basemap,
  YlGnBu/RdYlGn choropleth, lazy `pois.geojson` (only when a category is enabled),
  buyer pin marker, "No layer" mode (transparent fill). Big file — read before edits.
- **First visit redirects to `/welcome`** (onboarding scroll-story), remembered in
  localStorage, skipped on deep-links (`app/(map)/page.tsx`).

## Session 2026-06-09 — UX + Codex overhaul (shipped + DEPLOYED to master)
Worked the user's product-review list + the Codex review + expansion plan. 14 commits,
all gates green, deployed. Highlights:
- **Clarity:** hide 0% overlay shares; "LGA" → "council area"; planning-overlay codes
  spelled out on every mention (PAO/SLO…); removed ALL-CAPS (`uppercase` token) from 35
  eyebrow labels across 16 components.
- **Bugs:** sun works outside the CBD now (rotate Overpass **mirrors** w/ per-mirror
  timeout, `SunShadowView.tsx`); POI pins clickable in a selected area (10px buffered
  hit-test + skip the fly-to when the pin is already framed, `MelbourneMap.tsx`); precise
  walk reliable (retry + budget, `walk-isochrone.ts` — note: retry must re-fire on the
  internal *timeout*, which surfaces as `reason:"aborted"`; see the guard).
- **UX:** compass rose on the 3D sun view (`SunShadowView`); Population trend chart
  enlarged to fill its card; context numbers framed **relative to Greater Melbourne**
  (`gmRel`, `ContextPanels.tsx`); new **"In brief" area summary** (`lib/area-summary.ts`,
  honest/deterministic); **onboarding = straight to map** (retired the `/welcome`
  scroll-story → redirect; new dismissible `MapTip`; lens-picker kept).
- **Codex P0/P1:** **deploy is now gated** — `deploy-pages.yml` runs typecheck/lint/
  vitest/data:verify + a Playwright **e2e** job before publish; fixed 4 stale smoke tests;
  widened the geocode bbox to the full GCCSA; per-finding **confidence/geography/source**
  now shown on screen (`BuyerReportPanel`). EXPANSION-PLAN.md gained **Canberra + Hobart**.
- **Post-deploy review** (3 finder agents) caught + fixed: the walk-retry-on-timeout bug,
  a too-tight sun mirror timeout, an unguarded POI geometry cast, stale spacing, dead code.
- **Still open (the strategic calls):** the **paid-launch gates** Codex listed (accounts,
  Stripe, report snapshots, backend/proxy, legal review, WCAG 2.2 AA + mobile rebuild,
  support/trust pages) — none of that is built; it's the gate before charging money.

## Shipped (v2 build session, earlier)
**v2 data lenses (8, all live; runtime/keyless; honest caveats; context-only):**
- Environment: **urban heat** (`lib/urban-heat.ts`, CoolingGreening UHI18_M),
  **tree canopy** (`lib/tree-canopy.ts`, PERANYTREE), **rooftop solar**
  (`lib/solar.ts`, BoM climatology + estimate, cross-links the sun feature).
- Hazard/amenity: **aircraft noise/ANEF** (`lib/aircraft-noise.ts`), **waterway
  health** (`lib/water-quality.ts`, Melbourne Water HWS), **beach swim quality**
  (`lib/beach-quality.ts` + `scripts/fetch-beach-quality.ts` → `public/data/beach-quality.json`).
- Civic: **volunteering %** (`scripts/apply-civic.ts`, ABS G23, per-SA2 on the
  Equity tab + GM median), **electorate** (`lib/electorate.ts` + `scripts/fetch-electorate.ts`
  → `public/data/aec-divisions.json`; federal+state seat + 2022 margin at the pin).
- Regen: `npm run data:apply-civic`, `data:electorate`, `data:beach` (others are
  pure runtime, no build step).

**Fixes/features earlier this session:**
- **Sun feature**: fixed the page-freeze (replaced `turf.convex` with a hand-rolled
  monotone-chain hull in `components/buyer/SunShadowView.tsx`); added an **OSM
  Overpass building fallback** so it works beyond the City of Melbourne (e.g. Abbotsford).
- **Reachability ring** (isoportugal idea) — `lib/reachability.ts` + `ReachabilityCard`.
- **chartosaur design pass** — MetricCard plain-English verdict + Sparkline "better/worse".
- **No-layer** map option; **geocode/search** fix (suburb-ranked + auto-geocode for
  address-like queries — the "Abbotsford pin jumps to Kew" report; the coord was
  actually correct, the dropdown was luring to a fuzzy area); **POI toggle colour
  swatches**; removed the **"context only · not in score"** chips; **Equity tab
  Greater-Melbourne-median context** (`lib/benchmarks.ts` `computeGmContext`).

## Open items / decisions for YOU
1. **Product name** — "Northlight" planned but ON HOLD; app is name-agnostic
   (`lib/brand.ts` `PRODUCT_NAME`). To adopt: flip the constant + a few hardcoded
   titles/metadata. Domain `northlight.melbourne` availability unverified.
2. **Multi-city expansion** (Sydney/Brisbane/Adelaide/Perth/Darwin) — full blueprint
   in `EXPANSION-PLAN.md`. Decisions awaiting you: Geoscape licence (only way to get
   sun/3D heights outside Melbourne+Adelaide), pay for SA/WA cadastre (lot-size),
   launch scope/order (Sydney first recommended), ship Brisbane crime LGA-only?
3. **v2 skipped** (you accepted): **NBN** (only an unofficial unlicensed NBN Co API),
   **mobile coverage** (metro is ~uniformly covered → no signal).
4. **Sun in-app 3D** — ✅ VERIFIED (2026-06-08). Rendered full 3D massing + real
   cast shadows + "in shade" verdict at a CBD pin (`/?buyer=1&lat=-37.8136&lng=144.9631`,
   source = City of Melbourne surveyed heights) on a genuinely visible GPU tab via
   the **Claude Preview MCP** (`visibilityState=visible` + hardware WebGL, so rAF
   runs). The earlier stalls were the hidden Chrome-MCP tab throttling timers, not
   a code bug. Use the Preview MCP (not Chrome MCP) to re-check WebGL/rAF features.

## Gotchas / memory (also in ~/.claude memory files)
- **planning.vic WAF**: blocks Node/undici by TLS fingerprint; `scripts/lib/gov-fetch.ts`
  (curl) clears it. BUT `data.vic`, `plan-gis.mapshare.vic.gov.au` and ArcGIS-Online
  hosts respond fine to plain `fetch` — that's what the v2 lenses use.
- **Account session limits** hit the research workflows mid-run this session (agents
  returned a limit message); re-running after reset worked. Transient, not code.
- **Chrome MCP**: two browsers are connected (any browser action needs a device
  selection); MCP tabs often run `hidden` (timer throttling) + WebGL pages can time
  out CDP eval — prefer **Node** for endpoint/CORS checks where possible.
- **Excel dates** (EPA beach XLSX) come as serials — parse with `cellDates:true` or
  convert `(serial-25569)*86400000`.

## Suggested next steps (pick per the user)
- Decide the **name** + wire it (small).
- Start the **expansion** with **Sydney** (richest open data) per EXPANSION-PLAN.md §6.
- Optional polish: surface a couple of v2 lenses on the **/places SA2 page** too
  (currently buyer-pin only, except volunteering which is on the Equity tab).
- One day of live QA on a focused browser (sun 3D + the v2 cards across a few pins).

_Last updated: end of the v2 build session. 346 tests green; tree clean; all pushed._
