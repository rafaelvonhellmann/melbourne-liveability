import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Mirror the sitemap's site URL so the Sitemap: pointer is correct on the
// GitHub Pages sub-path (override with NEXT_PUBLIC_SITE_URL for a custom domain).
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://rafaelvonhellmann.github.io/melbourne-liveability";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
