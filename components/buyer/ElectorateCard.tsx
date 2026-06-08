"use client";

import { useEffect, useState } from "react";
import { fetchElectorate, partyLabel, type Electorate } from "@/lib/electorate";

/**
 * "Electorates" card for the buyer report - a v2 civic lens. Auto-resolves the
 * federal division + Victorian state district at the pin (point-in-polygon) and
 * shows the sitting member + 2022 margin (lib/electorate). Omits itself
 * off-coverage + on failure. Context only, never scored.
 */
export function ElectorateCard({ lng, lat }: { lng: number; lat: number }) {
  const [e, setE] = useState<Electorate | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "none">("loading");

  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    setStatus("loading");
    fetchElectorate([lng, lat], { signal: ctrl.signal }).then((r) => {
      if (!live) return;
      setE(r);
      setStatus(r ? "done" : "none");
    });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [lng, lat]);

  if (status !== "done" || !e) return null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <h3 className="font-display text-base font-medium text-ink">Electorates</h3>
      <ul className="mt-2 space-y-1 text-xs text-ink-muted">
        {e.federal && (
          <li>
            <span className="font-medium text-ink">Federal:</span> {e.federal.division}
            {e.federal.member && (
              <>
                {" "}
                - {e.federal.member}
                {e.federal.party ? ` (${partyLabel(e.federal.party)})` : ""}
                {e.federal.marginPct != null ? `, won by ${e.federal.marginPct}% (2022 2PP)` : ""}
              </>
            )}
          </li>
        )}
        {e.state && (
          <li>
            <span className="font-medium text-ink">Victorian state:</span> {e.state.district}
            {e.state.region ? ` - ${e.state.region} region` : ""}
          </li>
        )}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-ink-muted">
        The federal and Victorian state electorates this address falls in. The margin is the 2022
        two-party-preferred result and is shown only for major-party seats (it&apos;s notional in
        Greens/independent seats). &copy; AEC + State of Victoria (CC BY).
      </p>
    </div>
  );
}
