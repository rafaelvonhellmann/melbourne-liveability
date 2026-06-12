# Festra API (backend/)

Accounts backend for Festra's cutover to `https://festra.au/api/*`.

The Worker routes are implemented and covered by the backend test suite in this
checkout (137 route/helper tests). The worker is still not deployed. Production
traffic remains founder-gated until Resend DNS verification, Cloudflare
orange-cloud approval, deployment, and live sign-in verification are complete.

## Implemented Accounts Surface

| Method | Path                  | Current behaviour before secrets/deploy |
| ------ | --------------------- | ---------------------------------------- |
| GET    | /api/health           | `200 {"ok":true}` without bindings       |
| POST   | /api/auth/magic-link  | 202 uniform response; Resend required in production |
| POST   | /api/auth/verify      | Burns fragment magic link, mints session cookie |
| POST   | /api/auth/logout      | Deletes KV session and clears cookie     |
| GET    | /api/me               | Session cookie to user record            |
| GET    | /api/profile          | Stored `festra-profile-v1` payload       |
| PUT    | /api/profile          | Sanitizes and upserts profile payload    |
| GET    | /api/prefs            | Stored sync prefs payload                |
| PUT    | /api/prefs            | Sanitizes, conflict-checks, and upserts prefs |
| POST   | /api/clients          | Agent-only client create                 |

The account flow uses emailed magic links with SHA-256 token hashes in D1 and
session ids in KV behind an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie.
The email link is `https://festra.au/auth#token=...` so the token does not ride
in request logs, referrers, or GitHub Pages routing.

## Architecture

```
festra.au (GitHub Pages static Next export)
        |
        v  /api/* after Cloudflare orange-cloud route
festra-api (Cloudflare Worker)
        |-- D1  "festra"   - users, magic_links, sessions, profiles, prefs,
        |                    clients, purchases, report_artifacts
        |-- KV  SESSIONS   - session id -> user id, TTL hot path
        `-- R2  REPORTS    - reserved for paid report artifacts
```

`wrangler.toml` is the source of truth for bindings and the cutover route. The
route can be present in config before deployment, but `wrangler deploy`, secret
writes, D1 remote migrations, and DNS changes are gated operations.

## Develop

No separate `backend/node_modules` install is required for local verification;
the backend borrows the repo-root toolchain:

```sh
cd backend
node ../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node ../node_modules/vitest/vitest.mjs run
```

After a real `npm install` in `backend/`, `npm run typecheck` and `npm test`
are equivalent.

## Static HTML Cache Strategy

Do not add `public/_headers` for this deployment path. `_headers` is a
Cloudflare Pages feature; this site publishes a GitHub Pages artifact, so an
`out/_headers` file would be served as an ordinary static file rather than used
to set response headers.

Before the orange-cloud flip, create Cloudflare Cache Rules for the proxied
zone instead:

1. Bypass cache for HTML navigations and app routes on `festra.au`:
   `http.host eq "festra.au"` and not path starts with `/_next/` or `/data/`
   or another static asset path.
2. Leave `/_next/*` and `/data/*` eligible for the normal static-asset cache.
3. Keep the rule in place before and after the Worker deploy so auth pages and
   account state never depend on stale HTML.

## PARKED - Do Not Action Until Pricing Decision

Stripe and paid-report plumbing exists in code but is outside the accounts-only
cutover. Do not set `STRIPE_SECRET_KEY`, do not set `STRIPE_WEBHOOK_SECRET`, do
not wire live Stripe webhooks, and do not market paid report checkout until the
founder pricing decision is made. With Stripe secrets absent, checkout and
webhook routes fail closed.

## Founder-Gated Cutover Checklist

1. GATE A - founder actions:
   - Resend: create account, verify the `festra.au` sending domain, set the DNS
     records Resend issues, and add DMARC
     `v=DMARC1; p=quarantine; rua=mailto:hello@festra.au`.
   - Confirm that orange-cloud flip and Worker deploy are approved.
2. Deploy after GATE A only:
   - `cd backend && npm install`.
   - Delete `types/ambient.d.ts` and switch `backend/tsconfig.json` to
     `@cloudflare/workers-types`.
   - `wrangler secret put RESEND_API_KEY`.
   - Apply the remote D1 migrations for `sessions.created_at` and `prefs`
     from `schema.sql`.
   - `wrangler deploy`.
3. Orange-cloud flip after the deploy path is approved:
   - Set the `festra.au` A records and `www` CNAME to proxied.
   - Add the Cloudflare Cache Rules from this README before the flip.
4. Live verification:
   - `https://festra.au` still serves the static site with valid TLS.
   - `https://festra.au/api/health` returns `{"ok":true}`.
   - Full deploy-pages CI remains green after the flip.
   - Complete a real sign-in: request email, receive Resend link, click the
     fragment URL, verify the session persists across reload, sync a shortlist
     entry from a second browser profile, sign out.
   - Record evidence in `ORCHESTRATE-LOG.md`.

## Stop Conditions

- Any deploy, secret write, remote D1 migration, or DNS change without explicit
  founder gate approval.
- The orange-cloud flip degrades the static site and the cache rule does not
  fix it within two adjustments. Flip back to DNS-only and report.
- Resend domain verification stalls. Stop at GATE A and do not substitute the
  console provider.
