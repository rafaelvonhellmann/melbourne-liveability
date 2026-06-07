"use client";

import { useEffect, useState } from "react";
import type { Place } from "@/lib/types";

/**
 * "How do I compare here?" - a context lens that lets a buyer/renter enter their
 * own household income and see, for THIS area:
 *   - the typical weekly rent as a share of their income (vs the 30% stress mark)
 *   - how their income sits against the area median
 *
 * Uses only data we already hold: median equivalised household income (ABS) and
 * the rent-to-income ratio (median rent / local income), from which the typical
 * weekly rent is derived. No sale-price data, so it is NOT a buy-affordability or
 * borrowing-capacity estimate - rent only. Never part of the liveability score.
 *
 * The income is remembered locally (localStorage) so it carries across areas.
 */
const STORAGE_KEY = "lm.householdIncomeAnnual";

export function IncomeAffordabilityCard({ place }: { place: Place }) {
  const medianIncomeWeekly = place.domains?.income?.subIndicators?.medianDhi?.raw ?? null;
  const rentRatio = place.domains?.affordability?.subIndicators?.rentToIncome?.raw ?? null;
  const medianRentWeekly =
    rentRatio != null && medianIncomeWeekly != null
      ? Math.round(rentRatio * medianIncomeWeekly)
      : null;

  const [annual, setAnnual] = useState<number | null>(null);
  const [raw, setRaw] = useState("");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n) && n > 0) {
        setAnnual(n);
        setRaw(n.toLocaleString("en-AU"));
      }
    }
  }, []);

  const commit = (text: string) => {
    // Reject malformed input (scientific notation / multiple dots) and clamp to a
    // sane annual household-income range, so a fat-finger - e.g. a weekly figure
    // typed into the annual field - can't render nonsense like "43000% of income".
    const cleaned = text.replace(/[^0-9.]/g, "");
    const n = Number(cleaned);
    const ok =
      /^[0-9]+(\.[0-9]+)?$/.test(cleaned) && Number.isFinite(n) && n >= 10000 && n <= 5_000_000;
    if (ok) {
      setAnnual(n);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(Math.round(n)));
      } catch {
        /* storage may be blocked - keep in-memory */
      }
    } else {
      setAnnual(null);
    }
  };

  const weekly = annual != null ? annual / 52 : null;
  const rentShare =
    weekly != null && medianRentWeekly != null && weekly > 0
      ? (medianRentWeekly / weekly) * 100
      : null;
  const stressed = rentShare != null && rentShare > 30;
  const incomeVsMedianPct =
    weekly != null && medianIncomeWeekly != null && medianIncomeWeekly > 0
      ? ((weekly - medianIncomeWeekly) / medianIncomeWeekly) * 100
      : null;

  return (
    <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-medium text-ink">How do I compare here?</h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Enter your household&apos;s total income and we&apos;ll show how it sits against this
        area - rent only, no buy-price or borrowing estimate.
      </p>

      <label className="mt-3 block text-xs font-medium text-ink" htmlFor="hh-income">
        Your household income (per year, before tax)
      </label>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-sm text-ink-muted">$</span>
        <input
          id="hh-income"
          inputMode="numeric"
          placeholder="e.g. 120,000"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          }}
          className="w-40 rounded-md border border-surface-border bg-surface px-2.5 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>

      {weekly == null ? (
        <p className="mt-3 text-xs text-ink-muted">
          That&apos;s about{" "}
          {medianRentWeekly != null ? `$${medianRentWeekly.toLocaleString("en-AU")}/week` : "the local"}{" "}
          typical rent - enter your income to see the share.
        </p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {rentShare != null && medianRentWeekly != null && (
            <div
              className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${
                stressed
                  ? "border-[#E9C8B4] bg-[#FBEEE6] text-[#9A552F]"
                  : "border-surface-border bg-surface-sunken text-ink"
              }`}
            >
              The typical home here rents for about{" "}
              <b>${medianRentWeekly.toLocaleString("en-AU")}/week</b>.{" "}
              {rentShare > 100 ? (
                <>
                  That is <b>more than your entire gross income</b> - check you entered your{" "}
                  annual (pre-tax) household income.
                </>
              ) : (
                <>
                  At your income that is <b>{rentShare.toFixed(0)}%</b> of your gross income -{" "}
                  {stressed
                    ? "above the 30% the ABS treats as housing stress."
                    : "under the 30% housing-stress mark."}
                </>
              )}
            </div>
          )}
          {incomeVsMedianPct != null && (
            <p className="text-xs leading-relaxed text-ink-muted">
              Your household income is{" "}
              <b className="text-ink">
                {Math.abs(incomeVsMedianPct) > 300
                  ? incomeVsMedianPct >= 0
                    ? "several times above"
                    : "well below"
                  : `about ${Math.abs(incomeVsMedianPct).toFixed(0)}% ${incomeVsMedianPct >= 0 ? "above" : "below"}`}
              </b>{" "}
              this area&apos;s median. (The median is the ABS figure adjusted for household
              size, so treat this as a guide, not an exact rank.)
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
        <b className="text-ink">Caveat:</b> general information only, not financial advice. Rent
        is derived from ABS medians (no sale-price or loan data); your real costs depend on the
        specific property, household size and lender.
      </p>
    </section>
  );
}
