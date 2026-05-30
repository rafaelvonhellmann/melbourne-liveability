# Melbourne Liveability Map

Map-first liveability scores for Greater Melbourne (ABS GCCSA `2GMEL`), built from Australian government open data.

**Plan:** see [ULTRAPLAN.md](./ULTRAPLAN.md). v1.0 thin slice: Affordability, Transport, Crime/Safety, Health.

## Data pipeline

```bash
npm install
npm run data:fetch      # ABS boundaries → data/raw (gitignored)
npm run data:crosswalk  # → data/generated/crosswalk.json
npm run data:build      # full pipeline (normalize + score)
```

## App

```bash
npm run dev
# open http://localhost:3000 — map, search, sliders, 361 place profiles
```

Committed build artifacts: `data/generated/crosswalk.json`, `public/data/places.json`, `public/data/places.geojson`.

Refresh raw data (optional, requires network):

```bash
npm run data:fetch      # boundaries + indicators
npm run data:crosswalk
npm run data:normalize
npm run data:score
npm run data:geo
```

## Tests

```bash
npm test
```
