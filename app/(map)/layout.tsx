import { Suspense } from "react";

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-surface text-slate-400">
          Loading map…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
