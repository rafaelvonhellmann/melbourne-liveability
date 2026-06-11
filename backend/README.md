# Festra API (backend/)

Self-contained Cloudflare Workers project for the Festra accounts + paid
reports backend. **Scaffold only: nothing here is deployed and nothing in
`app/` calls it.** Every route except `GET /api/health` answers
`501 {"status":"coming_soon","launch":"festra.au"}` until cutover; the real
per-route logic is written out as typed, documented signatures + TODO blocks
in `src/routes/*`.

## Architecture

```
festra.au (Cloudflare Pages, static Next export)   <- UI team, "coming soon"
        |
        v  /api/*  (routes commented out in wrangler.toml until cutover)
festra-api (this worker)
        |-- D1  "festra"   - users, magic_links, sessions (audit), profiles,
        |                    clients, purchases, report_artifacts (schema.sql)
        |-- KV  SESSIONS   - session id -> user id, TTL (hot auth path)
        |-- R2  REPORTS    - generated report files (binding commented out)
        `-- Stripe         - Checkout (one-off AUD, GST inclusive) + webhook
```

- **Auth**: emailed magic link (SHA-256 token hash in D1, plaintext only in
  the email) -> session id in KV behind an `httpOnly; Secure; SameSite=Lax`
  cookie. See `src/routes/auth.ts`.
- **Profiles**: server-side copy of the device-local `festra-profile-v1`
  record (`lib/user-profile.ts` at the repo root). The sanitizer in
  `src/lib/validate.ts` mirrors that file's shape, caps and enum-drift
  discipline - change them in the same commit.
- **Payments**: `POST /api/checkout/session` creates a Stripe Checkout
  session + a `pending` purchase row; the signature-verified webhook is the
  only writer of `purchases.status` and triggers report generation into R2.

## Layout

```
wrangler.toml        worker config; bindings live, routes/deploy commented out
schema.sql           D1 schema (apply with wrangler d1 execute)
types/ambient.d.ts   minimal binding types so tsc works pre-`npm install`;
                     DELETE once @cloudflare/workers-types is installed
src/index.ts         fetch entry: route table, CORS, preflight, error guard
src/router.ts        tiny exact-match router (404/405 envelopes)
src/env.ts           typed bindings (twin of wrangler.toml)
src/lib/             pure, fully tested units: http, token, validate, cors
src/routes/          one file per resource; comingSoon() + intended logic
test/                vitest, pure node (undici Request/Response, WebCrypto)
```

## Routes

| Method | Path                   | Now  | At cutover                                  |
| ------ | ---------------------- | ---- | ------------------------------------------- |
| POST   | /api/auth/magic-link   | 501  | issue + email magic link (202 always)       |
| POST   | /api/auth/verify       | 501  | burn link, mint KV session, Set-Cookie      |
| GET    | /api/me                | 501  | session cookie -> user record               |
| GET    | /api/profile           | 501  | stored festra-profile-v1 payload            |
| PUT    | /api/profile           | 501  | sanitize + upsert payload, echo stored      |
| POST   | /api/clients           | 501  | agent-only sub-profile create               |
| POST   | /api/checkout/session  | 501  | Stripe Checkout (snapshot39 / premium59)    |
| POST   | /api/webhooks/stripe   | 501  | verify signature -> purchases -> R2 report  |
| GET    | /api/health            | 200  | unchanged                                   |

## Develop

No `node_modules` exists here yet (deliberate - nothing deploys). Until
`npm install` is run in `backend/`, both commands below borrow the repo
root's toolchain:

```sh
cd backend
node ../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json   # typecheck
node ../node_modules/vitest/vitest.mjs run                          # tests
```

After a real `npm install` in `backend/`: `npm run typecheck`, `npm test`.

## Cutover checklist (in order)

1. `cd backend && npm install`; delete `types/ambient.d.ts` and set
   `"types": ["@cloudflare/workers-types"]` in `tsconfig.json`.
2. `wrangler d1 create festra` -> paste the id into `wrangler.toml`
   (`database_id`), then `wrangler d1 execute festra --remote --file=schema.sql`.
3. `wrangler kv namespace create SESSIONS` -> paste the id into `wrangler.toml`.
4. `wrangler r2 bucket create festra-reports` -> uncomment `[[r2_buckets]]`
   in `wrangler.toml`; make `Env.REPORTS` required in `src/env.ts`.
5. `wrangler secret put STRIPE_SECRET_KEY` and
   `wrangler secret put STRIPE_WEBHOOK_SECRET` (live keys).
6. Implement the TODO blocks in `src/routes/*` route by route, replacing each
   `comingSoon()` return; replace each `it.each(COMING_SOON_ROUTES)` row in
   `test/api.test.ts` with real-behaviour tests as routes go live.
7. In the Stripe dashboard: add webhook endpoint
   `https://festra.au/api/webhooks/stripe` for `checkout.session.completed`
   and `checkout.session.expired`; confirm the signing secret matches step 5.
8. Pick the email provider for magic links and wire `issueMagicLink`.
9. Uncomment `routes = [...]` and `workers_dev = false` in `wrangler.toml`;
   `wrangler deploy`.
10. Verify `https://festra.au/api/health` returns `{"ok":true}`, then hand
    the UI team the green light to drop the "coming soon" copy.
