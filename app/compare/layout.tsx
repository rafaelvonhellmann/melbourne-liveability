import { Suspense } from "react";

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-8 text-slate-400">Loading compare…</div>
      }
    >
      {children}
    </Suspense>
  );
}
