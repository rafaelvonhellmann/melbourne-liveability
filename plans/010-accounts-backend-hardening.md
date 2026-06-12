# Plan 010: Accounts backend hardening (pre-deploy gate)

> **Executor instructions**: Follow step by step. Run every verification
> command and confirm the expected result before moving on. On any STOP
> condition, stop and report — do not improvise. Update this plan's row in
> `plans/README.md` when done. Prefix shell commands with `rtk ` (repo
> convention; run bare if unavailable).
>
> **Drift check (run first)**: `git diff --stat dd39723..HEAD -- backend/`
> Compare "Current state" excerpts against live code on any drift; mismatch = STOP.

## Status

- **Priority**: P1 (pre-deploy gate for accounts)
- **Effort**: M
- **Risk**: LOW-MED (backend-only, not deployed; tests are the safety net)
- **Depends on**: plans/003 (uniform-202) — execute 003 first, same files
- **Category**: security
- **Planned at**: commit `dd39723`, 2026-06-13 (orchestrate run 001)

## Why this matters

Accounts go-live exposes the Worker to the internet for the first time. The
dual review (Fable SEC-03/05/06/09 + Codex CDX-10/11/12) converged on a
hardening set that must land BEFORE deploy: bounded sessions, bounded profile
payloads, write throttles, `__Host-` cookie, KV/D1 write consistency, and a
guarantee that the console email provider (which logs live magic links) can
never run in production.

## Current state (verified 2026-06-13)

- `backend/src/routes/auth.ts:26` — cookie name `festra_session`; attributes
  built ~lines 144-152 (HttpOnly; Secure; SameSite=Lax; Path=/; no prefix).
- `backend/src/routes/auth.ts:128-136` — verifyMagicLink mints sessions:
  KV put, then D1 INSERT, sequential, no compensation on D1 failure, no cap
  on sessions per user.
- `backend/schema.sql:35-40` — sessions(id, user_id, expires_at); no
  created_at column.
- `backend/src/routes/profile.ts:62-83` — PUT parses arbitrary JSON, then
  sanitizes; no whole-body byte cap; no write rate limit.
- `backend/src/lib/validate.ts:21` — MAX_TEXT=80 caps individual fields only;
  client `id`/`createdAt` strings accepted without length/format caps
  (~lines 98-106).
- `backend/src/routes/clients.ts:40-52` — POST /api/clients, no rate limit.
- `backend/src/lib/email.ts:59-70` — console provider logs the full magic
  link; provider selection ~80-87 picks Resend only when RESEND_API_KEY set.
- `backend/src/lib/rate-limit.ts` — KV throttle, currently used only by
  magic-link issuance.
- Backend gates: `cd backend && rtk node ../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
  and `rtk node ../node_modules/vitest/vitest.mjs run` (currently 112+ tests).
  Root `rtk npm run test` also runs backend tests — keep both green.
- Test fakes live in `backend/test/fakes.ts` (FakeD1 exact-SQL dispatch — new
  SQL statements need fake entries).

## Scope

**In scope**: `backend/schema.sql`, `backend/src/routes/{auth,me,profile,clients}.ts`,
`backend/src/lib/{validate,email,rate-limit}.ts`, `backend/src/env.ts`,
`backend/test/*` (extend), `backend/README.md` ONLY if a constant is
documented there.

**Out of scope**: Stripe routes (parked), frontend, wrangler.toml routes
(deploy is plan 014), CORS origins, prefs sync (plan 011).

## Git workflow

Branch `advisor/010-accounts-hardening`; conventional commits; do NOT push
unless the operator instructed it.

## Steps

### Step 1: `__Host-` cookie + duplicate-cookie rejection
Rename the session cookie to `__Host-festra_session` (constant at
auth.ts:26). `__Host-` requires: Secure, Path=/, NO Domain attribute —
current attributes already comply; assert this in a test. In the cookie
parser (me.ts ~27-40): if the Cookie header contains MORE THAN ONE value for
the session cookie name, treat as no session (401) — cookie-tossing defence.
**Verify**: backend tests updated for the new name; all green.

### Step 2: sessions.created_at + cap 5 per user
Add `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
to sessions in schema.sql. In verifyMagicLink after minting: delete the
oldest sessions beyond the newest 5 for that user (ORDER BY created_at,
rowid) in BOTH D1 and KV (select the evicted ids first, then
`env.SESSIONS.delete(id)` each, then D1 DELETE). NOTE: the live D1 database
already has the old sessions table — record in your report that plan 014's
deploy must run `ALTER TABLE sessions ADD COLUMN created_at TEXT` (nullable
on existing rows is acceptable: treat NULL as oldest).
**Verify**: new test — mint 6 sessions for one user via the fake, assert the
first is evicted from both stores and the remaining 5 work.

### Step 3: KV/D1 mint consistency
Wrap the session D1 INSERT in try/catch; on failure delete the just-put KV
entry and rethrow (compensating delete, Fable SEC-09).
**Verify**: test injects a D1 failure on the sessions INSERT; asserts the KV
entry is gone and the route returns 500.

### Step 4: body-size caps + write throttles
- In profile PUT and clients POST: before JSON.parse, read the raw text and
  reject > 64_000 bytes with 413 `{error:"too_large"}` (constant
  MAX_BODY_BYTES in validate.ts).
- validate.ts: cap client `id` at 64 chars and require `createdAt` to match
  ISO-8601 shape (reject otherwise — do not regenerate; document why in a
  comment: client ids are device-minted and referenced locally).
- Rate limits via the existing rateLimit helper: `rl:profile:{userId}`
  10/min on profile PUT; `rl:clients:{userId}` 5/min on clients POST; on
  exceed return 429 (these are authenticated endpoints — no oracle concern,
  Retry-After allowed).
**Verify**: tests for 413 oversize, 429 on 11th profile write, ISO rejection.

### Step 5: production can never use the console email provider
In email provider selection: if `env.ENVIRONMENT === "production"` (add
optional ENVIRONMENT to env.ts; plan 014 sets it in wrangler.toml vars) and
RESEND_API_KEY is absent, return `unavailable("email_provider")` rather than
falling back to console. Console provider stays for tests/dev only.
**Verify**: test — production env without key → 503 on magic-link request;
dev env without key → console provider used (existing behavior).

### Step 6: concurrent-verify test (Fable SEC-10)
Add a test firing two verify calls with the same token against the fake
(sequentially is fine — the fake's burn guard models the WHERE used_at IS
NULL semantics); assert exactly one session minted.

### Step 7: full gates
**Verify**: backend tsc + backend vitest green; root
`rtk npm run typecheck && rtk npm run lint && rtk npm run test` green.

## Done criteria

- [ ] Cookie is `__Host-festra_session`; duplicate-cookie → 401 (tested)
- [ ] Sessions capped at 5/user, created_at exists, eviction tested both stores
- [ ] D1-failure compensating delete tested
- [ ] 64KB body cap + profile/client write throttles tested
- [ ] Production + no Resend key = 503, never console (tested)
- [ ] All gates green; no out-of-scope files touched; README row updated

## STOP conditions

- Excerpts don't match live code (drift).
- FakeD1's exact-SQL dispatch can't express a needed query after one honest
  attempt to extend the fake — report the query.
- Any existing test's INTENT must change (beyond the cookie rename) — report
  rather than rewrite.

## Maintenance notes

- Plan 014 (deploy) must: run the sessions ALTER on live D1, set
  ENVIRONMENT=production in wrangler.toml vars.
- Frontend (plan 012) must use the new cookie name nowhere — it's httpOnly;
  nothing client-side references it. Logout UX relies on the existing
  clear-cookie route behavior (name change is server-internal).
