import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Map" },
  { href: "/buyer", label: "Buyer check" },
  { href: "/find", label: "Find areas" },
  { href: "/about", label: "About & trust" },
  { href: "/compare", label: "Compare" },
  { href: "/account", label: "Your data" },
  { href: "/methodology", label: "Methodology" },
  { href: "/methodology#attribution", label: "Data licences & attribution" },
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
        <div className="mb-4 flex items-center gap-2 text-ink">
          {/* Casement-F mark (same geometry as app/icon.svg), ink via currentColor */}
          <svg width="20" height="20" viewBox="0 0 26 28" aria-hidden="true" focusable="false">
            <g fill="currentColor"><circle cx="6" cy="4" r="1.9" /><circle cx="11" cy="4" r="1.9" /><circle cx="16" cy="4" r="1.9" /><circle cx="21" cy="4" r="1.9" /><circle cx="6" cy="9" r="1.9" /><circle cx="6" cy="14" r="1.9" /><circle cx="11" cy="14" r="1.9" /><circle cx="16" cy="14" r="1.9" /><circle cx="6" cy="19" r="1.9" /><circle cx="6" cy="24" r="1.9" /></g>
          </svg>
          <span className="text-sm font-semibold uppercase tracking-[0.06em]">
            {PRODUCT_NAME}
          </span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-accent">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="mt-4 text-xs leading-relaxed">
          <span className="font-medium text-ink">{PRODUCT_NAME}</span> compiles
          Australian government / official open data (ABS, PTV, Victorian planning
          &amp; MapShare - CC BY 4.0; VCSA - CC BY 3.0 AU) with © OpenStreetMap
          contributors (ODbL) as an attributed fallback. Scores are one optional lens
          over open data -{" "}
          <span className="font-medium text-ink">not relocation, financial, or legal advice</span>.
        </p>
      </div>
    </footer>
  );
}
