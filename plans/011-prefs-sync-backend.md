# Plan 011: Preferences sync backend (the data users actually expect to sync)

> **Executor instructions**: Follow step by step; verify every step; STOP
> conditions are binding. Update `plans/README.md` when done. Prefix shell
> commands with `rtk `.
>
> **Drift check (run first)**: `git diff --stat dd39723..HEAD -- backend/ lib/user-prefs.ts`
> Mismatched excerpts = STOP. (Plan 010 will have landed first — its changes
> to profile.ts/validate.ts are EXPECTED drift; reconcile by reading.)

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MED (new table + new routes; merge semantics must be explicit)
- **Depends on**: plans/010 (rate-limit + body-cap patterns to reuse)
- **Category**: feature (backend)
- **Planned at**: commit `dd39723`, 2026-06-13 (orchestrate run 001)

## Why this matters

Both reviewers independently found the same gap (Fable SURFACE-02, Codex
CDX-04): the backend syncs only `festra-profile-v1` (identity + agent
clients), while everything users actually want across devices — weights,
interest view, shortlist, saved checks, buyer profile — lives in
`festra-prefs-v1`/`mlv-user-prefs-v1` (lib/user-prefs.ts) with no table, no
sanitizer, no route. The account page already promises "sync your shortlist
and lenses across devices". This plan builds the server half; plan 013 wires
the client.

## Current state (verified 2026-06-13)

- `lib/user-prefs.ts:45-59` — UserPrefs: weights (7 domains 0-60), interestView,
  shortlist (slugs), recent, savedChecks, alertEmail, colorblindRamp,
  buyerProfile. Stored under the v1 prefs key; `migrateFromV1` handles the
  legacy persona field (recently updated — read the live file).
- `backend/schema.sql` — profiles table (user_id PK, payload TEXT,
  updated_at). No prefs table.
- `backend/src/routes/profile.ts` — GET/PUT pattern to mirror: sanitize on
  read AND write, INSERT ... ON CONFLICT.
- `backend/src/lib/validate.ts` — sanitizer discipline (field-by-field
  reconstruction, version gate, enum guards) — copy this style exactly.
- Backend fakes: `backend/test/fakes.ts` (FakeD1 exact-SQL — add statements).

## Design (decided at reconciliation — do not re-litigate)

- New D1 table `prefs(user_id TEXT PRIMARY KEY REFERENCES users(id),
  payload TEXT NOT NULL, updated_at TEXT NOT NULL)`.
- Payload = the client's prefs object + a client-supplied `updatedAt`
  ISO timestamp inside the payload.
- Concurrency model: **whole-blob last-write-wins on `updatedAt`** — PUT
  carries the client's updatedAt; server rejects with 409 `{error:"stale",
  server: <payload>}` if the stored updatedAt is NEWER than the incoming one.
  The client (plan 013) resolves by merging locally and re-PUTting. No
  server-side field merging — keep the server dumb and auditable.
- Sanitizer `sanitizePrefsPayload` in validate.ts: version gate (accept the
  current client version exactly), weights numeric 0-60 per known domain id,
  interestView from the known enum, shortlist/recent as string arrays capped
  at 100 entries x 80 chars, savedChecks capped at 50 entries with their
  shape checked field-by-field (read the client type for the exact fields),
  alertEmail via normalizeEmail-or-null, colorblindRamp boolean,
  buyerProfile shape-checked field-by-field. Reject unknown versions wholesale
  (null), drop unknown fields silently.
- Routes: GET /api/prefs (204 when none, like profile), PUT /api/prefs
  (sanitize → 422 invalid / 413 oversize / 409 stale / 200 ok). Session-gated
  via the same resolveSession used by profile. Rate limit `rl:prefs:{userId}`
  12/min. Body cap: reuse MAX_BODY_BYTES.

## Scope

**In scope**: backend/schema.sql, backend/src/routes/prefs.ts (new),
backend/src/index.ts (route registration), backend/src/lib/validate.ts,
backend/test/prefs.test.ts (new) + fakes.ts additions.
**Out of scope**: frontend (plan 013), profile payload shape, deploy.

## Git workflow

Branch `advisor-011-prefs-sync`; do NOT push unless the operator instructed it.

## Steps

1. Schema: add the prefs table to schema.sql (mirror profiles' comment style).
   Record in your report: plan 014's deploy must CREATE TABLE on live D1.
   **Verify**: backend tsc green.
2. Sanitizer: `sanitizePrefsPayload` per Design, with the exact field list
   read from `lib/user-prefs.ts` (open it; do not trust this plan's summary
   if they differ — the live type wins, report any surprise fields).
   **Verify**: unit tests — valid round-trip, unknown version → null, caps
   enforced, weights clamped/rejected per existing weight-guard convention.
3. Routes: prefs.ts implementing GET/PUT per Design; register in index.ts
   next to profile. **Verify**: route tests — 401 unauth, 204 empty, PUT/GET
   round-trip, 409 stale with server payload in body, 413, 422, 429.
4. Full gates: backend tsc + vitest; root typecheck/lint/test all green.

## Done criteria

- [ ] prefs table + sanitizer + GET/PUT routes, registered
- [ ] LWW-with-409 semantics tested (incl. equal-timestamp PUT accepted)
- [ ] All caps/limits tested; all gates green; README row updated

## STOP conditions

- lib/user-prefs.ts shape differs materially from this plan's field list
  (e.g. fields added since dd39723) — reconcile by reading, but if a field's
  sync semantics are ambiguous (anything money- or PII-adjacent), report.
- The 409 contract conflicts with how profile.ts handles concurrency — do
  NOT change profile.ts; report the inconsistency for the close-out review.

## Maintenance notes

- Client merge rules live in plan 013; if they change the version, this
  sanitizer's version gate must move in lockstep (same discipline as
  profile-v1 parity comments).
- savedChecks may later carry purchase references — when Stripe unparks,
  re-review this sanitizer.
