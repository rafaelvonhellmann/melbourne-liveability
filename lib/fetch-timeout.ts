/**
 * A time-bounded AbortSignal for runtime client fetches, optionally chained to a
 * caller's own signal. Without this, a stalled upstream (a TCP connection that
 * never RSTs - common on flaky mobile / captive portals) leaves a fetch pending
 * forever, so the UI sits on a spinner that never resolves. Manual
 * setTimeout+AbortController (not AbortSignal.timeout/any) for broad browser
 * support. Always call clear() in a finally to release the timer + listener.
 */
export function timeoutSignal(
  ms: number,
  upstream?: AbortSignal
): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  if (upstream) {
    if (upstream.aborted) ctrl.abort();
    else upstream.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    clear: () => {
      clearTimeout(timer);
      upstream?.removeEventListener("abort", onAbort);
    },
  };
}
