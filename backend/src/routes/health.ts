/**
 * GET /api/health - the one live route. Deliberately binding-free so it
 * proves "the worker runs", not "D1 is reachable"; deeper checks belong in a
 * separate /api/health/deep at cutover if wanted.
 */

import { json } from "../lib/http";

export function handleHealth(): Response {
  return json({ ok: true });
}
