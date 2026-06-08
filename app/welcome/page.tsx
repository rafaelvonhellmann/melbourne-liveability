"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The onboarding scroll-story has been retired - onboarding is now the
// lightweight lens-picker on the map plus a dismissible map tip. This route is
// kept valid (old links / bookmarks / search results) by redirecting to the map.
export default function WelcomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
