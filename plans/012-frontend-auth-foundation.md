# Plan 012: Frontend auth foundation (API client, /auth verify, sign-in, session state)

> **Executor instructions**: Follow step by step; verify every step; STOP
> conditions binding. Update `plans/README.md` when done. Prefix shell
> commands with `rtk `.
>
> **Drift check (run first)**: `git diff --stat dd39723..HEAD -- app/ lib/ components/`
> The landing/persona changes of dd39723 are the baseline; later drift in
> unrelated areas is fine, drift in account/auth files = re-read before edit.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (new user-facing surfaces; static-export constraints)
- **Depends on**: none for code (backend deploy NOT required — build against
  the contract; integration verified in plan 014)
- **Category**: feature (frontend)
- **Planned at**: commit `dd39723`, 2026-06-13 (orchestrate run 001)

## Why this matters

There is zero frontend auth code: no API client, no /auth landing (the
backend emails links to `https://festra.au/auth?token=...` — today that 404s),
no session state, no sign-in form (Fable SURFACE-03/04/05, Codex
CDX-01/02/03). This plan builds the foundation; plan 013 builds the account
page UX on top.

## Topology + token decisions (decided at reconciliation — build to these)

- Same-origin API: all calls are RELATIVE `/api/...` (Topology A,
  orange-cloud festra.au; deploy in plan 014). `credentials: "include"` on
  every call anyway (harmless same-origin, survives any future subdomain move).
- Magic-link token arrives as a URL FRAGMENT: `/auth#token=...` (Codex
  CDX-09: fragments never reach servers/CDN/analytics). Plan 014 changes the
  backend email template to emit the fragment form; the /auth page built here
  must accept BOTH `#token=` (primary) and legacy `?token=` (defensive),
  scrubbing either via history.replaceState BEFORE any API call.

## Current state (verified 2026-06-13)

- `next.config.ts:7-10` — output: "export" (static; /auth must be a
  client-component page, prerendered as shell).
- No `app/auth/` directory. No `/api` fetches anywhere in app/ lib/
  components/. `lib/asset-path.ts` is for static assets only — do NOT use it
  for API calls.
- Backend contract (backend/src/routes/*): POST /api/auth/magic-link
  {email} → 202 always; POST /api/auth/verify {token} → 200 sets httpOnly
  cookie + body user summary, 401 invalid/expired; GET /api/me → 200 user /
  401; POST /api/auth/logout → 204 clears cookie. (Until deployed, all return
  worker-absent network errors — every surface needs the error state.)
- Conventions: components functional + hooks; design tokens in
  app/globals.css (Crema palette; accent #1D4ED8); copy voice is honest/plain
  (match app/account/page.tsx tone); tests vitest + jsdom opt-in per file;
  e2e Playwright in tests/e2e/.
- Existing exemplar for env-gated client behavior: lib/analytics.ts.

## Scope

**In scope**: lib/api-client.ts (new), lib/use-session.ts (new hook),
app/auth/page.tsx (new), app/signin/page.tsx (new), the header account
affordance in app/(map)/page.tsx (~1598-1639, the "Your data" link block),
tests for each, e2e additions.
**Out of scope**: account page body (plan 013), prefs/profile sync logic
(plan 013), backend files, deploy.

## Git workflow

Branch `advisor-012-frontend-auth`; do NOT push unless the operator
instructed it.

## Steps

1. **API client** (lib/api-client.ts): tiny typed wrapper — `apiFetch(path,
   init)` with credentials:"include", JSON envelope handling, normalized
   error type {status, code} (code from body.error when present; "network"
   on fetch rejection; "unavailable" on 503). No retries (callers decide).
   **Verify**: unit tests with stubbed global fetch (model after backend's
   recorded-fetch fake style): 200, 401, 503, network-reject.
2. **Session hook** (lib/use-session.ts): `useSession()` → {status:
   "loading"|"signed-out"|"signed-in"|"unavailable", user?} backed by GET
   /api/me on mount, with module-level cache so multiple consumers share one
   round-trip; `signOut()` calls logout then resets cache; export
   `refreshSession()` for the verify page. **Verify**: jsdom tests for all
   four states + cache sharing.
3. **/auth verify page** (app/auth/page.tsx, client component): minimal
   chrome (logo + status card, no nav, no analytics-relevant interactivity);
   `<meta name="referrer" content="no-referrer">` via the page's head export
   if supported in app router (else document.head injection in the effect —
   note which you used); on mount: read token from location.hash (`#token=`)
   or legacy search param, IMMEDIATELY history.replaceState to bare /auth,
   then POST verify. States: verifying → success ("You're signed in" +
   auto-redirect to /account after 1.5s) / invalid-or-expired (link to
   /signin) / unavailable ("accounts aren't live yet" — honest copy, this
   state ships before backend deploy). **Verify**: jsdom tests: fragment
   parsed + scrubbed before fetch fires (assert URL changed prior to the
   stubbed fetch call), legacy query accepted + scrubbed, all three end
   states render.
4. **Sign-in page** (app/signin/page.tsx): email input (label + validation
   per a11y conventions — see FeedbackButton for the labeled-input pattern),
   submit → POST magic-link → ALWAYS show "check your email" on 202 (and on
   429-class errors show the same — no oracle in the UI either);
   "unavailable" state when 503/network. **Verify**: jsdom tests: submit
   flow, uniform sent-state, unavailable state, label wiring.
5. **Header affordance** (app/(map)/page.tsx): the existing "Your data" link
   gains session awareness via useSession: signed-out → unchanged link;
   signed-in → small signed-in indicator (dot + title attr with email) on the
   same link. Keep it subtle — no new top-bar layout (byte-drift watch:
   region-switcher tests pin top-bar markup; run them). **Verify**:
   tests/region-switcher.test.tsx still green unmodified; new test for the
   indicator states.
6. **e2e**: extend tests/e2e/smoke.spec.ts: /signin renders the form;
   /auth#token=junk shows the invalid state WITHOUT the token remaining in
   the URL (assert page.url() lacks "token"). Static export means these pages
   must appear in the build — `rtk grep -l "auth" out/` is NOT a gate here;
   the e2e run against the dev server is.
7. **Full gates**: rtk npm run typecheck && rtk npm run lint && rtk npm run
   test; e2e locally if port 3000 free, else CI.

## Done criteria

- [ ] /auth + /signin exist, client-side, all states tested
- [ ] Token scrubbed from URL before any network call (tested)
- [ ] useSession shared-cache hook tested; header indicator non-disruptive
      (region-switcher tests untouched and green)
- [ ] All gates green; README row updated

## STOP conditions

- The app router rejects a head/meta approach for the referrer policy after
  two attempts — ship without it and FLAG in the report (fragment tokens make
  it defence-in-depth, not load-bearing).
- Any change to app/(map)/page.tsx breaks a pinned top-bar test — report,
  do not weaken the pin.
- The static export refuses the /auth route shell (build error) — report
  with the exact error.

## Maintenance notes

- When plan 014 deploys the worker, the "unavailable" states become rare
  paths — keep them; CF outages exist.
- The session cache must be invalidated by plan 013's sync flows (it exposes
  refreshSession for that).
