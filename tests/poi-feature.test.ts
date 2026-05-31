import { describe, expect, it } from "vitest";
import { buildPoiPopupHtml, escapeHtml, poiCategoryLabel } from "@/lib/poi-feature";

describe("poi-feature", () => {
  it("escapes HTML in names", () => {
    expect(escapeHtml('<script>"x"</script>')).toBe(
      "&lt;script&gt;&quot;x&quot;&lt;/script&gt;"
    );
  });

  it("builds popup with website and OSM links", () => {
    const html = buildPoiPopupHtml({
      pinType: "post_office",
      name: "Australia Post",
      url: "https://auspost.com.au",
      osmUrl: "https://www.openstreetmap.org/node/1",
    });
    expect(html).toContain("Australia Post");
    expect(html).toContain("Post offices");
    expect(html).toContain("Visit website");
  });

  it("labels police category", () => {
    expect(poiCategoryLabel("police")).toBe("Police");
  });
});
