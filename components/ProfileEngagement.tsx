"use client";

import { useEffect } from "react";
import { trackRecentView } from "@/lib/user-prefs";
import { AddToShortlistButton } from "./AddToShortlistButton";

type ProfileEngagementProps = {
  slug: string;
  name: string;
};

/** Client-only: records recent view + shortlist control on profile pages. */
export function ProfileEngagement({ slug, name }: ProfileEngagementProps) {
  useEffect(() => {
    trackRecentView(slug, name);
  }, [slug, name]);

  return (
    <div className="mt-4">
      <AddToShortlistButton slug={slug} />
    </div>
  );
}
