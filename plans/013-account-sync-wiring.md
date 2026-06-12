# Plan 013: Account page accounts-era UX + profile/prefs sync wiring

> **Executor instructions**: Follow step by step; verify everything; STOP
> conditions binding. Update `plans/README.md` when done. Prefix shell
> commands with `rtk `.
>
> **Drift check (run first)**: `git diff --stat dd39723..HEAD -- app/account lib/user-prefs.ts lib/user-profile.ts`
> Plans 011/012 land first — their additions are expected; re-read any
> account-page drift before editing.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (data merge logic — the one place a bug eats user data)
- **Depends on**: plans/011 (prefs contract), plans/012 (api client + session)
- **Category**: feature (frontend)
- **Planned at**: commit `dd39723`, 2026-06-13 (orchestrate run 001)

## Why this matters

With auth foundation (012) and a prefs backend (011), this plan delivers the
actual user value: the account page becomes account-aware, and device-local
profile + prefs sync across devices. It also fixes the export/clear gap Codex
found (CDX-05): "export all my data" currently exports prefs only and "clear"
leaves the profile.

## Current state (verified 2026-06-13)

- `app/account/page.tsx` — localStorage-only: loads prefs (~22-24), export
  serializes prefs only (~33-40), reset only saveUserPrefs(DEFAULT_PREFS)
  (~45-48), "Sign in to sync - coming later" stub (~70-80).
- `lib/user-profile.ts` — loadProfile/saveProfile, sanitize discipline.
- `lib/user-prefs.ts` — loadUserPrefs/saveUserPrefs (+ savedChecks helpers).
- Backend contracts: GET/PUT /api/profile (profile payload, sanitized both
  ways); GET/PUT /api/prefs per plan 011 (LWW, 409-stale carries server copy).
- Session: useSession()/refreshSession() from plan 012.

## Sync semantics (decided — build to these, do not re-litigate)

- ON SIGN-IN (or page load while signed-in and not yet synced this session):
  GET both. For each store independently:
  - server 204 + local exists → PUSH local.
  - server exists + local pristine (defaults/empty) → PULL server.
  - both exist → merge: profile = server wins unless local has agent clients
    the server lacks (union clients by id, keep server activeClientId if
    valid); prefs = field-grained favor-most-recent-updatedAt blob-level
    (LWW per plan 011) BUT shortlist and savedChecks are UNIONED (capped per
    sanitizer) before the winning blob is re-PUT — losing a shortlist entry
    because another device wrote last is the one outcome users won't forgive.
  - After merge: save locally + PUT (handle 409 by re-merging once with the
    server copy from the 409 body; second 409 = surface sync-error state).
- ON LOCAL CHANGE while signed-in: debounced (2s) PUT of the changed store.
  Keep it in a small lib/sync.ts module — testable pure merge functions +
  a thin effect hook; do NOT scatter fetch calls through components.
- OFFLINE/unavailable: local stays source of truth; sync state shows
  "offline - changes saved on this device"; retry on next load (no
  background retry loops).

## Scope

**In scope**: app/account/page.tsx, lib/sync.ts (new), wiring the debounced
push into the existing prefs/profile save paths (smallest seam — find where
saveUserPrefs/saveProfile are called and add a post-save notifier, or wrap
in lib/sync.ts), tests (unit for merges, jsdom for page states), e2e
extension.
**Out of scope**: backend changes, /auth + /signin (012), header (012),
pricing copy, alerts.

## Git workflow

Branch `advisor-013-account-sync`; do NOT push unless the operator instructed it.

## Steps

1. **lib/sync.ts**: pure functions `mergeProfiles(local, server)`,
   `mergePrefs(local, server)` implementing the semantics above, with
   exhaustive unit tests FIRST (this is the data-loss surface: test union,
   LWW, pristine-pull, 409-remerge, cap behavior at the sanitizer limits).
2. **Sync engine**: `syncNow(kind)` + `schedulePush(kind)` (2s debounce) +
   session-aware orchestration (no-op when signed-out/unavailable). State
   surfaced as "idle | syncing | synced | offline | error". Tests with
   stubbed apiFetch.
3. **Account page**: replace the stub block with session-aware UI:
   signed-out → short pitch + link to /signin; signed-in → email, sync state
   chip, "sync now", sign-out; EXPORT now includes BOTH stores (prefs +
   profile) in one JSON; CLEAR becomes two explicit actions with confirm:
   "clear this device" (both local stores) and, when signed-in, "delete
   synced copy" (PUT empty/default payloads — backend has no DELETE; document
   this) + sign-out. Match the page's existing visual/copy conventions.
4. **Tests**: jsdom page tests per state; the export content test (both
   stores present); clear-device resets both.
5. **e2e**: smoke: account page renders signed-out state (backend absent =
   unavailable → page must still render the local-data sections; assert no
   dead UI).
6. **Full gates**: typecheck, lint, test; e2e local if port free else CI.

## Done criteria

- [ ] Merge functions unit-tested incl. shortlist/savedChecks union + 409 path
- [ ] Account page: all session states; export covers both stores; two-step
      clear semantics
- [ ] No fetch calls inside components other than via lib/sync.ts / api-client
- [ ] All gates green; README row updated

## STOP conditions

- The prefs contract you find in backend/src/routes/prefs.ts differs from
  plan 011's design (409 body shape etc.) — reconcile by reading the LIVE
  code; if semantics are ambiguous, report.
- Any merge case is not covered by the semantics above (you found a real
  edge) — STOP and report the case rather than inventing policy. Data-merge
  policy is founder-adjacent.
- Wiring the debounced push requires touching more than ~3 call sites —
  report the seam problem instead of shotgunning.

## Maintenance notes

- When alerts ship (accounts feature), alertEmail in prefs becomes
  load-bearing — the merge favors most-recent; revisit then.
- The "delete synced copy" pseudo-delete should become a real DELETE route
  later; recorded for the close-out review.
