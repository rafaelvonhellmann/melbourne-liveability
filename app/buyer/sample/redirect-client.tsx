"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Instant client-side hop to the canonical sample-report URL. */
export function RedirectClient() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/buyer/sample-report");
  }, [router]);
  return null;
}
