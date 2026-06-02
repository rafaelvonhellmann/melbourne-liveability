import projectsData from "@/data/generated/major-projects.json";

/**
 * Curated flagship VIC "Big Build" transport projects (Metro Tunnel + Suburban
 * Rail Loop East stations). There is no clean open dataset of Big Build sites, so
 * the list is hand-curated and each coordinate is resolved via OSM Nominatim at
 * build time (see scripts/build-major-projects.ts) and sanity-checked — sourced,
 * not fabricated. Used as a proximity nudge in the Buyer report; the official
 * project link carries the authoritative detail.
 */
export type MajorProject = {
  id: string;
  name: string;
  kind: string;
  label: string;
  status: string;
  lat: number;
  lng: number;
  sourceUrl: string;
  period: string;
};

export const MAJOR_PROJECTS: MajorProject[] = projectsData.projects as MajorProject[];
