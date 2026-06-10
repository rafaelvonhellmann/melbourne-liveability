/**
 * Pure carry-forward merge for place context fields (the CLI wrapper is
 * scripts/preserve-context.ts). Re-fills context fields that were populated in
 * the previous places.json but are missing from a rebuild, WITHOUT overwriting
 * anything the rebuild computed - recomputed values always win. One level of
 * sub-fields is merged too, so e.g. community.volunteerPct survives a rebuilt
 * community object that lacks it.
 */

export type Ctx = Record<string, unknown>;
export type PlaceLike = { sa2Code: string; context?: Ctx };

function isPlainObject(v: unknown): v is Ctx {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Mutates `places`, filling context fields from `prevPlaces` (matched by
 * sa2Code). `retired` dot-paths ("planning" or "community.volunteerPct") are
 * never carried, so fields can be deliberately removed. Returns per-path
 * counts of carried values.
 */
export function carryForwardContext(
  prevPlaces: PlaceLike[],
  places: PlaceLike[],
  retired: Iterable<string> = []
): Record<string, number> {
  const prevByCode = new Map(prevPlaces.map((p) => [p.sa2Code, p]));
  const skip = new Set(retired);
  const carried: Record<string, number> = {};

  for (const place of places) {
    const prevCtx = prevByCode.get(place.sa2Code)?.context;
    if (!prevCtx) continue;
    const ctx: Ctx = place.context ?? {};
    for (const [key, prevVal] of Object.entries(prevCtx)) {
      if (prevVal == null || skip.has(key)) continue;
      const cur = ctx[key];
      if (cur == null) {
        ctx[key] = prevVal;
        carried[key] = (carried[key] ?? 0) + 1;
      } else if (isPlainObject(cur) && isPlainObject(prevVal)) {
        for (const [sub, subVal] of Object.entries(prevVal)) {
          const subKey = `${key}.${sub}`;
          if (subVal == null || skip.has(subKey) || cur[sub] != null) continue;
          cur[sub] = subVal;
          carried[subKey] = (carried[subKey] ?? 0) + 1;
        }
      }
    }
    place.context = ctx;
  }
  return carried;
}

/**
 * Splits the fields carried in the current run into first-time carries vs
 * repeats (fields ALSO carried in the previously committed run, i.e. a second
 * consecutive refresh rebuilt without fresh data). The coverage gate warns on
 * first carries and fails on repeats (scripts/verify-coverage-diff.ts).
 */
export function classifyCarried(
  prev: Record<string, number>,
  current: Record<string, number>
): { firstCarry: string[]; repeatCarry: string[] } {
  const firstCarry: string[] = [];
  const repeatCarry: string[] = [];
  for (const field of Object.keys(current).sort()) {
    (field in prev ? repeatCarry : firstCarry).push(field);
  }
  return { firstCarry, repeatCarry };
}
