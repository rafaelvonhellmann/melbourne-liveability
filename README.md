# Festra

Festra (festra.au once the hosting cutover lands; currently served from GitHub Pages) is an open-data **access and compilation** site for Greater Melbourne (ABS GCCSA `2GMEL`). It pulls scattered Australian government open data into one map-first interface so anyone can explore their neighbourhood across affordability, transport, safety, health, education, hazards, and more - down to the ABS **SA2** level (361 areas).

> **This is a data-access tool, not a ranking authority.** A composite "liveability score" exists as an optional, user-weighted lens, but many indicators are presented as **context only** (never folded into any score). See [`ULTRAPLAN.md`](./ULTRAPLAN.md) and the in-app **Methodology** page for the full framing and caveats.

## Features

- **Interactive choropleth map** (MapLibre GL) with per-domain layers and POI pins.
- **Context-only layers** (not scored): Data confidence, **15-minute walk access**, **Cyclability**.
- **Personalisation** (no account, all local): adjustable domain weights, persona presets, interest views, shortlist, recently viewed, and shareable URL state.
- **361 place profiles** (statically generated) with score breakdowns, context panels (equity, community, environment, politics), and honest source attribution.
- **Compare** view, **Alerts** signup, **Methodology** and **Disclaimer** pages.
- **Automated data refresh** via GitHub Actions with upstream freshness probing and SHA-256 source provenance.

## Tech stack

Next.js 15 (App Router, **static export**) · React 19 · TypeScript · Tailwind CSS · MapLibre GL · Turf.js + RBush (geospatial). No backend — the site is fully static and reads committed JSON/GeoJSON from `public/data/`.

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
```

Quality gate:

```bash
npm run typecheck
npm test
npm run lint
npm run build      # static export → ./out
```

## Data pipeline

Raw sources land in `data/raw/` (gitignored); processed artifacts are committed to `data/generated/` and `public/data/`.

```bash
npm run data:fetch     # ABS boundaries + indicators → data/raw
npm run data:build     # full pipeline: crosswalk → normalize → score → geo → poi → hash
# or: npm run data:all  (fetch + build)
```

Individual steps: `data:crosswalk`, `data:normalize`, `data:score`, `data:geo`, `data:poi`, `data:walkaccess`, `data:cyclability`, `data:hash`, `data:freshness`.

Source manifest with licence/period/fetchedAt/sha256 lives in `data/generated/sources.json`.

## Deployment

The app is a static export (`output: "export"` in `next.config.ts`), so it can be hosted on any static host.

### GitHub Pages (automated)

Pushing to `master` triggers [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml), which builds with `NEXT_PUBLIC_BASE_PATH=/melbourne-liveability` (the project sub-path) and publishes to Pages. Enable once under **Settings → Pages → Source: GitHub Actions**. Live URL: `https://<user>.github.io/melbourne-liveability/`.

### Vercel (one-time setup)

Vercel serves at the root, so **no base path is needed** — leave `NEXT_PUBLIC_BASE_PATH` unset.

```bash
vercel login          # interactive (device auth) — required once
vercel --prod         # build + deploy
```

Or import the GitHub repo at [vercel.com/new](https://vercel.com/new) (framework auto-detected as Next.js; build command `npm run build`; output `out`).

### Sub-path vs. root hosting

Runtime data URLs (`/data/*.json`, map GeoJSON sources) are prefixed via `lib/asset-path.ts` using `NEXT_PUBLIC_BASE_PATH`. Set it to `/<repo>` for project-style sub-path hosting (GitHub Pages); leave it empty for root hosting (Vercel, custom domain, local).

## Optional environment variables

- `NEXT_PUBLIC_BASE_PATH` — sub-path prefix for asset URLs (see above).
- `NEXT_PUBLIC_FORMSPREE_ALERTS_ID` — enables real email submission on the Alerts page; without it, signups are stored locally only.

## Project docs

- [`ULTRAPLAN.md`](./ULTRAPLAN.md) — product vision, domain model, roadmap, monetisation framing.
- [`HANDOVER.md`](./HANDOVER.md) — current status, workflow, and next steps.
