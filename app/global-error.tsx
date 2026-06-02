"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown in the root layout itself (where the
 * normal error.tsx cannot render because the layout failed). Must supply its own
 * <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#FAF9F5",
          color: "#1a1a18",
          textAlign: "center",
          padding: "0 1rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ marginTop: "0.5rem", maxWidth: "28rem", color: "#6B6862" }}>
          The page failed to load. Please reload, or try again shortly.
        </p>
        <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={reset}
            style={{
              borderRadius: "0.375rem",
              background: "#AD4F2E",
              color: "#fff",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error renders outside the router context; a hard navigation is intentional */}
          <a
            href="/"
            style={{
              borderRadius: "0.375rem",
              border: "1px solid #D8D4CC",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              color: "#1a1a18",
              textDecoration: "none",
            }}
          >
            Back to map
          </a>
        </div>
      </body>
    </html>
  );
}
