import { describe, it, expect } from "vitest";
import {
  summarizeApprovals,
  monthsBack,
  formatMonth,
  type MonthlySeries,
} from "../lib/approvals";

/** Build a contiguous monthly series of `n` months ending at `latest`, each
 *  month carrying the given total/house counts. */
function series(
  latest: string,
  n: number,
  total: number,
  house: number
): MonthlySeries {
  const out: MonthlySeries = {};
  for (const m of monthsBack(latest, n)) out[m] = { total, house };
  return out;
}

describe("monthsBack", () => {
  it("walks back across a year boundary, most-recent first", () => {
    expect(monthsBack("2026-01", 3)).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
  it("returns [] for a malformed month", () => {
    expect(monthsBack("nope", 3)).toEqual([]);
  });
});

describe("formatMonth", () => {
  it("formats YYYY-MM as Mon YYYY", () => {
    expect(formatMonth("2026-03")).toBe("Mar 2026");
    expect(formatMonth("2025-12")).toBe("Dec 2025");
  });
  it("passes through malformed input unchanged", () => {
    expect(formatMonth("2026")).toBe("2026");
  });
});

describe("summarizeApprovals", () => {
  it("sums the trailing 12 months and the prior 12 for trend", () => {
    // 24 contiguous months ending 2026-03: each month 10 total / 8 house.
    const s = summarizeApprovals(series("2026-03", 24, 10, 8));
    expect(s).not.toBeNull();
    expect(s!.latestMonth).toBe("2026-03");
    expect(s!.trailing12).toBe(120); // 12 * 10
    expect(s!.prior12).toBe(120); // fully covered prior window
    expect(s!.housePct).toBe(80); // 8/10
    expect(s!.period).toBe("12 months to Mar 2026");
    expect(s!.sourceId).toBe("abs-building-approvals");
  });

  it("leaves prior12 null when the prior window is not fully covered", () => {
    // Only 13 months: trailing window full, prior window has just 1 month.
    const s = summarizeApprovals(series("2026-03", 13, 10, 5));
    expect(s!.trailing12).toBe(120);
    expect(s!.prior12).toBeNull();
    expect(s!.housePct).toBe(50);
  });

  it("returns housePct null and trailing12 0 for an all-zero year", () => {
    const s = summarizeApprovals(series("2026-03", 12, 0, 0));
    expect(s!.trailing12).toBe(0);
    expect(s!.housePct).toBeNull();
  });

  it("clamps housePct to 0..100 even if house exceeds total", () => {
    const s = summarizeApprovals(series("2026-03", 12, 5, 9));
    expect(s!.housePct).toBe(100);
  });

  it("returns null for an empty or missing series", () => {
    expect(summarizeApprovals({})).toBeNull();
    expect(summarizeApprovals(null)).toBeNull();
    expect(summarizeApprovals(undefined)).toBeNull();
  });
});
