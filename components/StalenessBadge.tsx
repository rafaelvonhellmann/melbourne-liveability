type StalenessBadgeProps = {
  period?: string;
  stale?: boolean;
};

export function StalenessBadge({ period, stale }: StalenessBadgeProps) {
  if (!period && !stale) return null;
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-xs ${
        stale
          ? "bg-amber-900/40 text-amber-200"
          : "bg-surface-border/50 text-slate-400"
      }`}
    >
      {stale ? "Stale · " : ""}
      {period ? `Data as of ${period}` : "Period unknown"}
    </span>
  );
}
