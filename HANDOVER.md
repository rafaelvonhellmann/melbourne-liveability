# Handover — liveable.melbourne (working name "Northlight")

Pick-up doc for a fresh session. Pairs with `EXPANSION-PLAN.md` (multi-city) and
the user's memory notes (`~/.claude/.../memory/`). Supersedes the old
2026-05-31 handover.

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

## Shipped this session (recent → older)
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
4. **Sun in-app 3D** — verify on a normal focused tab once. The code/freeze-fix/CORS
   are sound; an automated browser tab runs `hidden`, which throttles timers so the
   load stalls only in those checks (a real visible user gets shadows in <1s).

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
