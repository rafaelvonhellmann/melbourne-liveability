/**
 * Magic-link / session token primitives. Pure: only WebCrypto globals, no
 * bindings, so these run identically in workers, node 20+ and vitest.
 *
 * Storage rule: the plaintext token travels in the email link ONLY; D1
 * (magic_links.token_hash) stores the SHA-256 hex. Lookup on verify is
 * by hash, then constantTimeEqual guards the comparison.
 */

/** New opaque token / id. UUIDv4 = 122 random bits from the runtime CSPRNG. */
export function newToken(): string {
  return crypto.randomUUID();
}

const HEX = "0123456789abcdef";

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += HEX[b >> 4]! + HEX[b & 0x0f]!;
  }
  return out;
}

/** SHA-256 of the token, lowercase hex (64 chars). Deterministic. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

/**
 * Constant-time string comparison: the loop always walks the longer input
 * and never early-exits, so timing does not reveal the first differing
 * position. (Length inequality is still observable - unavoidable for
 * variable-length strings - which is fine for fixed-length hex digests.)
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    // charCodeAt is NaN out of range; `|| 0` keeps the XOR well-defined.
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
