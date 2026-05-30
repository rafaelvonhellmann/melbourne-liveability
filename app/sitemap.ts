import type { MetadataRoute } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PlacesFile } from "@/lib/places-data";

export const dynamic = "force-static";

const SITE = "https://melbourne-liveability.example.au";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/compare`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/methodology`, changeFrequency: "monthly", priority: 0.6 },
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
