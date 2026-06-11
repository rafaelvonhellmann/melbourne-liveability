/**
 * Prices lens: the honest "price / sales context not included" finding.
 * Split out of lib/buyer-report.ts (P1-10 decomposition) - no logic changes.
 */
import type { BuyerFinding } from "./types";

/** 8) Price / sales context (NOT included). */
export function pushPriceFinding(findings: BuyerFinding[]): void {
  findings.push({
    id: "price-unavailable",
    kind: "unavailable",
    severity: "info",
    title: "Price and sales context not included yet",
    summary:
      "This MVP does not estimate property value or price growth. Future versions may add transparent price-context data where licensing allows.",
    confidence: "unknown",
    geography: "unknown",
    caveat: "Price, valuation and rental-yield data are not included in this version - check a listing portal, recent comparable sales, or an agent for indicative pricing.",
  });
}
