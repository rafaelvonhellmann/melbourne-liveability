import Link from "next/link";

export function Attribution({ className }: { className?: string }) {
  return (
    <div
      className={
        className ??
        "rounded-lg border border-surface-border bg-surface/90 px-2 py-1 text-[10px] leading-tight text-ink-muted shadow-card backdrop-blur"
      }
    >
      Data: ABS (CC BY 4.0), PTV GTFS / DTP (CC BY 4.0), VIC Crime Statistics
      Agency (CC BY 4.0), ©{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-ink"
      >
        OpenStreetMap
      </a>{" "}
      contributors (ODbL).{" "}
      <Link href="/methodology#attribution" className="underline hover:text-ink">
        Licences
      </Link>{" "}
      ·{" "}
      <Link href="/disclaimer" className="underline hover:text-ink">
        Disclaimer
      </Link>
    </div>
  );
}
