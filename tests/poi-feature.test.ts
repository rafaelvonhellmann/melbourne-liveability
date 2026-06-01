import { describe, expect, it } from "vitest";
import {
  buildPoiPopupHtml,
  escapeHtml,
  poiCategoryLabel,
  safeHttpUrl,
} from "@/lib/poi-feature";

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

  it("only allows http(s) popup links (blocks javascript: / data:)", () => {
    expect(safeHttpUrl("https://auspost.com.au")).toBe("https://auspost.com.au/");
    expect(safeHttpUrl("http://example.org/x")).toBe("http://example.org/x");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });

  it("drops a malicious website URL from the popup HTML", () => {
    const html = buildPoiPopupHtml({
      pinType: "gp",
      name: "Evil Clinic",
      url: "javascript:alert(document.cookie)",
    });
    expect(html).not.toContain("javascript:");
    expect(html).toContain("No website listed");
  });
});
