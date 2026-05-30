import type { SourceRecord } from "@/lib/sources";

type SourceDrawerProps = {
  sources: SourceRecord[];
  title?: string;
};

/** Collapsible per-source provenance: name, URL, licence, period, fetch date. */
export function SourceDrawer({ sources, title = "Sources & licences" }: SourceDrawerProps) {
  if (sources.length === 0) return null;
  return (
    <details className="mt-6 rounded-lg border border-surface-border bg-surface-raised/40 p-4 text-sm">
      <summary className="cursor-pointer font-medium text-slate-200">
        {title} ({sources.length})
      </summary>
      <ul className="mt-3 space-y-3">
        {sources.map((s) => (
          <li key={s.id} className="border-t border-surface-border/50 pt-3 first:border-0 first:pt-0">
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 hover:underline"
            >
              {s.name}
            </a>
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
              <span>
                <span className="text-slate-600">Licence:</span> {s.licence}
              </span>
              {s.period && (
                <span>
                  <span className="text-slate-600">Period:</span> {s.period}
                </span>
              )}
              {s.fetchedAt && (
                <span>
                  <span className="text-slate-600">Fetched:</span> {s.fetchedAt}
                </span>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </details>
  );
}
