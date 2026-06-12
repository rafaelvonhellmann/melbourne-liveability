# Fable Execution Plan (2026-06-12)

THE master sequenced plan. Fable fast sessions execute top to bottom; waves are
dependency-ordered, not calendar-dated. Build as fast as possible. Region data detail lives in
NATIONAL-ROLLOUT.md; this doc is the work queue.

## Locked founder decisions (2026-06-12)

- Tier-B region order: Brisbane -> Perth -> Sydney -> Adelaide -> Hobart -> Darwin.
  BOCSAR (Sydney crime) may jump the queue into any idle session - it is ~1-2 sessions and best-in-country.
- Basemap: self-host path. Step 1 OpenFreeMap hosted (free, commercial OK, no key); step 2 true
  self-host (PMTiles on R2) at Cloudflare cutover.
- Buildings at scale: inner-ring tiles per region NOW (budget ~30-50 MB/region); migrate all
  building tiles to R2 at domain cutover.
- Regions become URL paths (/brisbane/...) for SEO; ?region= stays as redirect compat.
- TAS/NT safety: run a real data hunt BEFORE accepting "not scored" card. Honest card is the
  fallback, never a silent proxy.

## Explicitly parked (do NOT work on these)

- Pricing/monetization copy + Stripe go-live: founder still deciding price. Leave landing $39
  band and /pricing as-is. Backend CODE may still be written (Wave P3) - just no deploy, no copy.
- festra.au cutover, repo/package rename: gated on ABN/registrar. Prep allowed, no cutover.

---

## Wave 0 - Tier-A presence (CI does the work, zero code)

Dispatch data-refresh per region, sequentially, each followed by SHA-watched deploy + verify-live:
Brisbane -> Perth -> Adelaide -> Hobart -> Darwin.
- Status: Brisbane dispatched 2026-06-12. Fire next as each lands.
- When Darwin lands: flip landing honesty line to "all 8 capitals" (1 small PR).
- Acceptance per region: places.{r}.json on master, area count sane (Bris ~290, Per ~145,
  Adel ~125, Hob ~50, Dar ~30), switcher flips, prod probe 200.

## Wave 1 - Fix pack (1-2 sessions, can run while bakes cook)

1. Reduced-motion landing bug: components/Landing.tsx:99-105 - show static frame + CTA instead
   of disabling landing. Test: e2e with reduced-motion emulation.
2. SearchBox: geocode error visible ("address not found - try a suburb"); geocode on submit only
   (Nominatim ToS), not per keystroke. components/SearchBox.tsx.
3. A11y pack: skip link past landing/scroll story; aria-live="polite" on async status
   (BuyerHereCard "Generating...", search status); <label> on feedback email input
   (components/FeedbackButton.tsx).
4. OG image: one branded map-card image, wired in app/layout.tsx metadata.
5. Dead code: delete components/BottomSheet.tsx, lib/region.ts (legacy; lib/regions.ts is
   canonical), lib/personas.ts per FABLE-ULTRAPLAN P1-11 (includes consumer refactor).
6. Supply chain: xlsx 0.18.5 -> CDN 0.20.3 tarball or exceljs (P0-2); dedupe adm-zip/unzipper to one.
Acceptance: full gates green, Melbourne byte-identity preserved.

## Wave 2 - Tier-B infrastructure (unlocks every region; ~4-5 sessions)

1. Crime adapter interface: scripts/normalize.ts:301-310 - replace IS_VIC branch with per-state
   adapter registry { sourceId, geography (suburb|lga|none), fetch, join }. VIC becomes adapter #1.
2. Hazards adapter interface: same pattern for normalize.ts:509-607 (bushfire/flood overlay pct).
3. GTFS generalization: scripts/precompute-gtfs.ts beyond PTV; consume stateSources.gtfsUrl from
   lib/regions.ts. Feeds: Translink, Transperth, Adelaide Metro, TfNSW (big - watch memory),
   Metro Tas, NT DLI. Output region-suffixed bus-stops + frequency.
4. Per-region sources.json: scripts/hash-sources.ts:78-86 - drop DEFAULT_REGION-only guard,
   emit sources.{region}.json; trust drawer reads region manifest.
5. Per-region report-tiles: bake-report-tiles.ts parameterized by region (pin reports currently
   Melbourne-only). Budget check per region before commit.
6. Per-region e2e: smoke spec per live region (?region= load, choropleth paints, report opens),
   wired into deploy gates + verify-live.
7. Canberra crime quick win: dataACT/ACTmapi suburb crime adapter -> Canberra 6/7. (1 session,
   proves the adapter interface end-to-end before Brisbane.)
Acceptance: Canberra shows safety scored; all existing regions rebake clean; coverage gate per region.

## Wave 3 - Brisbane Tier-B (~4-6 sessions)

- Crime: QPS open data (data.qld.gov.au) - LGA monthly CSVs + crime-locations 5yr point data.
- Hazards: QLD bushfire SPP (QSpatial) + Brisbane City flood awareness; note Greater Brisbane =
  BCC + Moreton Bay + Logan + Ipswich + Redland schemes.
- GTFS: Translink via Wave-2 generalization.
- Zoning context: BCC City Plan shapefile (context layer only).
- Buildings: first non-Melb bake-buildings run, inner-ring budget (generalize bake-buildings.yml
  to Geofabrik state extract + region bbox + ring clip).
- Skip: beach card (no statewide program).
Acceptance: Brisbane 7/7 domains, pin reports live, sun view inner-ring, e2e green.

## Wave 4 - Perth Tier-B (~4-5 sessions)

- Crime: WA Police suburb pages scraper (~1,700 localities, cached, monthly; bulk XLSX is
  district-only). Build polite + resumable.
- Hazards: DFES bushfire prone areas + flood mapping.
- GTFS: Transperth. Buildings: inner ring.
- Schools: stays proximity-based (catchments are per-school PDFs - do NOT hand-digitise).
- Bonus (separate, optional session): City of Perth open 3D model (7.5cm, Cesium tiles, CBD LGA)
  sun-shadow showcase - marketing asset.

## Wave 5 - Sydney Tier-B (~5-7 sessions)

- Crime: BOCSAR suburb monthly CSV/API (may have already jumped queue).
- Hazards: ePlanning EPI layers - flood planning + bushfire prone land (statewide open GIS).
  Expect WAF friction; gov-fetch.ts curl shim pattern ready.
- GTFS: TfNSW complete feed (size: test precompute under CI memory/time before wiring).
- Beach: Beachwatch NSW card (parity with Melbourne).
- Price context: Valuer-General bulk PSI (free, weekly, since 1990) - better than VIC source.
- 3D: ELVIS LiDAR-derived heights or OSM only. City of Sydney model is licence-locked - do not use.

## Wave 6 - Adelaide Tier-B (~3-4 sessions)

- Crime: SAPOL Data.SA suburb CSV (footnote: sexual offences excluded at suburb level).
- Hazards: PlanSA Planning and Design Code overlays (statewide single code - easiest in AU).
- GTFS: Adelaide Metro. Price context: open suburb medians quarterly. Buildings: inner ring.

## Wave 7 - Hobart + Darwin (~2-4 sessions, after data hunt)

1. DATA HUNT first (1 deep-research session, founder decision): TAS suburb/LGA crime beyond the
   annual DPFEM PDF - check data.gov.au, LISTdata, Report to the Nation tables, direct
   data request / FOI to DPFEM. NT: PFES sub-region tables, NTG open data portal, direct request
   to PFES. Also recheck air (NT 2 stations) and NT planning scheme GIS endpoint.
2. If hunt fails: honest "not scored - no open data for {state}" safety card (visible copy, not 0).
3. Hazards: TAS via LIST ArcGIS REST; NT pending hunt. GTFS: Metro Tas + Darwin. Darwin: drop
   beach card (croc/stinger), consider pools POI.

## Wave 8 - Regions-as-paths + SEO (~3-4 sessions, after >=4 regions live)

- /[region]/ static path routes generated for live regions; ?region= 301-equivalent client
  redirect for compat; share-url encode updated; Melbourne stays at / (byte-identity retired
  deliberately here - pin with new e2e).
- Per-region static suburb pages /places/[slug] -> region-aware (2,000+ pages national).
- Sitemap per region; JSON-LD (Place + BreadcrumbList) on suburb pages; per-region metadata/OG.
Acceptance: Search Console indexes region paths; no broken share URLs (regression suite).

## Platform track P (interleave with waves; independent)

P1. Basemap step 1 (1 session, HIGH priority - licence risk live today): swap
    basemaps.cartocdn.com (MelbourneMap.tsx:73 + landing map) to OpenFreeMap hosted style,
    restyle to Crema palette. Fallback style URL constant in one place.
P2. Basemap step 2 (at cutover): Australia PMTiles extract on R2 + self-hosted glyphs/sprites.
P3. Backend implementation (code now, deploy at cutover): webhook signature verify
    (stripe-webhook.ts:26-34) + 503-when-secret-unset; KV rate limiting (auth.ts:81) per
    email+IP; session resolution (me.ts); profile sync (profile.ts); magic-link issuance with
    email provider abstraction (pick Resend default, swappable); structured logging (no stack
    dumps, index.ts:49). Real-behaviour tests replace COMING_SOON mocks. NO deploy until
    domain + legal + pricing unlock.
P4. Buildings R2 migration design note (do with P2): move public/data/buildings/ +
    report-tiles/ to R2, app reads via env-switched base URL.
P5. Analytics: founder sets NEXT_PUBLIC_ANALYTICS_DOMAIN repo variable (5 min, founder task) -
    flying blind until then.
P6. Monitoring: UptimeRobot on prod URL now; Sentry + CF analytics at cutover.

## Standing rules (every session)

- Full gates before push: typecheck, lint, unit, e2e, data:verify; SHA-watched deploy; verify-live.
- Honest degradation: missing domain = visible "not scored" copy, never silent 0.
- No pricing copy changes; no domain cutover actions.
- Update this doc's wave status + memory files at session end (session-death insurance).

## External waits (founder)

- ABN -> festra.au registrar -> cutover chain (unblocks P2/P4, repo rename, backend deploy).
- Pricing decision (unblocks pricing copy + Stripe go-live).
- Privacy lawyer + Pty Ltd before first sale.
- NEXT_PUBLIC_ANALYTICS_DOMAIN variable (P5).
