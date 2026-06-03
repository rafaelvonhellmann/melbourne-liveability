import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SimilarAreaItem } from "@/lib/similar-areas";
import { getDomain } from "@/lib/domains";

type SimilarAreasListProps = {
  items: SimilarAreaItem[];
  referenceName: string;
  /** Heading level isn't fixed - pass a compact variant for the map card. */
  compact?: boolean;
  className?: string;
};

/**
 * "Areas like this" - a ranked, honest list of the closest peer SA2s by
 * per-domain percentile similarity. Each row links to that area's profile. The
 * caption states what "alike" means (domain ranks, not price) and a thin match
 * (few comparable domains) is flagged inline rather than hidden.
 */
export function SimilarAreasList({
  items,
  referenceName,
  compact = false,
  className,
}: SimilarAreasListProps) {
  if (items.length === 0) {
    return (
      <p className={`text-sm text-ink-muted ${className ?? ""}`}>
        No closely comparable areas - {referenceName} has too few measured domains
        to match confidently.
      </p>
    );
  }

  return (
    <section
      aria-label={`Areas like ${referenceName}`}
      className={className}
    >
      {!compact && (
        <h2 className="font-display text-lg font-medium text-ink">
          Areas like {referenceName}
        </h2>
      )}
      <p className={`${compact ? "mb-1.5" : "mt-1 mb-3"} text-xs leading-snug text-ink-muted`}>
        Closest peers by how their domain percentiles line up - not by price or a
        single score.
      </p>
      <ul className="space-y-1.5">
        {items.map((it) => {
          const strengthLabels = it.sharedStrengths
            .map((d) => getDomain(d)?.label ?? d)
            .slice(0, compact ? 2 : 3);
          return (
            <li key={it.slug}>
              <Link
                href={`/places/${it.slug}`}
                className="group flex items-center gap-3 rounded-lg border border-surface-border px-3 py-2 transition-colors hover:border-accent hover:bg-surface-sunken"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {it.name}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {it.lga}
                  </span>
                  {strengthLabels.length > 0 && (
                    <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                      Both strong in {strengthLabels.join(", ")}
                    </span>
                  )}
                  {it.sharedDomainCount < 4 && (
                    <span className="mt-0.5 block text-[11px] text-ink-muted">
                      Based on only {it.sharedDomainCount} comparable{" "}
                      {it.sharedDomainCount === 1 ? "domain" : "domains"}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block text-sm font-semibold text-ink">
                    {it.similarity}%
                  </span>
                  <span className="block text-[10px] uppercase tracking-wide text-ink-muted">
                    alike
                  </span>
                </span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-ink-muted transition-colors group-hover:text-accent"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
