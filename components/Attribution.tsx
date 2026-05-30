import Link from "next/link";

export function Attribution({ className }: { className?: string }) {
  return (
    <div
      className={
        className ??
        "rounded border border-surface-border bg-surface-raised/90 px-2 py-1 text-[10px] leading-tight text-slate-500 backdrop-blur"
      }
    >
      Data: ABS (CC BY 4.0), PTV GTFS / DTP (CC BY 4.0), VIC Crime Statistics
      Agency (CC BY 4.0), ©{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-slate-300"
      >
        OpenStreetMap
      </a>{" "}
      contributors (ODbL).{" "}
      <Link href="/disclaimer" className="underline hover:text-slate-300">
        Disclaimer
      </Link>
    </div>
  );
}
