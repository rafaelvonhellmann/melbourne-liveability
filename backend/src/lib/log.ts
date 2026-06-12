/**
 * Structured logging: one JSON line per event, queryable in `wrangler tail`.
 *
 * Rules:
 * - Responses NEVER carry stacks or error internals; logs may (logError).
 * - Never log secrets, plaintext magic-link tokens or session ids. The
 *   ConsoleEmailProvider dev stub is the one sanctioned exception (it logs
 *   the link INSTEAD of sending it - dev only, selected by EMAIL_PROVIDER).
 */

export type LogFields = Record<string, unknown>;

/** Info-level event. `event` is a stable snake_case name; fields are flat. */
export function logEvent(event: string, fields: LogFields = {}): void {
  console.log(JSON.stringify({ event, ...fields }));
}

/** Error-level event. Stacks are fine here - they stop at the log sink. */
export function logError(event: string, err: unknown, fields: LogFields = {}): void {
  const detail =
    err instanceof Error
      ? { error: err.message, stack: err.stack }
      : { error: String(err) };
  console.error(JSON.stringify({ event, ...fields, ...detail }));
}
