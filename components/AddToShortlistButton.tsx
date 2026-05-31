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
      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
        saved
          ? "border-accent bg-accent text-accent-ink"
          : "border-surface-border text-ink hover:border-accent hover:text-accent"
      }`}
    >
      {saved ? "On shortlist ✓" : "Add to shortlist"}
    </button>
  );
}
