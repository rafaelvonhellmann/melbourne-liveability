import { describe, expect, it } from "vitest";
import { overpassRetryPlan } from "@/scripts/lib/arcgis-fetch";

describe("overpassRetryPlan", () => {
  it("retries transient HTTP statuses with exponential backoff", () => {
    expect(overpassRetryPlan(429, 0)).toEqual({ retry: true, waitMs: 2_000 });
    expect(overpassRetryPlan(504, 1)).toEqual({ retry: true, waitMs: 4_000 });
    expect(overpassRetryPlan(502, 2)).toEqual({ retry: true, waitMs: 8_000 });
    expect(overpassRetryPlan(503, 0).retry).toBe(true);
  });

  it("retries network errors", () => {
    expect(overpassRetryPlan("network", 0)).toEqual({ retry: true, waitMs: 2_000 });
  });

  it("does NOT retry non-transient statuses (fail fast)", () => {
    expect(overpassRetryPlan(400, 0)).toEqual({ retry: false, waitMs: 0 });
    expect(overpassRetryPlan(404, 1)).toEqual({ retry: false, waitMs: 0 });
  });

  it("honours Retry-After (seconds), capped at 60s", () => {
    expect(overpassRetryPlan(429, 0, 10).waitMs).toBe(10_000);
    expect(overpassRetryPlan(429, 0, 120).waitMs).toBe(60_000);
  });

  it("caps exponential backoff at 30s", () => {
    expect(overpassRetryPlan(429, 10).waitMs).toBe(30_000);
  });
});
