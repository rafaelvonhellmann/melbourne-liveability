/**
 * Resilient fetch for STATIC-FILE downloads from WAF-protected .gov.au hosts.
 *
 * Some Victorian government static hosts - notably www.planning.vic.gov.au,
 * which serves the Victoria in Future (VIF2023) XLSX projections and other
 * planning open-data assets - sit behind a WAF that blocks automated clients.
 *
 * Measured 2026-06 against the live VIF2023 SA2 XLSX:
 *   - curl (OpenSSL TLS fingerprint), ANY User-Agent .......... 200 / 206 OK
 *   - Node fetch / undici + a full browser User-Agent + Referer  403 (HTML block)
 * Same headers, same HTTP/1.1, same instant. So this WAF discriminates on the
 * TLS / HTTP client FINGERPRINT (JA3/JA4), not the User-Agent: browser-like
 * headers alone do NOT clear it from Node. The reliable transport is curl, whose
 * fingerprint passes. (A custom UA from a cloud / CI IP can also be challenged,
 * so we still send browser-like headers - they are necessary, just not enough.)
 *
 * downloadToFile() therefore tries undici first (fast, and the path that already
 * works for non-fingerprinting hosts such as the data.vic crime XLSX) and falls
 * back to a curl subprocess only when undici is blocked. curl is present on the
 * GitHub Actions ubuntu runners and on Windows 10+ / macOS / Linux dev machines.
 *
 * SCOPE: static file (XLSX / zip / etc.) downloads only. The ArcGIS REST query
 * endpoints (arcgis-fetch.ts, arcgis-plan-vic.ts) are NOT WAF-gated and keep
 * their own honest project User-Agent - do not route those through here.
 */
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// The navigation Accept a browser sends for a top-level file download. The
// trailing */* is what matters; the WAF rejects requests that look automated.
const ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

// undici statuses that indicate a WAF block / challenge rather than a real
// "this file is gone" - worth retrying with curl's different fingerprint.
const WAF_BLOCK_STATUSES = new Set([403, 406, 429, 503]);

/**
 * Browser-like request headers for `url`. The Referer is set to the target's
 * OWN origin (scheme://host/) - what a browser sends when a download starts from
 * a page on the same site. Pure + side-effect free so it is unit-testable
 * without a network. Caller `extra` headers win on conflict.
 */
export function browserHeaders(
  url: string,
  extra: Record<string, string> = {}
): Record<string, string> {
  const origin = new URL(url).origin;
  return {
    "User-Agent": BROWSER_UA,
    Accept: ACCEPT,
    "Accept-Language": "en-AU,en;q=0.9",
    Referer: `${origin}/`,
    ...extra,
  };
}

/**
 * fetch() with browser-like headers merged in. Follows redirects by default.
 * Caller `init.headers` (plain object) override the defaults from browserHeaders.
 */
export function browserFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const extra = (init.headers as Record<string, string> | undefined) ?? {};
  return fetch(url, {
    redirect: "follow",
    ...init,
    headers: browserHeaders(url, extra),
  });
}

/** Download `url` to `dest` via a curl subprocess (sends browser headers). */
async function curlToFile(url: string, dest: string): Promise<void> {
  const headerArgs = Object.entries(browserHeaders(url)).flatMap(([k, v]) => [
    "-H",
    `${k}: ${v}`,
  ]);
  try {
    // -f: fail (non-zero exit) on HTTP >= 400 without writing the error body, so
    // a block page never lands in `dest`. -L: follow redirects. -sS: quiet but
    // keep errors. --retry: ride out transient 5xx.
    await execFileAsync(
      "curl",
      ["-sS", "-L", "-f", "--retry", "2", "--max-time", "180", ...headerArgs, "-o", dest, url],
      { maxBuffer: 8 * 1024 * 1024 }
    );
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") {
      throw new Error(
        `curl not found on PATH - required to download from the fingerprinting WAF host: ${url}`
      );
    }
    const detail = err.stderr ? ` - ${String(err.stderr).trim()}` : "";
    throw new Error(`curl download failed (exit ${err.code ?? "?"}): ${url}${detail}`);
  }
}

/**
 * Stream a static file to `dest`, creating the parent directory. Tries undici
 * first; if the host's WAF blocks the Node client (e.g. a 403 fingerprint
 * challenge from planning.vic), falls back to curl, whose TLS fingerprint clears
 * it. Throws on a genuine non-2xx that curl also cannot satisfy, so a block
 * fails loudly instead of writing a 0-byte / HTML-error file.
 */
export async function downloadToFile(url: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  const res = await browserFetch(url);
  if (res.ok) {
    if (res.body) {
      // res.body is a web ReadableStream; Node's pipeline accepts it as a source
      // at runtime. The double cast crosses the (unrelated) web/Node stream types.
      await pipeline(
        res.body as unknown as NodeJS.ReadableStream,
        createWriteStream(dest)
      );
    }
    return;
  }
  // Release the undici body before retrying via a different transport.
  await res.body?.cancel().catch(() => {});
  if (WAF_BLOCK_STATUSES.has(res.status)) {
    await curlToFile(url, dest);
    return;
  }
  throw new Error(`Download ${res.status}: ${url}`);
}
