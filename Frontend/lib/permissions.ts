"use client";

import { useEffect, useState } from "react";
import apiClient from "@/lib/apiClient";

/**
 * The signed-in user's effective permissions. Buttons for restricted actions
 * can stay visible — the server still asks for manager approval — but screens
 * use this to label them ("needs approval") or hide admin-only areas.
 */

type PermissionMap = Record<string, boolean>;

type PermState = { role: string; permissions: PermissionMap } | null;

let cache: PermState = null;
let cacheToken: string | null = null;
let inflight: Promise<PermState> | null = null;
const listeners = new Set<() => void>();

const currentToken = () => {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
};

export function loadPermissions(force = false) {
  // A different user signed in on this device → drop the old user's permissions.
  if (cache && cacheToken !== currentToken()) cache = null;
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight || force) {
    inflight = apiClient
      .get("/permissions/me")
      .then((r) => {
        cache = r.data.data;
        cacheToken = currentToken();
        listeners.forEach((l) => l());
        return cache;
      })
      .catch(() => cache)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function clearPermissions() {
  cache = null;
  cacheToken = null;
}

export function usePermissions() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    loadPermissions();
    return () => {
      listeners.delete(l);
    };
  }, []);
  const role = cache?.role ?? (typeof window !== "undefined" ? localStorage.getItem("role") : null);
  return {
    ready: !!cache,
    role,
    can: (key: string) => role === "SUPER_ADMIN" || !!cache?.permissions?.[key],
  };
}
