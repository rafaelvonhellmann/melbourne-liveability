"use client";

import { useEffect, useState } from "react";
import { ApiError, apiFetch, type ApiFetchInit } from "./api-client";
import type { SessionState, SessionUser } from "./use-session";
import {
  DEFAULT_PREFS,
  PREFS_CHANGED_EVENT,
  loadUserPrefs,
  saveUserPrefs,
  type SavedCheck,
  type UserPrefs,
} from "./user-prefs";
import {
  PROFILE_CHANGED_EVENT,
  clearProfile,
  loadProfile,
  saveProfile,
  type AgentClient,
  type UserProfile,
} from "./user-profile";

const MAX_CLIENTS = 30;
const MAX_PREF_SHORTLIST = 100;
const MAX_PREF_SAVED_CHECKS = 50;
const PUSH_DEBOUNCE_MS = 2_000;

export type SyncedUserPrefs = UserPrefs & { updatedAt: string };
export type SyncStore = "prefs" | "profile";
export type SyncKind = SyncStore | "all";
export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

type SyncApiFetch = <T = unknown>(
  path: `/api/${string}`,
  init?: ApiFetchInit
) => Promise<T>;

type SyncController = {
  status: SyncStatus;
  syncNow: (kind?: SyncKind) => Promise<SyncStatus>;
  schedulePush: (kind: SyncKind) => void;
  deleteSyncedCopy: () => Promise<SyncStatus>;
};

let fetcher: SyncApiFetch = apiFetch;
let activeUser: SessionUser | null = null;
let currentStatus: SyncStatus = "idle";
let initialSyncedUserId: string | null = null;
let suppressPushEvents = 0;
const statusListeners = new Set<() => void>();
const timers: Partial<Record<SyncStore, ReturnType<typeof setTimeout>>> = {};

function setStatus(status: SyncStatus) {
  currentStatus = status;
  for (const listener of statusListeners) listener();
}

function storesFor(kind: SyncKind): SyncStore[] {
  return kind === "all" ? ["prefs", "profile"] : [kind];
}

function validDateMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function timestampAfter(a: string | undefined, b: string | undefined, now: string): string {
  const maxExisting = Math.max(validDateMs(a) ?? 0, validDateMs(b) ?? 0);
  const nowMs = validDateMs(now);
  if (nowMs !== null && nowMs > maxExisting) return now;
  return new Date(maxExisting === 0 ? Date.now() : maxExisting + 1).toISOString();
}

function copyPrefs(input: UserPrefs, updatedAt: string): SyncedUserPrefs {
  const out: SyncedUserPrefs = {
    version: 1,
    updatedAt,
    shortlist: [...(input.shortlist ?? [])].slice(0, MAX_PREF_SHORTLIST),
    recent: [...(input.recent ?? [])],
    savedChecks: [...(input.savedChecks ?? [])].slice(0, MAX_PREF_SAVED_CHECKS),
  };
  if (input.weights) out.weights = { ...input.weights };
  if (input.interestView) out.interestView = input.interestView;
  if ("alertEmail" in input) out.alertEmail = input.alertEmail ?? null;
  if (typeof input.colorblindRamp === "boolean") out.colorblindRamp = input.colorblindRamp;
  if (input.buyerProfile) out.buyerProfile = input.buyerProfile;
  return out;
}

function isPristinePrefs(prefs: UserPrefs | null): boolean {
  if (!prefs) return true;
  return (
    !prefs.weights &&
    !prefs.interestView &&
    prefs.shortlist.length === 0 &&
    prefs.recent.length === 0 &&
    prefs.savedChecks.length === 0 &&
    !prefs.alertEmail &&
    prefs.colorblindRamp !== true &&
    !prefs.buyerProfile
  );
}

function unionStrings(primary: string[], secondary: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of [...primary, ...secondary]) {
    if (out.length >= cap) break;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function unionSavedChecks(
  primary: SavedCheck[],
  secondary: SavedCheck[],
  cap: number
): SavedCheck[] {
  const out: SavedCheck[] = [];
  const seen = new Set<string>();
  for (const check of [...primary, ...secondary]) {
    if (out.length >= cap) break;
    if (seen.has(check.id)) continue;
    seen.add(check.id);
    out.push(check);
  }
  return out;
}

function unionClients(primary: AgentClient[] = [], secondary: AgentClient[] = []): AgentClient[] {
  const out: AgentClient[] = [];
  const seen = new Set<string>();
  for (const client of [...primary, ...secondary]) {
    if (out.length >= MAX_CLIENTS) break;
    if (seen.has(client.id)) continue;
    seen.add(client.id);
    out.push(client);
  }
  return out;
}

export function mergeProfiles(
  local: UserProfile | null,
  server: UserProfile | null
): UserProfile | null {
  if (!server) return local;
  if (!local) return server;

  if (server.type !== "agent" || local.type !== "agent") {
    return server;
  }

  const clients = unionClients(server.clients, local.clients);
  if (clients.length === 0) return { ...server, clients: undefined, activeClientId: undefined };
  const activeClientId = clients.some((c) => c.id === server.activeClientId)
    ? server.activeClientId
    : clients[0]!.id;
  return { ...server, clients, activeClientId };
}

export function mergePrefs(
  local: UserPrefs | null,
  server: SyncedUserPrefs | null,
  now: string = new Date().toISOString()
): SyncedUserPrefs | null {
  if (!server) {
    return isPristinePrefs(local)
      ? null
      : copyPrefs(local!, local!.updatedAt ?? now);
  }
  if (isPristinePrefs(local)) return server;

  const localPrefs = copyPrefs(local!, local!.updatedAt ?? now);
  const localMs = validDateMs(localPrefs.updatedAt) ?? 0;
  const serverMs = validDateMs(server.updatedAt) ?? 0;
  const winner = localMs > serverMs ? localPrefs : copyPrefs(server, server.updatedAt);
  const loser = winner === localPrefs ? server : localPrefs;
  const merged: SyncedUserPrefs = {
    ...winner,
    shortlist: unionStrings(winner.shortlist, loser.shortlist, MAX_PREF_SHORTLIST),
    savedChecks: unionSavedChecks(
      winner.savedChecks ?? [],
      loser.savedChecks ?? [],
      MAX_PREF_SAVED_CHECKS
    ),
    updatedAt: timestampAfter(localPrefs.updatedAt, server.updatedAt, now),
  };
  return merged;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stalePrefsServer(err: unknown): SyncedUserPrefs | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  if (!isObject(err.body) || !isObject(err.body.server)) return null;
  const server = err.body.server as Partial<SyncedUserPrefs>;
  return server.version === 1 &&
    typeof server.updatedAt === "string" &&
    Array.isArray(server.shortlist) &&
    Array.isArray(server.recent) &&
    Array.isArray(server.savedChecks)
    ? (server as SyncedUserPrefs)
    : null;
}

function isOfflineError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || err.status === 503);
}

function applyPrefs(payload: SyncedUserPrefs) {
  runWithoutSyncPush(() => saveUserPrefs(payload, { preserveUpdatedAt: true }));
}

function applyProfile(profile: UserProfile | null) {
  runWithoutSyncPush(() => {
    if (profile) {
      saveProfile(profile);
    } else {
      clearProfile();
    }
  });
}

function defaultPrefsPayload(now = new Date().toISOString()): SyncedUserPrefs {
  return { ...DEFAULT_PREFS, updatedAt: now };
}

function defaultProfilePayload(user: SessionUser, now = new Date().toISOString()): UserProfile {
  return { version: 1, type: user.kind, createdAt: now };
}

async function putPrefs(payload: SyncedUserPrefs, retry = true): Promise<SyncedUserPrefs> {
  try {
    return await fetcher<SyncedUserPrefs>("/api/prefs", { method: "PUT", json: payload });
  } catch (err) {
    const server = stalePrefsServer(err);
    if (!retry || !server) throw err;
    const merged = mergePrefs(payload, server);
    if (!merged) throw err;
    applyPrefs(merged);
    return putPrefs(merged, false);
  }
}

async function putProfile(payload: UserProfile): Promise<UserProfile> {
  return fetcher<UserProfile>("/api/profile", { method: "PUT", json: payload });
}

async function syncPrefsFull() {
  const server = await fetcher<SyncedUserPrefs | null>("/api/prefs");
  const local = loadUserPrefs();
  if (!server) {
    if (isPristinePrefs(local)) return;
    applyPrefs(await putPrefs(copyPrefs(local, local.updatedAt ?? new Date().toISOString())));
    return;
  }
  if (isPristinePrefs(local)) {
    applyPrefs(server);
    return;
  }
  const merged = mergePrefs(local, server);
  if (!merged) return;
  applyPrefs(merged);
  applyPrefs(await putPrefs(merged));
}

async function syncProfileFull() {
  const server = await fetcher<UserProfile | null>("/api/profile");
  const local = loadProfile();
  if (!server) {
    if (!local) return;
    applyProfile(await putProfile(local));
    return;
  }
  if (!local) {
    applyProfile(server);
    return;
  }
  const merged = mergeProfiles(local, server);
  if (!merged) return;
  applyProfile(merged);
  applyProfile(await putProfile(merged));
}

async function pushPrefs() {
  const local = loadUserPrefs();
  const payload = copyPrefs(local, local.updatedAt ?? new Date().toISOString());
  applyPrefs(await putPrefs(payload));
}

async function pushProfile() {
  if (!activeUser) return;
  const local = loadProfile() ?? defaultProfilePayload(activeUser);
  applyProfile(await putProfile(local));
}

async function runSync(kind: SyncKind, mode: "full" | "push"): Promise<SyncStatus> {
  if (!activeUser) return "idle";
  setStatus("syncing");
  try {
    for (const store of storesFor(kind)) {
      if (mode === "push") {
        if (store === "prefs") await pushPrefs();
        if (store === "profile") await pushProfile();
      } else {
        if (store === "prefs") await syncPrefsFull();
        if (store === "profile") await syncProfileFull();
      }
    }
    setStatus("synced");
    return "synced";
  } catch (err) {
    const status = isOfflineError(err) ? "offline" : "error";
    setStatus(status);
    return status;
  }
}

export function syncNow(kind: SyncKind = "all"): Promise<SyncStatus> {
  return runSync(kind, "full");
}

export function schedulePush(kind: SyncKind): void {
  if (!activeUser || suppressPushEvents > 0) return;
  for (const store of storesFor(kind)) {
    if (timers[store]) clearTimeout(timers[store]);
    timers[store] = setTimeout(() => {
      timers[store] = undefined;
      void runSync(store, "push");
    }, PUSH_DEBOUNCE_MS);
  }
}

export function runWithoutSyncPush<T>(fn: () => T): T {
  suppressPushEvents += 1;
  try {
    return fn();
  } finally {
    suppressPushEvents -= 1;
  }
}

export async function deleteSyncedCopy(): Promise<SyncStatus> {
  if (!activeUser) return "idle";
  setStatus("syncing");
  try {
    await putPrefs(defaultPrefsPayload());
    await putProfile(defaultProfilePayload(activeUser));
    setStatus("synced");
    return "synced";
  } catch (err) {
    const status = isOfflineError(err) ? "offline" : "error";
    setStatus(status);
    return status;
  }
}

export function useAccountSync(session: SessionState): SyncController {
  const [status, setStatusState] = useState<SyncStatus>(currentStatus);
  const sessionStatus = session.status;
  const userId = session.status === "signed-in" ? session.user.id : null;
  const userEmail = session.status === "signed-in" ? session.user.email : "";
  const userKind = session.status === "signed-in" ? session.user.kind : "buyer";

  useEffect(() => {
    const listener = () => setStatusState(currentStatus);
    statusListeners.add(listener);
    return () => {
      statusListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (sessionStatus !== "signed-in" || !userId) {
      activeUser = null;
      for (const store of storesFor("all")) {
        if (timers[store]) clearTimeout(timers[store]);
        timers[store] = undefined;
      }
      setStatus(sessionStatus === "unavailable" ? "offline" : "idle");
      return;
    }

    const user: SessionUser = { id: userId, email: userEmail, kind: userKind };
    activeUser = user;
    const onPrefs = () => schedulePush("prefs");
    const onProfile = () => schedulePush("profile");
    window.addEventListener(PREFS_CHANGED_EVENT, onPrefs);
    window.addEventListener(PROFILE_CHANGED_EVENT, onProfile);
    if (initialSyncedUserId !== user.id) {
      void syncNow("all").then((next) => {
        if (next === "synced") initialSyncedUserId = user.id;
      });
    }
    return () => {
      window.removeEventListener(PREFS_CHANGED_EVENT, onPrefs);
      window.removeEventListener(PROFILE_CHANGED_EVENT, onProfile);
    };
  }, [sessionStatus, userEmail, userId, userKind]);

  return {
    status,
    syncNow,
    schedulePush,
    deleteSyncedCopy,
  };
}

export function __setApiFetchForTests(next: SyncApiFetch) {
  fetcher = next;
}

export function __setSyncSessionForTests(user: SessionUser | null) {
  activeUser = user;
}

export function __resetSyncForTests() {
  fetcher = apiFetch;
  activeUser = null;
  initialSyncedUserId = null;
  suppressPushEvents = 0;
  setStatus("idle");
  for (const store of storesFor("all")) {
    if (timers[store]) clearTimeout(timers[store]);
    timers[store] = undefined;
  }
  statusListeners.clear();
}
