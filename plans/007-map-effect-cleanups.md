# Plan 007: Clean up stacked map.once("idle") listeners in MelbourneMap effects

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report. When done, update this plan's row in
> `plans/README.md`. Prefix shell commands with `rtk ` (repo convention; if
> unavailable, run the bare command).
>
> **Drift check (run first)**: `git diff --stat aca59bf..HEAD -- components/MelbourneMap.tsx`
> On mismatch with the excerpt below, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (cleanup-only; behavior on the happy path unchanged)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `aca59bf`, 2026-06-12

## Why this matters

Three effects in `components/MelbourneMap.tsx` register `map.once("idle",
handler)` when the style isn't loaded yet, without returning a cleanup. When
dependencies change before the map goes idle, handlers stack: all fire at the
next idle in registration order. Because last-wins, the final paint usually
converges correct — the honest impact is wasted work plus one real edge: a
region switch mid-load can apply a previous region's filter/paint after the
new region's source swap. Adding cleanups makes the effects correct by
construction instead of correct by ordering luck. (Vetted: impact MED, not
the "corrupted state" the raw audit claimed.)

## Current state

- `components/MelbourneMap.tsx` (~36K lines file; region-aware map). The
  component already has a `whenStyleReady(map, fn)` helper (~line 165) that
  RETURNS a cleanup, and at least one effect uses it correctly with
  `return whenStyleReady(...)` (transit-lines effect, ~line 778). Three
  effects bypass it:

Excerpt — fill-color effect (`components/MelbourneMap.tsx:821-843`):

```tsx
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("sa2-fill")) return;
    const color = fillColorFor(
      activeDomain,
      noLayer,
      confidenceMode,
      walkAccessMode,
      cyclabilityMode,
      socialHousingMode,
      hazardLayer,
      colorblind
    ) as maplibregl.ExpressionSpecification;
    if (!map.isStyleLoaded()) {
      map.once("idle", () => {
        if (map.getLayer("sa2-fill")) {
          map.setPaintProperty("sa2-fill", "fill-color", color);
        }
      });
      return;
    }
    map.setPaintProperty("sa2-fill", "fill-color", color);
  }, [ ...8 deps... ]);
```

The visiblePins effect (~line 854-890) and selectedSlug effect (~line
894-911) have the same `map.once("idle", applyFilter)`-without-cleanup shape.
Find them: `rtk grep -n "once(\"idle\"" components/MelbourneMap.tsx`.

- Component test exemplar: `tests/landing-map.test.tsx` (jsdom, mocked
  maplibre). There is no direct unit test of these effects today.

## Commands you will need

| Purpose   | Command                                   | Expected |
|-----------|-------------------------------------------|----------|
| Typecheck | `rtk npm run typecheck`                   | exit 0   |
| Lint      | `rtk npm run lint`                        | exit 0   |
| Tests     | `rtk npm run test`                        | all pass |

## Scope

**In scope**:
- `components/MelbourneMap.tsx` — ONLY the three effects' listener
  registration/cleanup. No logic, dep-array, or expression changes.

**Out of scope**:
- `whenStyleReady` itself and the effects that already use it correctly.
- `fillColorFor` and any memoization of it (considered; deferred — measure
  first, see Maintenance notes).
- Everything else in the component (region switch effect ~line 930 already
  cleans up correctly).

## Git workflow

- Branch: `advisor/007-map-effect-cleanups`
- Commit: `fix(map): unregister pending idle handlers on effect re-run`
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Fix the fill-color effect

Convert the anonymous once-handler to a named const, and return a cleanup in
the not-yet-loaded branch:

```tsx
    if (!map.isStyleLoaded()) {
      const apply = () => {
        if (map.getLayer("sa2-fill")) {
          map.setPaintProperty("sa2-fill", "fill-color", color);
        }
      };
      map.once("idle", apply);
      return () => {
        map.off("idle", apply);
      };
    }
```

**Verify**: `rtk npm run typecheck` → exit 0.

### Step 2: Same pattern for the visiblePins and selectedSlug effects

Locate each `map.once("idle", ...)` found by the grep in Current state;
apply the identical named-handler + `return () => map.off("idle", handler)`
pattern. If an effect has OTHER cleanup needs already, compose them in one
returned function.

**Verify**: `rtk grep -n "once(\"idle\"" components/MelbourneMap.tsx` — every
hit is now within 10 lines of a matching `map.off("idle"` cleanup.

### Step 3: Full gates

**Verify**: `rtk npm run typecheck && rtk npm run lint && rtk npm run test`
→ all green (existing map/landing component tests must not change behavior).

Optional (only if quick): `rtk npm run test:e2e` — but first confirm port
3000 is free; if squatted, skip and note it (CI runs e2e on push).

## Test plan

No new tests required (jsdom can't meaningfully exercise maplibre idle
semantics; the existing component tests pin rendering). The grep check in
Step 2 is the structural guarantee. If you can cheaply extend
`tests/landing-map.test.tsx`'s maplibre mock to assert `off` is called on
unmount for a registered `once`, add it — nice-to-have, not required.

## Done criteria

- [ ] All `once("idle"` registrations in the three effects have cleanups
- [ ] No dep arrays or paint/filter expressions changed (`rtk git diff` review)
- [ ] Root gates exit 0
- [ ] No out-of-scope files modified
- [ ] `plans/README.md` row updated

## STOP conditions

- The grep finds `once("idle"` sites OUTSIDE the three described effects
  whose ownership is unclear — list them in the report; fix only the three.
- Any existing test changes behavior (snapshot/assertion fails) — the change
  must be observationally neutral on the happy path.

## Maintenance notes

- Deferred follow-up: memoize `fillColorFor` (PERF-03) if slider-drag
  profiling shows jank — measure with React DevTools before optimizing.
- New effects touching the map should use `whenStyleReady` (which returns a
  cleanup) rather than raw `map.once` — reviewers should flag raw `once` in
  future PRs.
