# Plan 006 — F1: Open-data source + licence registry with bakeability enforcement

Status: READY (Fable-designed via adversarial workflow wpsmy5430, ground-truthed against the repo). Executor: Codex (gpt-5.5 xhigh). Gate: Fable.

Drift SHA: master @ 6ad350c (post NSW/WA/SA hazards + SA-flood-resilience).

## Why

Every new source in the data wave is a per-region fetch + a provenance entry + a trust-drawer line. Done ad-hoc that is N-way duplication and a licence-discipline hole. Build ONE typed registry that is the single source of truth for source metadata + a licence VERDICT, and make "Festra never ships paid / non-commercial data" a compile + CI guarantee instead of a hand-written comment.

Festra serves data as PUBLIC STATIC TILES, so a source only ships if its verdict is `open-commercial-ok` or `open-with-attribution`.

## Ground truth (confirmed against the repo — do not re-litigate)

- `data/generated/sources.json` = 69 entries, **9 distinct per-entry key-order signatures** (accidental fetch-history residue), LF blob ending `5d 0a`, **no `.gitattributes`**, `core.autocrlf=true`.
- The codebase region type is **`RegionId`** (lib/regions.ts:20), NOT `RegionSlug`.
- Adapter sourceIds are **bare string literals** (crime-adapters.ts:110/171/198/227/258/289; hazard-adapters.ts:115/116/272/273; gtfs-constants.ts) — NOT `getSourceById()` calls, so verify-sources.ts cannot see them today.
- **Existing infra to EXTEND, not duplicate**: `scripts/lib/source-verify.ts` `validateSourceManifest()` (emits error/warn `SourceIssue[]` over `SourceRecord[]`), `extractReferencedSourceIds()`/`danglingReferences()`, `scripts/lib/region-sources.ts` `buildRegionSourceEntries`/`collectSourceIds`, `scripts/hash-sources.ts` `SOURCE_FILES`, `lib/source-manifest.ts` `getSourceById`. None of them classify licence text into a bakeability verdict — that is the gap F1 fills.
- CI verify invocation: `.github/workflows/deploy-pages.yml:44` runs `npm run data:verify -- --no-network`. **`data:verify` reads only `data/generated/sources.json` (Melbourne)** (verify-sources.ts:78) — it does NOT iterate region manifests.
- **verify-sources.ts CODE_FILES (28-33) is stale/dead**: it lists `lib/buyer-report.ts` which is now a pure barrel; the real citations moved to `lib/buyer-report/{amenities,area-context,environment,planning-hazards,schools,transit-noise}.ts`.

## Verdict inventory (77 sources classified; the ones that matter)

73 sources => `open-with-attribution` (ABS / OSM / GTFS / state-police CC-BY / state-planning / EPA / ELVIS).
Four NON-bakeable / borderline (record HONEST verdicts; do NOT silently downgrade, do NOT drop — those are founder-gated):
- `wa-dwer-fpm-100aep-floodway-fringe` — CC BY-NC. Already never fetched (`floodFeatures=0` in wa-hazards.ts). NOT in sources.json. **Must be a registry-KNOWN id** (verdict non-commercial-or-restricted) so the membership check passes.
- `mw-hws-macros` — **CC BY-SA 4.0 (ShareAlike)**. `derived:true, sha256:""` (runtime pin lookup, NOT baked) — so the bake-assert does not fire. Verdict non-commercial-or-restricted. [Founder follow-up: WaterwayHealthCard.tsx:70 shows the WRONG licence "CC BY 3.0 AU"; the card itself is a separate decision — NOT in F1 scope.]
- `wa-police-suburb-offences` — WA Govt ToU (commercial use needs written permission). Baked into `sources.perth.json` with a real sha256, but Perth manifest is NOT checked by the Melbourne `data:verify`. Verdict non-commercial-or-restricted with a verifyNote. [Founder-gated task #23.]
- `bom-solar-climatology` — BoM copyright, unverified. Verdict non-commercial-or-restricted until confirmed.

## Design decisions (locked)

1. **Registry EXTENDS the existing infra.** The manifest record IS the carrier — add an optional `licenceVerdict` to `SourceRecord`/`ManifestSource`; the registry module supplies VALUES + VERDICT, not a parallel validation system.
2. **Byte-identity strategy = canonical serializer as sole writer.** The registry is the value+verdict source of truth, NOT the key-order authority. A single `serializeManifest()` with a fixed key sequence `[id,name,url,method,licence,verifyNote,period,fetchedAt,derived,sha256]` (optional keys emitted only when present; `sha256`/`fetchedAt` NEVER stored in the registry, still stamped by hash-sources) becomes the sole writer. Apply once, accept the one-time key-order normalization diff, re-commit. Pin EOL with a new `.gitattributes` (`*.json text eol=lf`). A new vitest asserts generator output == committed file byte-for-byte.
3. **Bakeability is ORTHOGONAL to membership** (resolves the wa-dwer contradiction). The registry contains EVERY id that can be stamped or baked, including NC ones, each with a verdict. The "known id" check = referenced-ids SUBSET-OF registry-ids (wa-dwer passes). The "no non-bakeable BAKED" check fires on `id has a SOURCE_FILES mapping OR a manifest row AND verdict not in BAKEABLE` — NOT on referencedness. Invariant: a referenced NC id MUST have no SOURCE_FILES mapping and no manifest/template row (that keeps it out of the bake + the trust drawer). wa-dwer satisfies it.

## Steps (each with its gate)

1. **Verdict vocabulary on the existing shape.** In `scripts/lib/source-verify.ts` add `export type LicenceVerdict = "open-commercial-ok" | "open-with-attribution" | "non-commercial-or-restricted" | "paid-or-closed"` and `export const BAKEABLE_VERDICTS = new Set<LicenceVerdict>(["open-commercial-ok","open-with-attribution"])`. Add OPTIONAL `licenceVerdict?: LicenceVerdict` to `SourceRecord`. Mirror the optional field onto `ManifestSource` in `scripts/lib/region-sources.ts`. No parallel `RegisteredSource` type.
   - Gate: `npx tsc --noEmit` passes; `git diff --exit-code data/generated/` clean (types only).
2. **Registry module** `scripts/lib/source-registry.ts` (NEW) — ORDERED ARRAY (committed sources.json order, NOT alphabetical). For each of the 69 committed sources copy `id/name/url/method/licence/verifyNote/period/derived` VERBATIM (exact Unicode codepoints — real em/en dashes, curly quotes; NO ASCII normalization). Do NOT store `sha256`/`fetchedAt`. Add `licenceVerdict` per the inventory above; add `wa-dwer-fpm-100aep-floodway-fringe` as a registry entry EVEN THOUGH it is not in sources.json. Export `SOURCE_REGISTRY` (array), `REGISTRY_BY_ID` (Map), `assertBakeable(id): void` (throws if unknown id OR verdict not bakeable). Use `RegionId` from `lib/regions.ts` for any `regions[]`.
   - Gate: tsc clean; a tsx/temp test asserts `REGISTRY_BY_ID` has all 69 ids + wa-dwer, `assertBakeable('mw-hws-macros')` throws, `assertBakeable('abs-seifa-2021')` does not.
3. **Canonical serializer** in `scripts/lib/region-sources.ts`: `serializeManifest(entries): string` — fixed key order (above), optional keys only when valued, `sha256` only for non-derived-with-hash or derived `""` present-and-last, output `JSON.stringify(ordered,null,2)+"\n"` (LF). Add `buildMelbourneManifestFromRegistry(): ManifestSource[]` projecting `SOURCE_REGISTRY` (filtered to the 69 Melbourne ids, excluding wa-dwer) to metadata-only entries (no sha256/fetchedAt).
   - Gate: tsc clean. (Byte-identity proven in step 8/9.) Do not write sources.json yet.
4. **ONE-TIME canonical normalization + EOL pin.** Add `.gitattributes` at repo root: `*.json text eol=lf` and `data/generated/sources.json text eol=lf`. Run the serializer over the registry-projected Melbourne manifest, re-attaching the CURRENT committed `sha256`/`fetchedAt` (read from the existing file — do NOT change hashes/dates), overwrite `data/generated/sources.json`. The ONLY diff must be key-position moves in the irregular entries.
   - Gate: `git diff data/generated/sources.json` shows ONLY key-order moves — verify with `git diff --word-diff` AND a deep-equal of old-vs-new parsed JSON (identical id set + identical per-id values + identical entry order + identical Unicode). 69 entries still.
5. **Wire `hash-sources.ts` through the serializer.** `hashDefaultManifest()` starts from `buildMelbourneManifestFromRegistry()`, applies the EXACT existing stamping loop (derived => sha256:""; else SOURCE_FILES raw file, fetchedAt=today only when hash changed, sha256 last), carries fetchedAt forward from the previously-committed file, writes via `serializeManifest(...)`. `hashRegionManifest()` unchanged except its final write also routes through `serializeManifest`. Add optional `rawFile?:{dir,file}` to registry entries; read mapping from registry first, fall back to local SOURCE_FILES this step (keep SOURCE_FILES authoritative for now).
   - Gate: `npm run data:hash` (melbourne) WITHOUT re-fetch, then `git diff --exit-code data/generated/sources.json` MUST be clean (zero bytes changed) — proves the registry-driven generator reproduces the committed file exactly.
6. **Enforcement Layer 1 (fetch-refusal) + Layer 2 (manifest/UI exclusion).** Layer 1: route adapter fetch writes through a guard that calls `assertBakeable(sourceId)` BEFORE any write to `data/raw` (makes wa-hazards' `floodFeatures=0` accident structural). Layer 2: extend `buildRegionSourceEntries` so a referenced-but-dropped id MUST be a registry verdict=non-bakeable entry (wa-dwer is the sole sanctioned member); a dropped id that is bakeable-or-unknown throws (real dangling-stamp bug).
   - Gate: tsc + full vitest green; new region-sources test: throws when a non-bakeable/non-registry id is referenced-but-dropped, does NOT throw for wa-dwer; `git diff --exit-code data/generated/` clean.
7. **Enforcement Layer 3 (bake-time CI assert) in `validateSourceManifest`.** For every manifest entry, look up its registry verdict; emit a hard ERROR (not warn) if the entry is non-derived WITH a real sha256 (actually baked) AND verdict not in BAKEABLE, OR if the licence text matches `/NC|non[- ]?commercial|share[- ]?alike/i` but the verdict claims bakeable (mislabel guard). In `verify-sources.ts` add the membership check: referenced ids (from collectSourceIds over places.json + adapter sourceId literals + globbed buyer-report citations) SUBSET-OF registry ids; assert every referenced NC id has NO SOURCE_FILES mapping AND NO manifest row (wa-dwer invariant). Keep in the deterministic `--no-network` path.
   - Gate: `npm run data:verify -- --no-network` exits 0 on the current honest manifest; a temporary local edit setting any actually-baked entry's verdict to non-bakeable makes it exit 1 (revert after proving). Full vitest green.
8. **Fix the dead dangling-citation scanner.** Replace `verify-sources.ts` `CODE_FILES` array with a glob over `lib/**/*.{ts,tsx}` (at minimum add `lib/buyer-report/*.ts`). Add a small extractor for adapter `sourceId:`/`*SourceId:` string literals so those ids feed the subset check. Liveness stays non-blocking warn.
   - Gate: `npm run data:verify -- --no-network` exits 0; `referencedInCode` now includes buyer-report-subdir + adapter ids (confirm an osm-* id cited in `lib/buyer-report/environment.ts` is listed). Full vitest green.
9. **New guard tests** (turn byte-identity + bakeability into CI gates). Test A (byte-identity): read sources.json as utf8, run registry->serializer Melbourne generation, assert STRICT string equality AND a JSON.parse deep-equal. Test B: `assertBakeable` throws for `mw-hws-macros` + an unknown id, not for `abs-seifa-2021`. Test C: feed `validateSourceManifest` a synthetic baked entry with a non-bakeable verdict, assert a severity:error issue. Test D (wa-dwer invariant): registry-known, verdict non-bakeable, no SOURCE_FILES mapping, absent from sources.json. Extend `tests/source-verify.test.ts`/`tests/region-sources.test.ts` where they fit; new `tests/source-registry.test.ts` for A/B/D.
   - Gate: `npx vitest run` green incl. the 4 new assertions; Test A fails on a throwaway byte tweak (verify, then revert).
10. **Migrate first consumers' sourceId declarations** to reference registry ids (compile-time linkage, NO value change). `crime-adapters.ts` / `hazard-adapters.ts` / `gtfs-constants.ts` (+ EPA/ANEF/beach sourceId constants) reference registry ids via a typed helper (`registryId('...')` or a `keyof`-style union) so a typo fails tsc. Do NOT change any string VALUES. Leave the beach-quality per-region provenance mismatch (lib/beach-quality.ts hardcodes epa-beach-report for the NSW file) as a DOCUMENTED follow-up — fixing it is a provenance/behavior change out of F1 scope (flag it).
   - Gate: tsc + full vitest green; `git diff --exit-code data/generated/` clean across a Melbourne re-score+re-hash; a deliberate adapter sourceId typo now fails tsc (prove then revert).
11. **Final verification** matching done criteria (below).

## Done criteria (machine-checkable)

- `npx tsc --noEmit` zero errors. `npm run lint` clean. `npx vitest run` fully green INCLUDING the 4 new tests.
- After `npm run data:hash` (melbourne), `git diff --exit-code data/generated/sources.json` exits 0 (generator reproduces the committed file; the only intentional change is step-4's one-time key-order normalization).
- `.gitattributes` exists, pins `*.json text eol=lf` (+ sources.json explicitly).
- `npm run data:verify -- --no-network` exits 0 on the honest manifest AND exits 1 when any actually-baked source's verdict is set non-bakeable.
- `verify-sources.ts` globs `lib/**/*.{ts,tsx}`; referenced-id SUBSET-OF registry-id holds.
- Melbourne `places.json` + `sources.json` values/hashes/fetchedAt/entry-order/Unicode unchanged vs HEAD except the documented one-time key reorder; no region's stamped sourceId values change.

## Scope boundaries (hard)

- NO feature behavior change. NO new data sources, NONE removed. `wa-police`, `mw-hws-macros`, `bom-solar` continue to ship exactly as today — recording honest verdicts + flagging them is in scope; dropping/re-licensing them is founder-gated (#23, #30, + new mw-hws decision). Do NOT add an allowlist that waves them through; do NOT downgrade a verdict to make the build pass.
- Melbourne output unchanged (byte-identical sources.json post-normalization; places untouched).
- EXTEND existing infra, no parallel manifest/validation system.
- `sha256`/`fetchedAt` NEVER in the registry. Registry strings copied VERBATIM (exact Unicode — overrides the repo's ASCII-prose preference for these data values).
- F2 (SA1 geography) is separate. No CI workflow rewrite (Layer-3 rides the existing deploy-pages.yml:44 step).

## STOP conditions

- If step-4 normalization produces ANY non-key-order diff (a value/hash/date/Unicode change), STOP and report — do not commit a value change to sources.json.
- If `data:verify --no-network` exits 1 on the HONEST manifest (i.e. a currently-baked Melbourne source is genuinely non-bakeable), STOP and report — that is a real latent violation needing a founder decision, not a code fix.
- If any single step exceeds ~15 min of compute, STOP and report (watchdog).
