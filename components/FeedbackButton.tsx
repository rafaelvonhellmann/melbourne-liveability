"use client";

import { useEffect, useRef, useState } from "react";
import { timeoutSignal } from "@/lib/fetch-timeout";
import { MessageSquarePlus, X } from "lucide-react";

// Same delivery model as /alerts: a Formspree endpoint when configured, with a
// graceful fallback so feedback is never silently dropped. No personal email is
// hardcoded - the optional mailto target is also env-configured.
const FORMSPREE_ID = process.env.NEXT_PUBLIC_FORMSPREE_FEEDBACK_ID;
const FEEDBACK_EMAIL = process.env.NEXT_PUBLIC_FEEDBACK_EMAIL;

type Kind = "data-problem" | "suggestion";
type Status = "idle" | "sending" | "ok" | "mailto" | "unconfigured" | "error";

const KINDS: { id: Kind; label: string; hint: string }[] = [
  {
    id: "data-problem",
    label: "Report a data problem",
    hint: "A value looks wrong, a pin is misplaced, a source is stale.",
  },
  {
    id: "suggestion",
    label: "Suggest something",
    hint: "A dataset, layer, or feature you'd like us to add.",
  },
];

type FeedbackButtonProps = {
  /** Optional context (e.g. the suburb being viewed) added to the submission. */
  context?: string;
  className?: string;
};

export function FeedbackButton({ context, className }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("data-problem");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Esc closes; focus moves into the dialog on open and returns to the trigger
  // on close; Tab is trapped within the panel (DESIGN.md: focus-trapped + Esc).
  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) return;

    const ctx =
      context ?? (typeof window !== "undefined" ? window.location.href : "");
    const payload = {
      kind,
      message: message.trim(),
      email: email.trim() || "(not provided)",
      context: ctx,
      _subject: `Melbourne Liveability feedback - ${kind}`,
    };

    if (FORMSPREE_ID) {
      setStatus("sending");
      const t = timeoutSignal(10000);
      try {
        const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
          method: "POST",
          signal: t.signal,
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setStatus(res.ok ? "ok" : "error");
      } catch {
        setStatus("error");
      } finally {
        t.clear();
      }
      return;
    }

    // No Formspree configured - fall back to a prefilled mailto if a contact
    // address is set, otherwise tell the deployer how to enable delivery.
    if (FEEDBACK_EMAIL && typeof window !== "undefined") {
      const body = encodeURIComponent(
        `Type: ${kind}\nPage: ${ctx}\n\n${message.trim()}\n\nReply-to: ${
          email.trim() || "(anonymous)"
        }`
      );
      window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
        "Melbourne Liveability feedback"
      )}&body=${body}`;
      setStatus("mailto");
      return;
    }
    setStatus("unconfigured");
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          // Start every open from a clean slate (so a previously-sent message
          // never lingers on the next open).
          setStatus("idle");
          setMessage("");
          setEmail("");
          setOpen(true);
        }}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
        }
      >
        <MessageSquarePlus className="h-4 w-4" aria-hidden />
        Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="w-full max-w-md rounded-t-2xl border border-surface-border bg-surface p-5 shadow-card sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="feedback-title" className="font-display text-lg font-semibold text-ink">
                Report a problem or suggest a feature
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close feedback dialog"
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:text-accent"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {status === "ok" || status === "mailto" ? (
              <div className="mt-4">
                <p className="text-sm text-ink">
                  {status === "mailto"
                    ? "Opening your email app to send - thanks for helping improve the data."
                    : "Thanks - your feedback was sent. We review reports against the next data refresh."}
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <fieldset>
                  <legend className="text-sm font-medium text-ink">What is this about?</legend>
                  <div className="mt-2 space-y-2">
                    {KINDS.map((k, i) => (
                      <label
                        key={k.id}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
                          kind === k.id
                            ? "border-accent bg-accent/5"
                            : "border-surface-border hover:border-accent/50"
                        }`}
                      >
                        <input
                          ref={i === 0 ? firstFieldRef : undefined}
                          type="radio"
                          name="feedback-kind"
                          value={k.id}
                          checked={kind === k.id}
                          onChange={() => setKind(k.id)}
                          className="mt-0.5 h-4 w-4 text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        />
                        <span>
                          <span className="block font-medium text-ink">{k.label}</span>
                          <span className="block text-xs text-ink-muted">{k.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="feedback-message" className="block text-sm font-medium text-ink">
                    Details
                  </label>
                  <textarea
                    id="feedback-message"
                    required
                    minLength={5}
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      kind === "data-problem"
                        ? "Which area/metric, and what looks wrong?"
                        : "What would you like us to add, and why?"
                    }
                    className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                  />
                </div>

                <div>
                  <label htmlFor="feedback-email" className="block text-sm font-medium text-ink">
                    Email <span className="font-normal text-ink-muted">(optional, for follow-up)</span>
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                  />
                </div>

                {status === "error" && (
                  <p className="text-sm text-accent-focus">
                    Could not send. Please try again in a moment.
                  </p>
                )}
                {status === "unconfigured" && (
                  <p className="text-sm text-[#9A552F]">
                    Feedback delivery is not configured for this deployment. Set{" "}
                    <code className="text-xs">NEXT_PUBLIC_FORMSPREE_FEEDBACK_ID</code> (or{" "}
                    <code className="text-xs">NEXT_PUBLIC_FEEDBACK_EMAIL</code>) to enable it.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "sending" || message.trim().length < 5}
                  className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50"
                >
                  {status === "sending" ? "Sending…" : "Send feedback"}
                </button>
                <p className="text-[11px] leading-snug text-ink-muted">
                  Reports help us prioritise fixes and new datasets. We never fold user input
                  directly into scores - every change goes through the sourced pipeline.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
