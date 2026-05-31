import { Suspense } from "react";

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-bg text-ink-muted">
          Loading map…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
