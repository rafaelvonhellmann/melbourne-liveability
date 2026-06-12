"use client";

import Link from "next/link";
import { useSession } from "@/lib/use-session";

export function HeaderAccountLink({ hideOnSmall = true }: { hideOnSmall?: boolean }) {
  const session = useSession();
  const title =
    session.status === "signed-in" ? `Signed in as ${session.user.email}` : undefined;

  return (
    <Link
      href="/account"
      title={title}
      className={`rounded-md border border-surface-border px-3 py-1.5 text-ink transition-colors hover:border-accent hover:text-accent ${
        hideOnSmall ? "hidden lg:inline-block" : ""
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        Your data
        {session.status === "signed-in" && (
          <span
            data-testid="session-indicator"
            className="h-1.5 w-1.5 rounded-full bg-[#067647]"
            aria-hidden="true"
          />
        )}
      </span>
    </Link>
  );
}
