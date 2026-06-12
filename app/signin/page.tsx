"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api-client";
import { PRODUCT_NAME } from "@/lib/brand";

type SignInState = "idle" | "sending" | "sent" | "unavailable";

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SignInState>("idle");
  const [error, setError] = useState("");
  const hintId = useId();
  const statusId = useId();
  const emailId = "signin-email";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim();
    if (!looksLikeEmail(value)) {
      setError("Enter a valid email address.");
      return;
    }

    setError("");
    setState("sending");
    try {
      await apiFetch("/api/auth/magic-link", {
        method: "POST",
        json: { email: value },
      });
      setState("sent");
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        setState("sent");
        return;
      }
      setState("unavailable");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10 text-ink">
      <section className="w-full max-w-md rounded-lg border border-surface-border bg-surface p-6 shadow-card">
        <Link href="/" className="text-base font-semibold uppercase tracking-[0.06em] text-accent">
          {PRODUCT_NAME}
        </Link>
        <h1 className="mt-6 font-display text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Enter your email and we will send a one-time link. No password is needed.
        </p>

        {state === "sent" ? (
          <div
            id={statusId}
            role="status"
            className="mt-6 rounded-lg border border-surface-border bg-surface-sunken px-4 py-3 text-sm text-ink"
          >
            <p className="font-medium">Check your email.</p>
            <p className="mt-1 text-ink-muted">
              If the link does not arrive, wait a minute and try again.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor={emailId} className="block text-sm font-medium text-ink">
                Email address
              </label>
              <input
                id={emailId}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                aria-describedby={`${hintId}${error ? ` ${statusId}` : ""}`}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                placeholder="you@example.com"
              />
              <p id={hintId} className="mt-1 text-xs leading-relaxed text-ink-muted">
                We only use this to send your sign-in link.
              </p>
              {error && (
                <p id={statusId} className="mt-2 text-sm text-[#9A552F]">
                  {error}
                </p>
              )}
            </div>

            {state === "unavailable" && (
              <p
                id={statusId}
                role="status"
                className="rounded-lg border border-[#E9C8B4] bg-[#FBEEE6] px-3 py-2 text-sm text-[#9A552F]"
              >
                {"Accounts aren't live yet. Try again after the account service is live."}
              </p>
            )}

            <button
              type="submit"
              disabled={state === "sending"}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50"
            >
              {state === "sending" ? "Sending..." : "Send sign-in link"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
