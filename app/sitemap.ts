import type { MetadataRoute } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PlacesFile } from "@/lib/places-data";

export const dynamic = "force-static";

// Production site URL (origin + any sub-path). Override with NEXT_PUBLIC_SITE_URL
// (e.g. a future custom domain); defaults to the live GitHub Pages project URL.
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://rafaelvonhellmann.github.io/melbourne-liveability";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/buyer`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/buyer/sample-report`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/compare`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/methodology`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/alerts`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/account`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/disclaimer`, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const file = path.join(process.cwd(), "public", "data", "places.json");
    const data = JSON.parse(await readFile(file, "utf8")) as PlacesFile;
    const places = data.places
      .filter((p) => !p.nonResidential)
      .map((p) => ({
        url: `${SITE}/places/${p.slug}`,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      }));
    return [...staticRoutes, ...places];
  } catch {
    return staticRoutes;
  }
}
