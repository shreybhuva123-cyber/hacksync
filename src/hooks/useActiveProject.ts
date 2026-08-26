import { useSyncExternalStore, useCallback } from "react";

const STORAGE_KEY = "hacksync:active-project-id";

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emitChange() {
  listeners.forEach((cb) => cb());
}

export function getActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setActiveProjectId(id: string) {
  localStorage.setItem(STORAGE_KEY, id);
  emitChange();
}

export function clearActiveProjectId() {
  localStorage.removeItem(STORAGE_KEY);
  emitChange();
}

/** React hook that reactively reads + writes the active project id. */
export function useActiveProjectId(): [string | null, (id: string) => void] {
  const value = useSyncExternalStore(subscribe, getActiveProjectId, () => null);
  const setter = useCallback((id: string) => setActiveProjectId(id), []);
  return [value, setter];
}
