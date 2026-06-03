import Link from "next/link";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Map" },
  { href: "/buyer", label: "Buyer check" },
  { href: "/about", label: "About & trust" },
  { href: "/compare", label: "Compare" },
  { href: "/account", label: "Your data" },
  { href: "/methodology", label: "Methodology" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/disclaimer", label: "Disclaimer" },
];

/**
 * Shared footer for the content pages (NOT the full-screen map, which keeps its
 * own compact Attribution). Carries the legal/trust links + open-data
 * attribution required by the source licences.
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-surface-border bg-surface">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-ink-muted">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-accent">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="mt-4 text-xs leading-relaxed">
          <span className="font-medium text-ink">liveable.melbourne</span> compiles
          Australian government / official open data (ABS, PTV, VCSA, Victorian planning
          &amp; MapShare - CC BY 4.0) with © OpenStreetMap contributors (ODbL) as an
          attributed fallback. Scores are one optional lens over open data —{" "}
          <span className="font-medium text-ink">not relocation, financial, or legal advice</span>.
        </p>
      </div>
    </footer>
  );
}
