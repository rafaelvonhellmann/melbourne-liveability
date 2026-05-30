"use client";

import { useEffect, useState } from "react";
import { addToShortlist, isInShortlist, removeFromShortlist } from "@/lib/user-prefs";

type AddToShortlistButtonProps = {
  slug: string;
  onShortlistChange?: (slugs: string[]) => void;
};

export function AddToShortlistButton({
  slug,
  onShortlistChange,
}: AddToShortlistButtonProps) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isInShortlist(slug));
  }, [slug]);

  return (
    <button
      type="button"
      onClick={() => {
        const next = saved ? removeFromShortlist(slug) : addToShortlist(slug);
        setSaved(next.shortlist.includes(slug));
        onShortlistChange?.(next.shortlist);
      }}
      className={`rounded border px-3 py-1.5 text-sm ${
        saved
          ? "border-emerald-700 bg-emerald-900/30 text-emerald-200"
          : "border-surface-border text-slate-300 hover:border-emerald-700"
      }`}
    >
      {saved ? "On shortlist ✓" : "Add to shortlist"}
    </button>
  );
}
