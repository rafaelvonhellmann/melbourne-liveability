"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/share-url";

type ShareViewButtonProps = {
  getUrl: () => string;
  label?: string;
  className?: string;
};

export function ShareViewButton({
  getUrl,
  label = "Copy link",
  className = "",
}: ShareViewButtonProps) {
  const [status, setStatus] = useState<"idle" | "ok" | "fail">("idle");

  return (
    <button
      type="button"
      className={
        className ||
        "rounded border border-surface-border px-2 py-1 text-xs text-slate-300 hover:border-emerald-700 hover:text-emerald-200"
      }
      onClick={async () => {
        const ok = await copyToClipboard(
          typeof window !== "undefined" ? window.location.origin + getUrl() : getUrl()
        );
        setStatus(ok ? "ok" : "fail");
        setTimeout(() => setStatus("idle"), 2000);
      }}
    >
      {status === "ok" ? "Copied!" : status === "fail" ? "Copy failed" : label}
    </button>
  );
}
