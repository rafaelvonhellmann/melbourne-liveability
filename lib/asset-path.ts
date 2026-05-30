/**
 * Base path for static assets fetched at runtime (e.g. /data/*.json).
 *
 * Next.js `basePath`/`assetPrefix` only rewrite framework assets, <Link>, and
 * next/image — NOT hand-written `fetch()` URLs or MapLibre source URLs. When the
 * site is served from a sub-path (GitHub Pages project site, e.g.
 * `/melbourne-liveability`), those runtime URLs must be prefixed manually.
 *
 * Set `NEXT_PUBLIC_BASE_PATH` at build time for sub-path hosting. Leave it unset
 * for root hosting (local dev, Vercel) so paths stay absolute from `/`.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBase(path: string): string {
  if (!path.startsWith("/")) return `${BASE_PATH}/${path}`;
  return `${BASE_PATH}${path}`;
}
