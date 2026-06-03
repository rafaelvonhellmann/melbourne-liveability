# Data + reference verification

How we keep every figure and citation in the product honest. Two layers - an
always-on automated gate, and an on-demand Codex audit that backs claims against
authoritative documents.

## 1. Automated gate - `npm run data:verify` (`scripts/verify-sources.ts`)

Runs in the monthly data refresh and can run in CI / pre-commit. Checks:

- **Manifest integrity** - every source in `data/generated/sources.json` has a
  name, an `http(s)` url, a licence and a period; no duplicate ids; a `sha256`
  is present for every non-derived source.
- **No dangling citations** - every `sourceId` referenced in code
  (`getSourcesByIds([...])` / `getSourceById("...")`) exists in the manifest, so
  a finding can never render a blank or fabricated source label.
- **URL liveness** - each upstream url is fetched (HEAD, GET fallback) and its
  reachability recorded.

Deterministic problems (missing fields, duplicate ids, dangling citations) exit
non-zero and **block**. Network dead-urls are reported as **warnings** (a transient
outage must not fail an unrelated build). Output is written to
`data/generated/source-verification.json`.

`npm run data:verify -- --no-network` runs only the deterministic checks (fast,
offline) - handy as a pre-commit hook.

## 2. Codex audit - `npm run data:codex-review` (`scripts/codex-data-review.ts`)

A deeper, on-demand review. It invokes the local **Codex CLI** to cross-check our
headline data claims + the manifest against the authoritative public sources
(ABS Census / Data by Region, ABS ERP, Vicmap, Vicplan overlays, VCSA crime,
DEECA) and write `CODEX-DATA-REVIEW.md` as a table:

| Claim | Cited source | Verdict (supported / weak / unsupported) | Evidence / URL | Recommended fix |

Run it before a release, or after adding a new data source. It is a review aid,
not a gate (Codex cannot run headless in every environment) - the automated
`data:verify` is the gate. Requires the Codex CLI (see the `codex:setup` skill).

## Principles (the standard these enforce)

- Never fabricate data. Every finding shows **source + freshness + caveat**
  (unit-tested in `tests/buyer-report.test.ts`).
- An **area share is never presented as a parcel-level result**.
- Adding a data source means: add it to the manifest, run `data:hash`, then run
  `data:verify` before committing - and `data:codex-review` to back the new claims.
