import { describe, it, expect } from "vitest";
import { formatMetricValue, METRIC_CATALOG } from "../lib/metric-catalog";

describe("formatMetricValue", () => {
  it("formats rates with exactly 1 decimal and en-AU separators at any magnitude", () => {
    // Previously >=1000 dropped the decimal ("1,988") while smaller rates kept
    // it ("629.6") - the same unit must read uniformly in compare tables.
    expect(formatMetricValue(1988, "rate")).toBe("1,988.0");
    expect(formatMetricValue(629.6, "rate")).toBe("629.6");
    expect(formatMetricValue(0, "rate")).toBe("0.0");
    expect(formatMetricValue(12345.67, "rate")).toBe("12,345.7");
  });

  it("formats counts with 0 decimals and thousands separators", () => {
    expect(formatMetricValue(1988.4, "count")).toBe("1,988");
    expect(formatMetricValue(7, "count")).toBe("7");
  });

  it("dashes null / non-finite values", () => {
    expect(formatMetricValue(null, "rate")).toBe("—");
    expect(formatMetricValue(Number.NaN, "count")).toBe("—");
  });
});

describe("crime metric labelling", () => {
  it("states the per-100,000-residents unit explicitly on both crime metrics", () => {
    for (const key of ["propertyCrime", "violentCrime"]) {
      const def = METRIC_CATALOG.find((m) => m.key === key);
      expect(def).toBeDefined();
      expect(def!.unit).toBe("offences per 100,000 residents (rate)");
      expect(def!.description).toContain("per 100,000 residents");
    }
  });
});
