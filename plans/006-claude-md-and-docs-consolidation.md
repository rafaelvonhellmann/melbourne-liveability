# Plan 006: CLAUDE.md, .env.example, doc map + archive the superseded docs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report. When done, update this plan's row in
> `plans/README.md`. Prefix shell commands with `rtk ` (repo convention; if
> unavailable, run the bare command).
>
> **Drift check (run first)**: `git diff --stat aca59bf..HEAD -- README.md HANDOVER.md FABLE-EXECUTION-PLAN.md`
> Doc files churn often; drift here is EXPECTED — re-read the live files
> rather than stopping, but STOP if FABLE-EXECUTION-PLAN.md no longer exists.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (documentation moves only; zero runtime code)
- **Depends on**: none
- **Category**: dx / docs
- **Planned at**: commit `aca59bf`, 2026-06-12

## Why this matters

This repo is executed primarily by AI agents, and there is no CLAUDE.md — the
gate commands, the rtk convention, the OneDrive build hazard, the
Melbourne-byte-identity constraint, and the bake runbook live only in chat
history and scattered docs. Meanwhile ~25 root .md files contradict each
other: README still describes a Melbourne-only product (8 capitals are live),
ACTION-PLAN.md contradicts FABLE-ULTRAPLAN.md on personas, and three
different docs claim to be the starting point. Every future agent session
pays this tax. One pass establishes authority order and the executor entry
point.

## Current state

- No `CLAUDE.md`, no `.env.example`, no `docs/` archive
  (verify: `rtk ls CLAUDE.md .env.example docs 2>&1` → not found).
- Root docs include (non-exhaustive): README.md, HANDOVER.md, MASTER-PLAN.md,
  ULTRAPLAN.md, FABLE-ULTRAPLAN.md, FABLE-ULTRAREVIEW.md,
  FABLE-EXECUTION-PLAN.md, NATIONAL-ROLLOUT.md, REGION-ROLLOUT.md,
  EXPANSION-PLAN.md, ACTION-PLAN.md, DATA-PIPELINE-AUDIT.md, DATA-LICENCE.md,
  DESIGN.md, DESIGN-EXTRACTED.md, DESIGN-SYSTEM-PROPOSAL.md, CODEX-REVIEW.md,
  CODEX-DATA-REVIEW.md, CODEX-ULTRAREVIEW.md, HANDOVER.md, plus others —
  list them yourself: `rtk ls *.md`.
- Authority order as of 2026-06-12 (from the maintainers):
  1. `FABLE-EXECUTION-PLAN.md` — THE current work queue (waves)
  2. `NATIONAL-ROLLOUT.md` — region rollout + per-state data sources
  3. `FABLE-ULTRAPLAN.md` — strategy & decision register (D1-D10)
  4. `DATA-PIPELINE-AUDIT.md` — bake safety rules (excellent, buried)
  5. `README.md` — public-facing, currently stale
  SUPERSEDED (archive): ULTRAPLAN.md, MASTER-PLAN.md, ACTION-PLAN.md,
  CODEX-*.md, EXPANSION-PLAN.md (superseded by NATIONAL-ROLLOUT.md),
  DESIGN-EXTRACTED.md, DESIGN-SYSTEM-PROPOSAL.md (superseded by DESIGN.md),
  FABLE-ULTRAREVIEW.md (its corrections were merged into FABLE-ULTRAPLAN.md).
- Known environment facts for CLAUDE.md (verified this session):
  - all bash commands prefixed `rtk ` (user convention);
  - gates: `npm run typecheck && npm run lint && npm run test`; e2e:
    `npm run test:e2e` (Playwright; dev server on port 3000 — if the port is
    squatted by an unrelated app, tests silently hit the wrong server; check
    first);
  - backend has its OWN gates: `cd backend && node ../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json && node ../node_modules/vitest/vitest.mjs run`;
  - `next build` on this Windows machine races OneDrive sync (`.next`
    ENOENT after compile) — prefer CI builds;
  - Melbourne artifacts are byte-identity-pinned (unsuffixed places.json
    etc.); regions are suffixed (`places.sydney.json`);
  - region bakes: `gh workflow run data-refresh.yml -f region=<id>`; ABS
    rate-limits after many bakes in a day (403; back off 20 min);
  - never let VIC source ids appear outside VIC (tripwire tests exist);
  - data.gov.au / planning.vic WAFs block Node TLS fingerprints — use the
    curl shim in `scripts/lib/gov-fetch.ts`.

## Commands you will need

| Purpose   | Command                          | Expected |
|-----------|----------------------------------|----------|
| Lint      | `rtk npm run lint`               | exit 0   |
| Tests     | `rtk npm run test`               | all pass |
| Link check (manual) | `rtk grep -n "ACTION-PLAN\|ULTRAPLAN.md" README.md HANDOVER.md` | no live references to archived docs |

## Scope

**In scope**:
- `CLAUDE.md` (create)
- `.env.example` (create)
- `DOC-MAP.md` (create)
- `docs/archive/` (create; `git mv` superseded docs into it)
- `README.md` — scope/staleness fixes only (Step 4)
- One-line pointer updates in `HANDOVER.md` if it links archived docs

**Out of scope**:
- Editing the CONTENT of FABLE-ULTRAPLAN.md, NATIONAL-ROLLOUT.md,
  FABLE-EXECUTION-PLAN.md, DATA-PIPELINE-AUDIT.md (link to them, don't
  rewrite them).
- Deleting anything — archive moves only (`git mv`, history preserved).
- Code, configs, workflows.

## Git workflow

- Branch: `advisor/006-docs`
- Commits: `docs: CLAUDE.md executor entry point + .env.example`, then
  `docs: DOC-MAP + archive superseded plans`, then `docs: README reflects 8 live capitals`
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Write CLAUDE.md

Sections, in order: (1) What this repo is (2 sentences + live URL);
(2) Commands — the gates table above, verbatim, including backend's;
(3) Conventions — rtk prefix, conventional commits, full gates before any
push to master, Melbourne byte-identity rule; (4) Hazards — OneDrive build
race, port-3000 squatting, ABS rate limits, gov WAF curl shim, VIC-source
tripwire; (5) Runbooks — region bake dispatch + post-bake verification
(prod probe of `data/places.<region>.json`), link DATA-PIPELINE-AUDIT.md
before touching any apply step; (6) Authority order — the 5-doc list above +
"plans/ holds executable advisor plans".
Keep it under ~120 lines; it is an entry point, not an encyclopedia.

**Verify**: file exists; every command in it copy-paste-runs (spot-run the
gates table yourself).

### Step 2: Write .env.example

Entries with one-line comments, values empty: `NEXT_PUBLIC_BASE_PATH=`,
`NEXT_PUBLIC_ANALYTICS_DOMAIN=`, `NEXT_PUBLIC_CF_BEACON_TOKEN=` (only if it
exists in code — `rtk grep -rn "CF_BEACON" lib app` first; omit if absent),
`NEXT_PUBLIC_FORMSPREE_ALERTS_ID=`, `NEXT_PUBLIC_FORMSPREE_FEEDBACK_ID=`,
`NEXT_PUBLIC_FEEDBACK_EMAIL=`, `EPA_API_KEY=` (CI secret, pipeline),
`TFNSW_API_KEY=` (CI secret, Sydney GTFS), `REGION=` (pipeline). Source of
truth: `rtk grep -rn "process.env" lib app scripts next.config.ts | grep -o "NEXT_PUBLIC_[A-Z_]*\|EPA_API_KEY\|TFNSW_API_KEY\|REGION"` — include exactly
what exists.

**Verify**: every var in the file appears in that grep output.

### Step 3: DOC-MAP.md + archive

Create `DOC-MAP.md`: a table (file | status: CANONICAL/REFERENCE/ARCHIVED |
one-line purpose | last meaningful update from `git log -1 --format=%as -- <file>`).
Then `git mv` each superseded doc (list in Current state) to `docs/archive/`,
adding a one-line tombstone note at the TOP of each moved file:
`> ARCHIVED <date>: superseded by <doc>. Kept for history.`

**Verify**: `rtk ls *.md` shows ≤ ~10 root docs;
`rtk git status` shows renames (R), not deletes+adds.

### Step 4: README freshness pass

Fix ONLY: (a) product scope line → all 8 Australian capitals live
(Melbourne full depth; other capitals rolling out Tier-B per
NATIONAL-ROLLOUT.md); (b) point "Project docs" at DOC-MAP.md + CLAUDE.md;
(c) add the DATA-PIPELINE-AUDIT.md safety link under the data-pipeline
section; (d) remove/redirect any links to archived docs.

**Verify**: `rtk grep -n "ACTION-PLAN\|MASTER-PLAN\|ULTRAPLAN.md" README.md`
→ no matches (FABLE-ULTRAPLAN.md is allowed);
`rtk npm run test` → still green (some tests read docs? unlikely, but the
e2e smoke asserts page copy, not repo docs — if a test references a moved
doc path, STOP).

## Test plan

No new tests — docs only. The verification greps above are the checks.

## Done criteria

- [ ] CLAUDE.md exists with the 6 sections; commands verified runnable
- [ ] .env.example matches the env grep exactly
- [ ] Superseded docs under docs/archive/ with tombstones, history preserved
- [ ] DOC-MAP.md table complete for every root .md + archived ones
- [ ] README has no Melbourne-only claims and no dead doc links
- [ ] `rtk npm run test` green; `plans/README.md` row updated

## STOP conditions

- A doc on the archive list is referenced by CODE (grep each filename across
  app/ lib/ scripts/ tests/ before moving; a hit = report, don't move it).
- You find a contradiction between two CANONICAL docs while writing DOC-MAP —
  record it in DOC-MAP under "Known contradictions" and report; do not
  adjudicate strategy yourself.
- Anything requires editing canonical docs' substance.

## Maintenance notes

- CLAUDE.md must be updated when: gates change, a new hazard is discovered,
  or the authority order changes. Reviewers should treat a stale CLAUDE.md
  like a failing test.
- HANDOVER.md remains the session-state doc and will keep churning; DOC-MAP
  marks it REFERENCE for that reason.
