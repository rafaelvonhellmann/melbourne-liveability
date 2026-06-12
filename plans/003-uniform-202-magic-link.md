# Plan 003: Magic-link endpoint returns 202 uniformly (no rate-limit oracle)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report. When done, update this plan's row in
> `plans/README.md`. Prefix shell commands with `rtk ` (repo convention; if
> unavailable, run the bare command).
>
> **Drift check (run first)**: `git diff --stat aca59bf..HEAD -- backend/src/routes/auth.ts backend/test/auth.test.ts`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `aca59bf`, 2026-06-12

## Why this matters

The route's own doc comment declares the contract: "202 always (no account
oracle)" (`backend/src/routes/auth.ts:168`). The implementation diverges: a
rate-limited request returns `429` with `Retry-After`. Because signup IS the
magic link (any email gets one; the user row is created on verify), there is
no registered-account oracle here — but the 429 still discloses per-email
rate-limit state to a third party (whether someone recently requested links
for that address), and it contradicts the stated contract. Honest impact:
LOW-MED. The fix makes the response uniform while keeping the throttle fully
effective server-side.

Note: the `400 invalid_email` for syntactically malformed input is fine and
stays — syntax validity is not an oracle about any account.

## Current state

- `backend/src/routes/auth.ts` — magic-link issuance handler.

Excerpt (`backend/src/routes/auth.ts:168-201`):

```ts
/** POST /api/auth/magic-link - body {email}. 202 always (no account oracle). */
export async function handleMagicLinkRequest(request: Request, env: Env): Promise<Response> {
  ...
  if (!byEmail.allowed || !byIp.allowed) {
    const retryAfter = Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds);
    return json({ error: "rate_limited" }, 429, { "Retry-After": String(retryAfter) });
  }

  await issueMagicLink(env, email, provider);
  logEvent("magic_link_issued", {}); // deliberately no email / token fields
  return json({ status: "sent" }, 202);
}
```

- `backend/test/auth.test.ts` — has tests asserting the 429 + Retry-After
  behavior (per-email and per-IP). These tests must be UPDATED to pin the new
  contract, not deleted.
- Backend test/typecheck commands are non-standard (backend has its own
  vitest/tsconfig; root `npm run test` ALSO runs backend tests).

## Commands you will need

| Purpose            | Command                                                                 | Expected |
|--------------------|-------------------------------------------------------------------------|----------|
| Backend typecheck  | `cd backend && rtk node ../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | exit 0 |
| Backend tests      | `cd backend && rtk node ../node_modules/vitest/vitest.mjs run`          | all pass |
| Root gates         | `rtk npm run typecheck && rtk npm run lint && rtk npm run test`         | exit 0   |

## Scope

**In scope**:
- `backend/src/routes/auth.ts` — the rate-limited branch of
  `handleMagicLinkRequest` only
- `backend/test/auth.test.ts` — update the 429 expectations

**Out of scope**:
- `backend/src/lib/rate-limit.ts` — the limiter semantics (charge-both,
  no window extension) are deliberate; do not change.
- The 400 invalid_email branch, the 503 unavailable branches, `issueMagicLink`
  itself, cookie handling, every other route.

## Git workflow

- Branch: `advisor-003-uniform-202`
- Commit: `fix(auth): rate-limited magic-link requests return uniform 202 (no oracle)`
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Change the rate-limited branch

In `handleMagicLinkRequest`, when `!byEmail.allowed || !byIp.allowed`:
- do NOT call `issueMagicLink` (no email is sent),
- log a distinct event: `logEvent("magic_link_throttled", {})` (no email/IP
  fields — match the existing logging hygiene on line 199),
- return the SAME response as success: `json({ status: "sent" }, 202)` with
  no `Retry-After` header.

Remove the now-unused `retryAfter` computation.

**Verify**: backend typecheck → exit 0.

### Step 2: Update tests to pin the new contract

In `backend/test/auth.test.ts`, find the tests asserting 429 for per-email
and per-IP exhaustion. Update them to assert:
- status 202 with body `{ status: "sent" }`,
- NO `Retry-After` header present,
- the email provider's send was NOT called for the throttled request (the
  existing fakes record fetch calls — assert the count did not increase),
- the throttle still applies (i.e. the Nth+1 request does not send email).

Keep test names honest, e.g.
`"throttled requests get the same 202 and send nothing"`.

**Verify**: `cd backend && rtk node ../node_modules/vitest/vitest.mjs run`
→ all pass.

### Step 3: Full root gates

**Verify**: `rtk npm run typecheck && rtk npm run lint && rtk npm run test`
→ exit 0 (root vitest also runs backend tests — both must be green).

## Test plan

Updated cases in `backend/test/auth.test.ts`: throttled-by-email → 202 +
no send; throttled-by-IP → 202 + no send; first N requests still send.
Pattern: the existing rate-limit tests in the same file.

## Done criteria

- [ ] `rtk grep -n "429" backend/src/routes/auth.ts` returns no matches
- [ ] Backend + root gates all exit 0
- [ ] Tests assert 202 + no-send for throttled requests
- [ ] No out-of-scope files modified
- [ ] `plans/README.md` row updated

## STOP conditions

- The excerpt doesn't match live code (drift).
- Any OTHER route or the frontend depends on the 429 (search:
  `rtk grep -rn "rate_limited\|429" app components lib backend/src` — if a
  consumer exists outside the test file, report it instead of changing it).
- Tests reveal the throttle stops working after the change.

## Maintenance notes

- If a future UI wants to show "try again later", it must NOT come from this
  endpoint's status code; design a separate authenticated surface instead.
- Reviewer should confirm the throttled path sends nothing (the silent-202
  must not become silent-send).
