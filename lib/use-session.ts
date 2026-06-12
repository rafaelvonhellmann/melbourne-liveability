"use client";

import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api-client";

export type SessionUser = {
  id: string;
  email: string;
  kind: "buyer" | "agent";
  createdAt?: string;
};

export type SessionState =
  | { status: "loading"; user?: undefined }
  | { status: "signed-out"; user?: undefined }
  | { status: "signed-in"; user: SessionUser }
  | { status: "unavailable"; user?: undefined };

type SessionResult = Exclude<SessionState, { status: "loading" }>;

const LOADING: SessionState = { status: "loading" };

let cachedSession: SessionResult | null = null;
let inflight: Promise<SessionResult> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setCachedSession(next: SessionResult) {
  cachedSession = next;
  emit();
}

function currentSession(): SessionState {
  return cachedSession ?? LOADING;
}

async function loadSession(force = false): Promise<SessionResult> {
  if (!force && cachedSession) return cachedSession;
  if (inflight) return inflight;

  inflight = apiFetch<SessionUser>("/api/me")
    .then((user) => ({ status: "signed-in", user }) satisfies SessionResult)
    .catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        return { status: "signed-out" } satisfies SessionResult;
      }
      return { status: "unavailable" } satisfies SessionResult;
    })
    .then((next) => {
      setCachedSession(next);
      return next;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function refreshSession(): Promise<SessionResult> {
  return loadSession(true);
}

export async function signOut(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } finally {
    setCachedSession({ status: "signed-out" });
  }
}

export function useSession(): SessionState & { signOut: () => Promise<void> } {
  const [session, setSession] = useState<SessionState>(() => currentSession());

  useEffect(() => {
    const listener = () => setSession(currentSession());
    listeners.add(listener);
    void loadSession(false);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { ...session, signOut };
}

export function __resetSessionForTests() {
  cachedSession = null;
  inflight = null;
  listeners.clear();
}
