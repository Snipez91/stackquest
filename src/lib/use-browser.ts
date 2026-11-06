"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** The browser's IANA time zone; "UTC" during server render (no hydration mismatch). */
export function useBrowserTimeZone(): string {
  return useSyncExternalStore(
    noop,
    () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        return "UTC";
      }
    },
    () => "UTC",
  );
}

export function useOrigin(): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => "");
}
