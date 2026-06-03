import { describe, it, expect } from "vitest";
import { browserHeaders } from "../scripts/lib/gov-fetch";

describe("browserHeaders", () => {
  const url =
    "https://www.planning.vic.gov.au/__data/assets/excel_doc/0036/691659/VIF2023_SA2_Pop_Age_Sex_Projections_to_2036_Release_2.xlsx";

  it("sends a browser User-Agent (not the project UA the WAF challenges)", () => {
    const h = browserHeaders(url);
    expect(h["User-Agent"]).toMatch(/^Mozilla\/5\.0/);
    expect(h["User-Agent"]).not.toMatch(/MelbourneLiveability/);
  });

  it("sets Referer to the target's own origin (the verified WAF-clearing combo)", () => {
    expect(browserHeaders(url).Referer).toBe("https://www.planning.vic.gov.au/");
  });

  it("derives the Referer per host, not hardcoded to planning.vic", () => {
    expect(browserHeaders("https://discover.data.vic.gov.au/x/y.xlsx").Referer).toBe(
      "https://discover.data.vic.gov.au/"
    );
  });

  it("includes an Accept header ending in */* so non-HTML files are accepted", () => {
    expect(browserHeaders(url).Accept).toMatch(/\*\/\*/);
  });

  it("lets caller headers override the defaults", () => {
    const h = browserHeaders(url, { Referer: "https://example.org/", Range: "bytes=0-0" });
    expect(h.Referer).toBe("https://example.org/");
    expect(h.Range).toBe("bytes=0-0");
    expect(h["User-Agent"]).toMatch(/^Mozilla/); // untouched default
  });
});
