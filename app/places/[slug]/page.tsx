import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PlacesFile } from "@/lib/places-data";
import { computeWeightedScore } from "@/lib/scoring";
import { getDefaultWeights } from "@/lib/weights";
import { PlaceProfileClient } from "@/components/PlaceProfileClient";

type Props = { params: Promise<{ slug: string }> };

async function loadPlacesFile(): Promise<PlacesFile> {
  const file = path.join(process.cwd(), "public", "data", "places.json");
  return JSON.parse(await readFile(file, "utf8")) as PlacesFile;
}

export async function generateStaticParams() {
  try {
    const data = await loadPlacesFile();
    return data.places
      .filter((p) => !p.nonResidential)
      .map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const data = await loadPlacesFile();
  const place = data.places.find((p) => p.slug === slug);
  if (!place) return { title: "Place not found" };
  const score = computeWeightedScore(place, getDefaultWeights()).total;
  return {
    title: `${place.name} liveability score · Melbourne`,
    description: `${place.name} (${place.lga}) liveability score ${score.toFixed(0)} — seven-domain breakdown with methodology-linked sources.`,
    openGraph: {
      title: `${place.name} · ${score.toFixed(0)} liveability`,
      description: `Greater Melbourne SA2 ${place.sa2Code} — compare domains and sources.`,
      type: "website",
    },
  };
}

export default async function PlaceProfilePage({ params }: Props) {
  const { slug } = await params;
  const data = await loadPlacesFile();
  const place = data.places.find((p) => p.slug === slug);

  if (!place) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-ink">
        <p>Place not found.</p>
        <Link href="/" className="text-accent hover:underline">
          ← Map
        </Link>
      </div>
    );
  }

  return <PlaceProfileClient place={place} />;
}
