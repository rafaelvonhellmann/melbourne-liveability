/**
 * KV-backed fixed-window rate limiter.
 *
 * One JSON counter per key ({count, resetAt}); the window is fixed at first
 * hit and the KV TTL self-cleans it. KV is eventually consistent, so this is
 * a throttle, not a hard security boundary - exactly right for magic-link
 * issuance where the cost being limited is outbound email spam.
 *
 * Denied requests still increment the in-window count (cheap) but never
 * extend the window, so an attacker cannot lock a victim's email forever.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets; 0 when allowed. */
  retryAfterSeconds: number;
};

/** Cloudflare KV rejects expirationTtl < 60s. */
const MIN_KV_TTL_SECONDS = 60;

/**
 * Count a hit against `key` and report whether it stays within `limit` per
 * `windowSeconds`. `nowMs` is injectable for tests.
 */
export async function rateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
  nowMs: number = Date.now()
): Promise<RateLimitResult> {
  let count = 0;
  let resetAt = nowMs + windowSeconds * 1000;

  const raw = await kv.get(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { count?: unknown; resetAt?: unknown };
      if (
        typeof parsed.count === "number" &&
        typeof parsed.resetAt === "number" &&
        parsed.resetAt > nowMs
      ) {
        count = parsed.count;
        resetAt = parsed.resetAt;
      }
      // expired or corrupt counter -> fresh window (defaults above)
    } catch {
      // unparseable counter -> fresh window
    }
  }

  count += 1;
  const secondsLeft = Math.max(1, Math.ceil((resetAt - nowMs) / 1000));
  await kv.put(key, JSON.stringify({ count, resetAt }), {
    expirationTtl: Math.max(MIN_KV_TTL_SECONDS, secondsLeft),
  });

  if (count > limit) {
    return { allowed: false, retryAfterSeconds: secondsLeft };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
