"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api-client";
import { refreshSession } from "@/lib/use-session";
import { PRODUCT_NAME } from "@/lib/brand";

type VerifyState = "verifying" | "success" | "invalid" | "unavailable";

function tokenFromLocation(location: Location): string | null {
  const hashToken = location.hash.startsWith("#")
    ? new URLSearchParams(location.hash.slice(1)).get("token")
    : null;
  if (hashToken) return hashToken;
  return new URLSearchParams(location.search).get("token");
}

function scrubTokenFromUrl() {
  window.history.replaceState(window.history.state, "", window.location.pathname || "/auth");
}

export default function AuthVerifyPage() {
  const [state, setState] = useState<VerifyState>("verifying");

  useEffect(() => {
    const token = tokenFromLocation(window.location);
    if (window.location.hash || window.location.search) {
      scrubTokenFromUrl();
    }

    if (!token) {
      setState("invalid");
      return;
    }

    let live = true;
    let redirectTimer: number | undefined;

    async function verify() {
      try {
        await apiFetch("/api/auth/verify", {
          method: "POST",
          json: { token },
        });
        await refreshSession();
        if (!live) return;
        setState("success");
        redirectTimer = window.setTimeout(() => {
          window.location.assign("/account");
        }, 1500);
      } catch (err) {
        if (!live) return;
        if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
          setState("invalid");
          return;
        }
        setState("unavailable");
      }
    }

    void verify();
    return () => {
      live = false;
      if (redirectTimer !== undefined) window.clearTimeout(redirectTimer);
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10 text-ink">
      <section className="w-full max-w-md rounded-lg border border-surface-border bg-surface p-6 shadow-card">
        <Link href="/" className="inline-flex items-center gap-2 text-ink">
          <span className="text-base font-semibold uppercase tracking-[0.06em] text-accent">
            {PRODUCT_NAME}
          </span>
        </Link>
        {state === "verifying" && (
          <StatusBlock
            title="Checking your sign-in link"
            body="This should only take a moment."
          />
        )}
        {state === "success" && (
          <StatusBlock
            title="You're signed in"
            body="Opening your account page now."
          />
        )}
        {state === "invalid" && (
          <StatusBlock
            title="This sign-in link did not work"
            body="It may have expired or already been used."
          >
            <Link
              href="/signin"
              className="mt-4 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
            >
              Send a new link
            </Link>
          </StatusBlock>
        )}
        {state === "unavailable" && (
          <StatusBlock
            title="Accounts aren't live yet"
            body="The account service is not available from this site yet. Your on-device data is still here."
          >
            <Link href="/" className="mt-4 inline-flex text-sm text-accent hover:underline">
              Return to the map
            </Link>
          </StatusBlock>
        )}
      </section>
    </main>
  );
}

function StatusBlock({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
      {children}
    </div>
  );
}
