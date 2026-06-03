/**
 * Pure summarisation of an SA2 building-approvals monthly series into the
 * compact DevelopmentPipeline that ships in place.context (the "what's being
 * built" Horizon signal). Context only, never scored. No interpolation: we sum
 * only the months actually present in the ABS series.
 *
 * Kept side-effect free (no I/O, no Date.now) so it is unit-testable and so the
 * build is deterministic - the latest month is read from the data, never the
 * wall clock.
 */
import type { DevelopmentPipeline } from "./types";

/** One month of approvals for an SA2: total residential + the detached-house subset. */
export type MonthBucket = { total: number; house: number };
/** month string ("YYYY-MM") -> bucket. */
export type MonthlySeries = Record<string, MonthBucket>;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-03" -> "Mar 2026". Returns the input unchanged if it is malformed. */
export function formatMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return ym;
  return `${MONTH_NAMES[mi]} ${m[1]}`;
}

/**
 * `n` consecutive month strings ending at (and including) `latest`, most-recent
 * first. e.g. monthsBack("2026-01", 3) -> ["2026-01","2025-12","2025-11"].
 */
export function monthsBack(latest: string, n: number): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(latest);
  if (!m) return [];
  let yy = Number(m[1]);
  let mm = Number(m[2]);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${yy}-${String(mm).padStart(2, "0")}`);
    mm -= 1;
    if (mm === 0) {
      mm = 12;
      yy -= 1;
    }
  }
  return out;
}

function sumWindow(series: MonthlySeries, window: string[]) {
  let total = 0;
  let house = 0;
  let present = 0;
  for (const mo of window) {
    const b = series[mo];
    if (b) {
      total += b.total;
      house += b.house;
      present += 1;
    }
  }
  return { total, house, present };
}

/**
 * Summarise a monthly series into a DevelopmentPipeline, or null if the series
 * holds no months. Trailing-12 = the 12 calendar months ending at the latest
 * month present; prior-12 = the 12 before that (null unless fully covered, so a
 * year-on-year comparison is never implied from a partial window).
 */
export function summarizeApprovals(
  series: MonthlySeries | null | undefined
): DevelopmentPipeline | null {
  if (!series) return null;
  const months = Object.keys(series).sort();
  if (months.length === 0) return null;
  const latestMonth = months[months.length - 1];

  const win1 = monthsBack(latestMonth, 12);
  const earliestWin1 = win1[win1.length - 1];
  // The month immediately before win1's earliest, then 12 months back from it.
  const beforeWin1 = monthsBack(earliestWin1, 2)[1];
  const win2 = monthsBack(beforeWin1, 12);

  const w1 = sumWindow(series, win1);
  const w2 = sumWindow(series, win2);

  const trailing12 = Math.round(w1.total);
  const prior12 = w2.present === 12 ? Math.round(w2.total) : null;
  const housePct =
    w1.total > 0
      ? Math.min(100, Math.max(0, Math.round((w1.house / w1.total) * 100)))
      : null;

  return {
    latestMonth,
    trailing12,
    prior12,
    housePct,
    sourceId: "abs-building-approvals",
    period: `12 months to ${formatMonth(latestMonth)}`,
  };
}
