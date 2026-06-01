"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary (App Router). Catches render/runtime errors in any
 * page below the root layout and shows a recoverable fallback instead of a blank
 * screen — a baseline stability guarantee for the alpha.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in the browser console + (when wired) analytics/error reporting.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-center text-ink">
      <h1 className="font-display text-2xl font-semibold text-ink">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        An unexpected error occurred while loading this view. You can retry, or head back to
        the map. If it keeps happening, please use the feedback button to let us know.
      </p>
      {error.digest && (
        <p className="num mt-1 text-[11px] text-ink-muted">Ref: {error.digest}</p>
      )}
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-surface-border px-4 py-2 text-sm text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Back to map
        </Link>
      </div>
    </div>
  );
}
