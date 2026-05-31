type StalenessBadgeProps = {
  period?: string;
  stale?: boolean;
};

export function StalenessBadge({ period, stale }: StalenessBadgeProps) {
  if (!period && !stale) return null;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
        stale
          ? "border border-[#E9C8B4] bg-[#FBEEE6] text-[#9A552F]"
          : "border border-surface-border bg-surface-sunken text-ink-muted"
      }`}
    >
      {stale ? "Stale · " : ""}
      {period ? `Data as of ${period}` : "Period unknown"}
    </span>
  );
}
