# Plan 008 — W24: Quick CC-BY credibility wins (SEIFA percentile, MMM health-access, verdict layer)

Status: READY (Fable-designed via workflow wy7hk1cyu, ground-truthed). Executor: Codex (code) + Fable (data regen + gate). Gate: Fable.
Drift SHA: master @ 3b7ab3e (post F2 foundation).

## Why
Three quick credibility wins, all SA2-level, sequenced cheapest-first, every source routed through the F1 registry. ACECQA (win 3) is **DON'T-BAKE** — its licence came back non-commercial.

## Ground truth (verified)
- `abs-seifa-2021` already registered (source-registry.ts:325-331, open-with-attribution) + fetched (fetch-indicators.ts:53-59) — only deciles selected, **percentile column unselected**.
- SEIFA is context-only / never-scored (domains.ts:99, equity domain scored:false); `PlaceContext.equity` at types.ts:242-247.
- Percentiles are direction-normalized HIGH=good via `percentileRank(...,true)` (score-places.ts:222-235,291-300) — so `bandFor` is domain-agnostic; only the noun phrase varies by domain.
- `verify-sources.ts:148-180` enforces every places.json/adapter sourceId be in the manifest; `--no-network` skips only liveness. So a new MMM sourceId **MUST be registered or `data:verify --no-network` fails** (the F1 gate).

## Steps (cheapest-first)

1. **WIN 4 — verdict/"so what" layer (design-only, pure).** New `lib/verdict.ts`: `type VerdictBand={id:'well-below'|'below'|'average'|'above'|'excellent';label;tone}`; `bandFor(pct:number|null):VerdictBand|null` with 5 lower-inclusive bands [0,20)[20,40)[40,60)[60,80)[80,100] (top includes 100; null→null); `domainVerdict(domain,pct,regionLabel):{headline;band}|null`. Headlines: comparative family (safety→"Safer than X% of {region}", affordability→"Lower rent burden than…"), exposure family for hazards ("Lower bushfire & flood exposure than…"); when band==='average' use flat "Around the {region} average for {noun}". `pct=Math.round`, no ordinal. PURE+deterministic (no Date/IO). Reuse `lib/area-summary.ts` POS_LABEL/NEG_LABEL for direction. New `lib/verdict.test.ts` asserting band ids + headlines at boundaries 0/19/20/39/40/59/60/79/80/100 + null.
   - Gate: typecheck + lint + `vitest run lib/verdict.test.ts` green; verdict.ts imports no Date/fs/network; git diff touches ONLY lib/verdict.ts + test (zero data churn).
2. **WIN 4 render A — place profile.** `components/ScoreVisuals.tsx` DomainBar (~L45): add OPTIONAL `verdict?:{headline;band}` prop → render `band.label` caption coloured via EXISTING `percentileToColor` (no 2nd palette). `PlaceProfileClient.tsx` (DomainBar loop ~L346-356) + `ScoreBreakdownPanel.tsx` (~L39-49): compute `domainVerdict(c.domain,c.percentile,regionLabel)` (regionLabel from getRegion(id).label, default 'Greater Melbourne'), pass down. Null verdict → bar unchanged. Display-only.
   - Gate: typecheck + lint + test green; DomainBar prop optional (existing call sites compile); no data diff.
3. **WIN 4 render B — buyer report.** Route existing hand-written percentile copy through `domainVerdict().headline`: `lib/buyer-report/area-context.ts` pushHealthFinding (~L46-61) + pushSafetyFinding (~L67-91), `lib/buyer-report/transit-noise.ts` transport (~L195-218). Replace ad-hoc "Nth percentile" strings. Keep minimal (route the 3 findings; no new collector). Direction-correct.
   - Gate: typecheck + lint + test green (update buyer-report snapshots if asserted); no data diff; grep confirms no remaining "th percentile" hardcode in the 3 functions.
4. **WIN 1 — SEIFA affluence percentile (no new source).** 4a FETCH: `fetch-indicators.ts:57` extend SEIFA outFields `+,irsad_aus_percentile,irsad_score`. 4b NORMALIZE: `normalize.ts` RawPlace (~L82) add `irsadPercentile/irsadScore:number|null`; SEIFA loop (L219-227) read with Number.isFinite guards. 4c CONTEXT: normalize.ts L703-710 extend `ctx.equity` with the two fields; sourceId stays 'abs-seifa-2021'. 4d TYPES+DISPLAY: `lib/types.ts` PlaceContext.equity (L242-247) add the two fields; surface "IRSAD national percentile" in the equity context panel (ContextPanels / methodology-reference.ts:107). 4e HONESTY: update abs-seifa-2021 registry NAME to "...IRSAD and IRSD deciles + percentiles (SA2)". Use IRSAD + irsad_aus_percentile (national). SEIFA stays CONTEXT — no scored domain. NO new registry entry/fetch/xlsx. **[Fable] re-run data:fetch(SEIFA)→normalize→score for Melbourne.**
   - Gate: typecheck + lint + test green; data:verify --no-network passes; abs-seifa-2021 still open-with-attribution; places.json diff is ONLY added equity.irsadPercentile/irsadScore (no scored-domain churn); equity still scored:false; missing SEIFA → null not 0.
5. **WIN 2 — MMM 2023 health-access (one new bakeable source).** 5a REGISTRY (F1 gate, FIRST): add `doh-mmm-2023` to source-registry.ts — name "Modified Monash Model 2023 - health-access remoteness (MM1-7) by SA1, rolled up to SA2 (Dept of Health…)", url the data.gov.au dataset page, licence 'CC BY 4.0', period '2023 (published Mar 2025)', licenceVerdict 'open-with-attribution', verifyNote documenting the CC BY 2.5 AU vs 4.0 discrepancy (both bakeable). 5b FETCH: new `scripts/fetch-mmm.ts` pages the **Dept of Health ArcGIS FeatureServer** SA1 layer (`services5.arcgis.com/OvOcYIrJnM97ABBA/.../Modified_Monash_Model_2023/FeatureServer/2/query`, outFields SA1_CODE21,MMM_CODE23,MMM_NAME23, returnGeometry=false, maxRecordCount 2000, ~31 pages via resultOffset). NOT data.gov.au (WAF 403). Write data/raw/mmm-sa1.json. 5c ROLLUP: group SA1_CODE21 by **first 9 digits** (=parent SA2), take **MODAL** MMM per SA2 (ordinal, never averaged); mixed SA2 → modal + note spread. 5d SURFACE as health-domain CONTEXT (NOT scored): `{raw:MMM 1-7, percentile:null, sourceId:'doh-mmm-2023', method:'sa1-modal', missing:false}` on the health domain + a buyer-report context finding. Never percentile it. **[Fable] re-run the affected pipeline for Melbourne.**
   - Gate: typecheck + lint + test green; data:verify --no-network passes WITH doh-mmm-2023 in manifest (membershipErrors empty — F1 gate); assertBakeable('doh-mmm-2023') passes; MMM stored raw 1-7 percentile:null; SA1→SA2 verified on 2+ fringe SA2s (modal not first-SA1); places.json adds ONLY the health MMM sub-indicator; sources.json adds ONLY doh-mmm-2023.
6. **Final consolidated gate.** typecheck + lint + full vitest green; `data:verify --no-network` zero errors; places.json diff is ONLY equity.irsadPercentile/irsadScore + the health MMM sub-indicator; sources.json adds ONLY doh-mmm-2023 + the seifa name edit; NO unrelated churn (no reorder/whitespace); grep confirms no 'acecqa' sourceId baked or assertBakeable-passing.

## Done criteria
- typecheck + lint + full vitest green (incl lib/verdict.test.ts).
- `data:verify --no-network` exits 0 (manifestIssues/dangling/membershipErrors empty).
- Win 1: no new registry entry; abs-seifa-2021 stays open-with-attribution, name updated.
- Win 2: exactly one new source doh-mmm-2023 (open-with-attribution + verifyNote); assertBakeable passes; its sourceId in places.json proven present in sources.json by data:verify membershipErrors empty.
- SEIFA + MMM stay CONTEXT/unscored (equity scored:false; MMM percentile:null); verdict layer display-only/pure.
- places.json diff = ONLY the intended additions, no scored-domain/percentile/overall change, no reorder/whitespace.
- ACECQA NOT baked: no 'acecqa-*' sourceId in places.json; if registered at all, verdict non-commercial-or-restricted so assertBakeable refuses it.

## Scope boundaries (hard)
- **DON'T-BAKE: ACECQA NQS childcare ratings** — verdict non-commercial-or-restricted (copyright covers ratings/results/addresses/registers; ToU bans commercial reuse + selling access). Festra's paid-tier public tiles = blocked. ONLY permitted action: register it with the blocking verdict so assertBakeable refuses it + a FOUNDER task (email The Copyright Officer, ACECQA) mirroring the WA Police permission task. Do NOT bake.
- Registry-gated: doh-mmm-2023 added BEFORE its data bakes. SEIFA reuses abs-seifa-2021. Verdict layer adds no source.
- SA2-LEVEL ONLY (9-digit SA2). MMM published at SA1 → rolled UP to SA2. SA1/within-suburb deferred to F2/W23 — no SA1 keys/geometry/scoring in W24.
- SEIFA + MMM are CONTEXT, never scored (no 8th domain; would double-count income / mislabel ordinal MMM).
- Verdict layer DISPLAY-ONLY: reads existing percentiles; no score/weight/composite change; reuse percentileToColor.
- No WAF-blocked fetch: MMM via Dept of Health ArcGIS (NOT data.gov.au); SEIFA stays on the Digital Atlas ArcGIS endpoint (no xlsx parser).
- Scope = these 3 wins; no weight changes, no new scored domains, no UI redesign beyond the DomainBar caption + equity/health context lines; Melbourne is the regen target.

## STOP conditions
- If a new sourceId lands in places.json before its registry record, `data:verify --no-network` fails — STOP (register first).
- If the places.json diff shows ANY scored-domain percentile/overall change or reorder/whitespace churn, STOP and report (not the intended additions).
- If the MMM ArcGIS fetch fails or the SA1→SA2 modal rollup mislabels a known fringe SA2, STOP and report.
- Data regen (data:fetch/normalize/score, data:mmm) is **Fable's** to run — Codex writes the code + fixture tests and reports what needs Fable.
