import { SiteFooter } from "@/components/SiteFooter";
import { WelcomeClient } from "@/components/WelcomeClient";

export const metadata = {
  title: "liveable.melbourne - search where you want to live",
  description:
    "Search any Melbourne suburb or address and see the liveability, risks and trade-offs the listing won't tell you - rent vs income, transport, safety, schools, hazards, sun and more. Open government data; free, no login; not advice.",
};

/**
 * Search-first onboarding landing: a Google-style hero that jumps to the map,
 * then a scroll-revealed walkthrough of how the product works. Static-export
 * safe (the interactive hero is a client component). Not yet wired as the
 * default entry (the map is still "/"); link-reachable at /welcome until the
 * product name + entry flow are finalised.
 */
export default function WelcomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <main className="flex-1">
        <WelcomeClient />
      </main>
      <SiteFooter />
    </div>
  );
}
