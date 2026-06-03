import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { FindAreasClient } from "@/components/FindAreasClient";

export const metadata = {
  title: "Find areas like this - search Greater Melbourne by what matters to you",
  description:
    "Describe what you want in a place - safe, affordable, near transport, good schools - and rank Greater Melbourne areas by the liveability measures your words map to. Deterministic, fully sourced, context only.",
};

export default function FindPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Map
        </Link>
        <div className="mt-6">
          <FindAreasClient />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
