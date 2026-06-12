# Plan 014: Accounts cutover — README rewrite, fragment links, gated deploy

> **Executor instructions**: Follow step by step. This plan contains
> FOUNDER-GATED steps — they are marked; do not execute them without the
> operator confirming the gate has been approved. Update `plans/README.md`
> when done. Prefix shell commands with `rtk `.
>
> **Drift check (run first)**: `git diff --stat dd39723..HEAD -- backend/ .github/workflows/deploy-pages.yml`
> Plans 010/011 land first (expected drift); re-read before edit.

## Status

- **Priority**: P1 (last in the run)
- **Effort**: M (mostly ops choreography)
- **Risk**: MED-HIGH (production deploy + DNS proxy flip — gated)
- **Depends on**: plans/003, 010, 011, 012, 013 ALL DONE
- **Category**: ops / docs
- **Planned at**: commit `dd39723`, 2026-06-13 (orchestrate run 001)

## Why this matters

Everything before this plan is inert until the Worker is deployed and
festra.au is orange-clouded (Topology A — both reviewers' recommendation).
Codex also found (CDX-07) the backend README still describes the 501-stub era
and routes the executor through parked Stripe steps; and the email template
must emit `#token=` fragments (CDX-09) to match the /auth page from plan 012.

## Code steps (no gate)

1. **Fragment links**: backend/src/routes/auth.ts (~line 68-71) — email URL
   becomes `https://festra.au/auth#token=${token}`. Update the auth tests
   that pin the link shape. **Verify**: backend tests green.
2. **README rewrite**: backend/README.md becomes the ACCOUNTS-ONLY cutover
   runbook: (a) reflect that routes are implemented (112+ tests), not 501
   stubs; (b) Stripe section moves under an explicit "PARKED — do not action
   until pricing decision" banner; (c) checklist becomes exactly the gated
   steps below + verification. **Verify**: `rtk grep -n "501\|coming_soon" backend/README.md`
   → only historical mentions, none as current state.
3. **_headers cache control**: add `public/_headers` with
   `/*\n  Cache-Control: no-cache` for HTML paths IF GitHub Pages honors
   _headers (it does NOT natively — VERIFY: if Pages ignores it, instead
   document in the runbook that Cloudflare (post-orange-cloud) must carry a
   Cache Rule: bypass cache for `text/html`, cache /data/* and /_next/*
   normally. Implement whichever is real; do not ship a placebo file).
4. **wrangler vars**: in backend/wrangler.toml set `ENVIRONMENT = "production"`
   under [vars] (plan 010's console-provider guard keys on it); uncomment the
   route block for `festra.au/api/*` but leave deploy itself gated.
   **Verify**: backend tsc green; wrangler.toml parses
   (`cd backend && rtk npx wrangler deploy --dry-run` if available without auth).

## FOUNDER-GATED steps (execute only after the operator confirms)

5. **GATE A — founder actions** (cannot be done by agents):
   - Resend: create account, verify festra.au sending domain, set the DNS
     records Resend issues (SPF include + DKIM CNAMEs), add DMARC TXT
     (`v=DMARC1; p=quarantine; rua=mailto:hello@festra.au`). (Founder task
     #16; SEC-08/CDX-12.)
   - Confirm: orange-cloud flip approved; deploy approved.
6. **Deploy** (after GATE A): `cd backend && npm install` (first real
   install), delete types/ambient.d.ts per README, `wrangler secret put
   RESEND_API_KEY`, apply D1 migrations: `wrangler d1 execute festra --remote
   --command "ALTER TABLE sessions ADD COLUMN created_at TEXT"` and the
   prefs CREATE TABLE from plan 011 (exact SQL from schema.sql), then
   `wrangler deploy`. **Verify**: `curl -s https://festra.au/api/health`
   (after step 7) or the workers.dev URL pre-flip → `{"ok":true}`.
7. **Orange-cloud flip**: via the founder's DNS token (the operator holds
   it): set the 4 festra.au A records + www CNAME to Proxied=true. Add the
   Cloudflare Cache Rule from step 3 BEFORE the flip. **Verify**:
   https://festra.au still serves the site (Pages origin behind CF), TLS
   valid, `/api/health` 200, and a full deploy-pages CI run stays green
   (verify-live now passes through CF).
8. **Live e2e of the real flow (milestone verification — whatever it takes)**:
   with the operator: sign in with a real email on https://festra.au, receive
   the Resend email, click the fragment link, verify session persists across
   reload, sync a shortlist entry from a second browser profile, sign out.
   Record evidence (screenshots, /api/me responses) in ORCHESTRATE-LOG.md.

## Done criteria

- [ ] Fragment links + tests; README accounts-only; cache strategy REAL not
      placebo; ENVIRONMENT var set; routes uncommented
- [ ] GATE A explicitly confirmed by operator before steps 6-8
- [ ] /api/health 200 on festra.au; full CI green post-flip; live sign-in
      walkthrough evidence in the log
- [ ] README row updated

## STOP conditions

- Any gated step attempted without operator confirmation — that is a
  protocol violation, not a judgment call.
- The orange-cloud flip degrades the site (cert loop, redirect loop, stale
  cache) and the cache rule doesn't fix it within two adjustments → flip
  back to grey-cloud (records to DNS-only), report. The site working free
  trumps accounts shipping today.
- Resend domain verification stalls (DNS propagation) → ship everything up
  to GATE A and mark BLOCKED(waiting on DNS), do not substitute console
  provider.

## Maintenance notes

- After this plan: R2 tile/report migration (P2/P6) can reuse the
  orange-cloud setup; CSP/HSTS headers become possible at CF — open a
  follow-up plan for security headers (deferred from the June 12 audit).
- Monitor the first week: CF Analytics + `wrangler tail` on auth routes.
